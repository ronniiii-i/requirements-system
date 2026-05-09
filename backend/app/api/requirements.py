from uuid import UUID
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user_project import User, Project
from app.models.requirement import Requirement
from app.models.traceability import Review, TraceabilityMatrix
from app.models.enums import RequirementStatus, ReviewDecision, PriorityLevel
from app.schemas.requirement import RequirementOut, RequirementUpdate, RequirementSummary

router = APIRouter(prefix="/api/projects/{project_id}/requirements", tags=["Requirements"])



class ReviewPayload(BaseModel):
    decision: ReviewDecision
    comments: Optional[str] = None
    suggested_changes: Optional[str] = None


class BulkScoreItem(BaseModel):
    req_id: str = Field(..., examples=["FR-001"], description="Human-readable requirement ID, e.g. FR-001")
    business_value: int = Field(..., ge=1, le=5)
    risk: int = Field(..., ge=1, le=5)
    cost_effort: int = Field(..., ge=1, le=5)
    stakeholder_importance: int = Field(..., ge=1, le=5)


class BulkScorePayload(BaseModel):
    scores: List[BulkScoreItem]



def get_project_or_404(project_id: UUID, user: User, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _compute_weighted_score(bv: int, risk: int, cost: int, si: int) -> float:
    inverted_cost = 6 - cost
    return round(
        (bv * 0.4) + (risk * 0.2) + (inverted_cost * 0.2) + (si * 0.2),
        3,
    )


def _assign_moscow(requirements: list) -> None:
    scored = [r for r in requirements if r.weighted_score is not None]
    if not scored:
        return

    scored_sorted = sorted(scored, key=lambda r: float(r.weighted_score), reverse=True)
    n = len(scored_sorted)

    for i, req in enumerate(scored_sorted):
        percentile = i / n
        if percentile < 0.25:
            req.priority = PriorityLevel.must_have
        elif percentile < 0.50:
            req.priority = PriorityLevel.should_have
        elif percentile < 0.75:
            req.priority = PriorityLevel.could_have
        else:
            req.priority = PriorityLevel.wont_have



@router.get("", response_model=list[RequirementSummary])
def list_requirements(
    project_id: UUID,
    status: Optional[RequirementStatus] = None,
    type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_or_404(project_id, current_user, db)

    query = db.query(Requirement).filter(
        Requirement.project_id == project_id,
        Requirement.is_current_version == True,
    )
    if status:
        query = query.filter(Requirement.status == status)
    if type:
        query = query.filter(Requirement.type == type)

    return query.order_by(Requirement.created_at.asc()).all()


@router.get("/prioritized", response_model=list[RequirementOut])
def get_prioritized_requirements(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_or_404(project_id, current_user, db)

    return (
        db.query(Requirement)
        .filter(
            Requirement.project_id == project_id,
            Requirement.is_current_version == True,
        )
        .order_by(Requirement.weighted_score.desc().nulls_last())
        .all()
    )


@router.post("/prioritize", response_model=list[RequirementOut])
def bulk_prioritize(
    project_id: UUID,
    payload: BulkScorePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_or_404(project_id, current_user, db)

    submitted_req_ids = [item.req_id for item in payload.scores]

    reqs_in_batch = (
        db.query(Requirement)
        .filter(
            Requirement.project_id == project_id,
            Requirement.req_id.in_(submitted_req_ids),
            Requirement.is_current_version == True,
        )
        .all()
    )

    found_ids = {r.req_id for r in reqs_in_batch}
    not_found = [rid for rid in submitted_req_ids if rid not in found_ids]
    if not_found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Requirements not found in this project: {not_found}",
        )

    req_map = {r.req_id: r for r in reqs_in_batch}

    for item in payload.scores:
        req = req_map[item.req_id]
        req.business_value_score = item.business_value
        req.risk_score = item.risk
        req.cost_effort_score = item.cost_effort
        req.stakeholder_importance = item.stakeholder_importance
        req.weighted_score = _compute_weighted_score(
            item.business_value, item.risk, item.cost_effort, item.stakeholder_importance
        )

    all_current_reqs = (
        db.query(Requirement)
        .filter(
            Requirement.project_id == project_id,
            Requirement.is_current_version == True,
        )
        .all()
    )
    _assign_moscow(all_current_reqs)

    db.commit()

    for req in reqs_in_batch:
        db.refresh(req)

    return reqs_in_batch


@router.get("/{req_id}", response_model=RequirementOut)
def get_requirement(
    project_id: UUID,
    req_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_or_404(project_id, current_user, db)

    req = db.query(Requirement).filter(
        Requirement.id == req_id,
        Requirement.project_id == project_id,
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return req


@router.patch("/{req_id}", response_model=RequirementOut)
def update_requirement(
    project_id: UUID,
    req_id: UUID,
    payload: RequirementUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_or_404(project_id, current_user, db)

    req = db.query(Requirement).filter(
        Requirement.id == req_id,
        Requirement.project_id == project_id,
        Requirement.is_current_version == True,
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")

    # Fields that warrant a new version (content changes)
    VERSIONED_FIELDS = {"title", "statement", "rationale", "fit_criterion"}
    changes = payload.model_dump(exclude_none=True)
    creates_new_version = any(f in VERSIONED_FIELDS for f in changes)

    if creates_new_version:
        # Mark current row as no longer current
        req.is_current_version = False
        db.flush()

        # Create new version row copying all existing fields
        new_req = Requirement(
            project_id=req.project_id,
            user_story_id=req.user_story_id,
            nlp_job_id=req.nlp_job_id,
            req_id=req.req_id,              # Keep same human-readable ID
            title=req.title,
            statement=req.statement,
            type=req.type,
            rationale=req.rationale,
            fit_criterion=req.fit_criterion,
            originator=req.originator,
            status=req.status,
            priority=req.priority,
            version=req.version + 1,        # Increment version
            is_current_version=True,
            ai_generated=req.ai_generated,
            ai_confidence=req.ai_confidence,
            ambiguity_score=req.ambiguity_score,
            completeness_score=req.completeness_score,
            consistency_score=req.consistency_score,
            testability_score=req.testability_score,
            overall_quality_score=req.overall_quality_score,
            qa_issues=req.qa_issues,
            business_value_score=req.business_value_score,
            risk_score=req.risk_score,
            cost_effort_score=req.cost_effort_score,
            stakeholder_importance=req.stakeholder_importance,
            weighted_score=req.weighted_score,
            created_by=current_user.id,
        )

        # Apply the incoming changes on top of the copy
        for field, value in changes.items():
            setattr(new_req, field, value)

        db.add(new_req)
        db.flush()

        # Move RTM entry to point at new version
        rtm = db.query(TraceabilityMatrix).filter(
            TraceabilityMatrix.requirement_id == req.id
        ).first()
        if rtm:
            rtm.requirement_id = new_req.id

        # Recompute weighted score if scoring fields changed
        scores = [
            new_req.business_value_score,
            new_req.risk_score,
            new_req.cost_effort_score,
            new_req.stakeholder_importance,
        ]
        if all(s is not None for s in scores):
            from app.services.prioritization_service import compute_weighted_score, assign_moscow
            new_req.weighted_score = compute_weighted_score(
                new_req.business_value_score,
                new_req.risk_score,
                new_req.cost_effort_score,
                new_req.stakeholder_importance,
            )
            all_scored = db.query(Requirement).filter(
                Requirement.project_id == project_id,
                Requirement.is_current_version == True,
                Requirement.weighted_score.isnot(None),
            ).all()
            assign_moscow(all_scored)

        db.commit()
        db.refresh(new_req)
        return new_req

    else:
        # Non-content changes (status, priority, scores) — update in place
        for field, value in changes.items():
            setattr(req, field, value)

        scores = [
            req.business_value_score,
            req.risk_score,
            req.cost_effort_score,
            req.stakeholder_importance,
        ]
        if all(s is not None for s in scores):
            from app.services.prioritization_service import compute_weighted_score, assign_moscow
            req.weighted_score = compute_weighted_score(
                req.business_value_score,
                req.risk_score,
                req.cost_effort_score,
                req.stakeholder_importance,
            )
            all_scored = db.query(Requirement).filter(
                Requirement.project_id == project_id,
                Requirement.is_current_version == True,
                Requirement.weighted_score.isnot(None),
            ).all()
            assign_moscow(all_scored)

        db.commit()
        db.refresh(req)
        return req

@router.post("/{req_id}/review", response_model=RequirementOut)
def review_requirement(
    project_id: UUID,
    req_id: UUID,
    payload: ReviewPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_or_404(project_id, current_user, db)

    req = db.query(Requirement).filter(
        Requirement.id == req_id,
        Requirement.project_id == project_id,
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")

    # Update requirement status based on decision
    if payload.decision == ReviewDecision.approved:
        req.status = RequirementStatus.approved
    elif payload.decision == ReviewDecision.rejected:
        req.status = RequirementStatus.rejected
    elif payload.decision == ReviewDecision.needs_revision:
        req.status = RequirementStatus.under_review

    review = Review(
        requirement_id=req.id,
        reviewer_id=current_user.id,
        decision=payload.decision,
        comments=payload.comments,
        suggested_changes=payload.suggested_changes,
    )
    db.add(review)
    db.commit()
    db.refresh(req)
    return req