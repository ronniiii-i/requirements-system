from uuid import UUID
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel
from app.models.enums import RequirementType, RequirementStatus, PriorityLevel, ChangeType


# ═════════════════════════════════════════════════════════════════════════════
#  RTM SCHEMAS
# ═════════════════════════════════════════════════════════════════════════════

class RTMRow(BaseModel):
    """
    A single row in the Requirements Traceability Matrix.

    Backward traceability  → user_story_id / user_story_text
                             (where did this requirement come from?)
    Forward traceability   → test_case_ref / implementation_ref
                             (has this requirement been built and tested?)
    """
    # Requirement fields
    req_id: str
    requirement_id: UUID
    title: str
    type: RequirementType
    status: RequirementStatus
    priority: PriorityLevel

    # Backward traceability — source
    user_story_id: Optional[UUID] = None
    user_story_text: Optional[str] = None          # First 200 chars of the original story

    # Forward traceability — verification
    test_case_ref: Optional[str] = None            # e.g. "TC-042" or Jira ticket ID
    implementation_ref: Optional[str] = None       # e.g. Git PR URL or module name
    verification_method: Optional[str] = None      # test | inspection | analysis | demonstration
    verified: bool = False
    notes: Optional[str] = None

    # RTM entry ID (null if this requirement has no RTM row yet)
    rtm_id: Optional[UUID] = None

    model_config = {"from_attributes": True}


class RTMOut(BaseModel):
    """Full RTM response for a project, with coverage statistics."""
    project_id: UUID
    total_requirements: int
    verified_count: int
    unverified_count: int
    coverage_percent: float             # verified / total * 100
    rows: list[RTMRow]


class RTMEntryUpdate(BaseModel):
    """
    Fields an engineer can update on an RTM entry.
    Used to mark a requirement as verified and link it to
    its test case and implementation artefact.
    """
    test_case_ref: Optional[str] = None
    implementation_ref: Optional[str] = None
    verification_method: Optional[str] = None
    verified: Optional[bool] = None
    notes: Optional[str] = None


# ═════════════════════════════════════════════════════════════════════════════
#  VERSION HISTORY SCHEMAS
# ═════════════════════════════════════════════════════════════════════════════

class RequirementVersionOut(BaseModel):
    """
    Snapshot of a requirement at a specific version.
    The full list ordered by version desc shows the complete edit history.
    """
    id: UUID
    req_id: str
    version: int
    is_current_version: bool

    # Key fields to diff between versions
    title: str
    statement: str
    type: RequirementType
    status: RequirementStatus
    priority: PriorityLevel
    rationale: Optional[str]
    fit_criterion: Optional[str]

    # Scores at this version
    overall_quality_score: Optional[float]
    weighted_score: Optional[float]

    ai_generated: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ═════════════════════════════════════════════════════════════════════════════
#  IMPACT ANALYSIS SCHEMAS
# ═════════════════════════════════════════════════════════════════════════════

class ImpactAnalysisOut(BaseModel):
    """
    Change impact analysis result for a single requirement.

    depends_on      — upstream requirements: if those change, this is affected
    depended_on_by  — downstream requirements: if this changes, those are affected
    """
    requirement_id: UUID
    req_id: str
    title: str
    depends_on: list[dict[str, Any]]        # upstream
    depended_on_by: list[dict[str, Any]]    # downstream
    total_upstream: int
    total_downstream: int
    impact_summary: str                     # Plain-English summary for display / paper


# ═════════════════════════════════════════════════════════════════════════════
#  AUDIT LOG SCHEMAS
# ═════════════════════════════════════════════════════════════════════════════

class AuditLogEntryOut(BaseModel):
    """A single audit log entry — one recorded change event."""
    id: UUID
    project_id: UUID
    requirement_id: Optional[UUID]
    req_id_label: Optional[str]         # Human-readable req_id resolved from UUID
    changed_by: Optional[UUID]
    change_type: ChangeType
    field_changed: Optional[str]
    old_value: Optional[str]
    new_value: Optional[str]
    change_reason: Optional[str]
    snapshot: Optional[dict[str, Any]]  # Full requirement state at time of change
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogOut(BaseModel):
    """Paginated audit log response."""
    project_id: UUID
    total: int                          # Total entries matching the filter
    returned: int                       # Entries in this response
    offset: int
    entries: list[AuditLogEntryOut]
