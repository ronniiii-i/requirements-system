from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user_project import User, Project
from app.models.requirement import Requirement
from app.models.traceability import Review
from app.models.enums import RequirementStatus, ReviewDecision
from app.schemas.requirement import RequirementOut, RequirementUpdate, RequirementSummary
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/projects/{project_id}/requirements", tags=["Requirements"])


class ReviewPayload(BaseModel):
    decision: ReviewDecision
    comments: Optional[str] = None
    suggested_changes: Optional[str] = None


def get_project_or_404(project_id: UUID, user: User, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("", response_model=list[RequirementSummary])
def list_requirements(
    project_id: UUID,
    status: Optional[RequirementStatus] = None,
    type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all requirements for a project. Optionally filter by status or type."""
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
    """Engineer edits a requirement."""
    get_project_or_404(project_id, current_user, db)

    req = db.query(Requirement).filter(
        Requirement.id == req_id,
        Requirement.project_id == project_id,
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(req, field, value)

    # Recompute weighted score if scoring fields were updated
    scores = [
        req.business_value_score,
        req.risk_score,
        req.cost_effort_score,
        req.stakeholder_importance,
    ]
    if all(s is not None for s in scores):
        req.weighted_score = round(
            (req.business_value_score * 0.4)
            + (req.risk_score * 0.2)
            + (req.cost_effort_score * 0.2)
            + (req.stakeholder_importance * 0.2),
            3,
        )

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

    # Store the review record
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
