from uuid import UUID
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel
from app.models.enums import (
    RequirementType, RequirementStatus, PriorityLevel
)


class RequirementOut(BaseModel):
    id: UUID
    project_id: UUID
    user_story_id: Optional[UUID]
    req_id: str
    title: str
    statement: str
    type: RequirementType
    rationale: Optional[str]
    fit_criterion: Optional[str]
    originator: Optional[str]
    status: RequirementStatus
    priority: PriorityLevel
    version: int
    ai_generated: bool
    ai_confidence: Optional[float]

    # QA scores
    ambiguity_score: Optional[float]
    completeness_score: Optional[float]
    consistency_score: Optional[float]
    testability_score: Optional[float]
    overall_quality_score: Optional[float]
    qa_issues: Optional[list[Any]] = []

    # Scoring
    business_value_score: Optional[int]
    risk_score: Optional[int]
    cost_effort_score: Optional[int]
    stakeholder_importance: Optional[int]
    weighted_score: Optional[float]

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RequirementUpdate(BaseModel):
    """What a human reviewer can change."""
    title: Optional[str] = None
    statement: Optional[str] = None
    rationale: Optional[str] = None
    fit_criterion: Optional[str] = None
    priority: Optional[PriorityLevel] = None
    status: Optional[RequirementStatus] = None
    business_value_score: Optional[int] = None
    risk_score: Optional[int] = None
    cost_effort_score: Optional[int] = None
    stakeholder_importance: Optional[int] = None


class RequirementSummary(BaseModel):
    """Lightweight version for list views."""
    id: UUID
    req_id: str
    title: str
    type: RequirementType
    status: RequirementStatus
    priority: PriorityLevel
    overall_quality_score: Optional[float]
    ai_confidence: Optional[float]
    created_at: datetime

    model_config = {"from_attributes": True}
