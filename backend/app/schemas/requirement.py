from uuid import UUID
from datetime import datetime
from typing import Optional, Any, List
from pydantic import BaseModel, Field
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

    # Prioritization scoring
    business_value_score: Optional[int]
    risk_score: Optional[int]
    cost_effort_score: Optional[int]
    stakeholder_importance: Optional[int]
    weighted_score: Optional[float]

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RequirementSummary(BaseModel):
    id: UUID
    req_id: str
    title: str
    type: RequirementType
    status: RequirementStatus
    priority: PriorityLevel
    overall_quality_score: Optional[float]
    weighted_score: Optional[float]      
    ai_confidence: Optional[float]
    created_at: datetime

    model_config = {"from_attributes": True}


class RequirementUpdate(BaseModel):
    title: Optional[str] = None
    statement: Optional[str] = None
    rationale: Optional[str] = None
    fit_criterion: Optional[str] = None
    priority: Optional[PriorityLevel] = None
    status: Optional[RequirementStatus] = None
    business_value_score: Optional[int] = Field(None, ge=1, le=5)
    risk_score: Optional[int] = Field(None, ge=1, le=5)
    cost_effort_score: Optional[int] = Field(None, ge=1, le=5)
    stakeholder_importance: Optional[int] = Field(None, ge=1, le=5)


class BulkScoreItem(BaseModel):
    req_id: str = Field(..., description="Human-readable req ID, e.g. 'FR-001'")
    business_value: int = Field(..., ge=1, le=5, description="Business value (1=low, 5=high)")
    risk: int = Field(..., ge=1, le=5, description="Risk score (1=low risk, 5=high risk)")
    cost_effort: int = Field(..., ge=1, le=5, description="Cost/effort (1=cheap, 5=expensive)")
    stakeholder_importance: int = Field(..., ge=1, le=5, description="Stakeholder importance (1=low, 5=critical)")


class BulkScorePayload(BaseModel):
    scores: List[BulkScoreItem]