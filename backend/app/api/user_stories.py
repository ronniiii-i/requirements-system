from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user_project import User, Project
from app.models.nlp import UserStory, NlpJob
from app.models.requirement import Requirement
from app.models.traceability import TraceabilityMatrix
from app.schemas.user_story import UserStoryCreate, UserStoryOut, UserStoryWithNlp
from app.services.nlp_service import call_nlp_pipeline
from app.services.requirement_service import generate_requirements_from_nlp


router = APIRouter(prefix="/api/projects/{project_id}/stories", tags=["User Stories"])


def get_project_or_404(project_id: UUID, user: User, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def run_nlp_and_store(
    user_story_id: UUID,
    raw_text: str,
    domain_context: str | None,
    submitted_by: UUID,
    db: Session,
):
    result = await call_nlp_pipeline(raw_text, domain_context)

    if result["success"]:
        data = result["data"]
        nlp_job = NlpJob(
            user_story_id=user_story_id,
            model_used=data.get("model_used"),
            spacy_output={
                "tokens": data.get("tokens", []),
                "named_entities": data.get("named_entities", []),
                "dependency_parse": data.get("dependency_parse", []),
            },
            transformer_output={
                "extracted_requirements": data.get("extracted_requirements", []),
                "requirement_type": data.get("requirement_type"),
                "requirement_type_confidence": data.get("requirement_type_confidence"),
            },
            tokens=data.get("tokens", []),
            named_entities=data.get("named_entities", []),
            dependency_parse={"parse": data.get("dependency_parse", [])},
            processing_time_ms=data.get("processing_time_ms"),
            success=True,
        )

        story = db.query(UserStory).filter(UserStory.id == user_story_id).first()
        if story:
            story.actors = data.get("actors", [])
            story.goals = data.get("goals", [])
            story.constraints = data.get("constraints", [])
            story.processed = True

        db.add(nlp_job)
        db.flush()

        if story:
            generate_requirements_from_nlp(nlp_job, story, submitted_by, db)

    else:
        nlp_job = NlpJob(
            user_story_id=user_story_id,
            success=False,
            error_message=result.get("error"),
        )
        db.add(nlp_job)
        db.commit()


# ── Submit story ──────────────────────────────────────────────────────────────

@router.post("", response_model=UserStoryOut, status_code=status.HTTP_201_CREATED)
async def submit_user_story(
    project_id: UUID,
    payload: UserStoryCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_or_404(project_id, current_user, db)

    story = UserStory(
        project_id=project_id,
        submitted_by=current_user.id,
        raw_text=payload.raw_text,
        domain_context=payload.domain_context,
        processed=False,
    )
    db.add(story)
    db.commit()
    db.refresh(story)

    background_tasks.add_task(
        run_nlp_and_store,
        story.id,
        story.raw_text,
        story.domain_context,
        current_user.id,
        db,
    )

    return story


# ── List stories ──────────────────────────────────────────────────────────────

@router.get("", response_model=list[UserStoryOut])
def list_stories(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_or_404(project_id, current_user, db)
    return db.query(UserStory).filter(
        UserStory.project_id == project_id
    ).order_by(UserStory.created_at.desc()).all()


# ── Get single story ──────────────────────────────────────────────────────────

@router.get("/{story_id}", response_model=UserStoryWithNlp)
def get_story(
    project_id: UUID,
    story_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_or_404(project_id, current_user, db)

    story = db.query(UserStory).filter(
        UserStory.id == story_id,
        UserStory.project_id == project_id,
    ).first()
    if not story:
        raise HTTPException(status_code=404, detail="User story not found")

    nlp_job = db.query(NlpJob).filter(
        NlpJob.user_story_id == story_id
    ).order_by(NlpJob.created_at.desc()).first()

    nlp_data = None
    if nlp_job:
        transformer = nlp_job.transformer_output or {}
        spacy_out = nlp_job.spacy_output or {}
        nlp_data = {
            "id": nlp_job.id,
            "user_story_id": nlp_job.user_story_id,
            "model_used": nlp_job.model_used,
            "tokens": nlp_job.tokens,
            "named_entities": spacy_out.get("named_entities", []),
            "processing_time_ms": nlp_job.processing_time_ms,
            "success": nlp_job.success,
            "error_message": nlp_job.error_message,
            "created_at": nlp_job.created_at,
            "actors": story.actors or [],
            "goals": story.goals or [],
            "constraints": story.constraints or [],
            "requirement_type": transformer.get("requirement_type"),
            "requirement_type_confidence": transformer.get("requirement_type_confidence"),
            "extracted_requirements": transformer.get("extracted_requirements", []),
        }

    return {"user_story": story, "nlp_job": nlp_data}


# ── Delete story ──────────────────────────────────────────────────────────────

@router.delete("/{story_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_story(
    project_id: UUID,
    story_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Deletes a user story and all derived artefacts in the correct order:
      1. RTM entries for requirements from this story
      2. Requirements (all versions)
      3. NLP jobs (must be deleted before the story to avoid the NOT NULL
         violation that occurs when SQLAlchemy tries to SET user_story_id=NULL
         instead of letting Postgres CASCADE — the ORM relationship is missing
         passive_deletes so we handle it explicitly here)
      4. The story itself
    """
    get_project_or_404(project_id, current_user, db)

    story = db.query(UserStory).filter(
        UserStory.id == story_id,
        UserStory.project_id == project_id,
    ).first()
    if not story:
        raise HTTPException(status_code=404, detail="User story not found")

    # 1. Delete RTM entries for requirements derived from this story
    reqs = db.query(Requirement).filter(Requirement.user_story_id == story_id).all()
    for req in reqs:
        rtm = db.query(TraceabilityMatrix).filter(
            TraceabilityMatrix.requirement_id == req.id
        ).first()
        if rtm:
            db.delete(rtm)

    # 2. Delete all requirement rows (all versions)
    db.query(Requirement).filter(
        Requirement.user_story_id == story_id
    ).delete(synchronize_session=False)

    # 3. Explicitly delete NLP jobs BEFORE the story row is touched.
    #    The NlpJob.user_story_id column is NOT NULL in the DB, but the
    #    SQLAlchemy relationship lacks passive_deletes=True, so the ORM
    #    would try to SET user_story_id=NULL (causing IntegrityError) instead
    #    of relying on Postgres CASCADE. Deleting them manually avoids this.
    db.query(NlpJob).filter(
        NlpJob.user_story_id == story_id
    ).delete(synchronize_session=False)

    # 4. Delete the story itself
    db.delete(story)
    db.commit()