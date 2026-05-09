from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user_project import User, Project
from app.models.requirement import Requirement, RequirementDependency
from app.models.traceability import TraceabilityMatrix, AuditLog
from app.models.nlp import UserStory
from app.models.enums import ChangeType
from app.schemas.traceability import (
    RTMRow,
    RTMOut,
    RequirementVersionOut,
    ImpactAnalysisOut,
    AuditLogEntryOut,
    AuditLogOut,
    RTMEntryUpdate,
)

router = APIRouter(
    prefix="/api/projects/{project_id}",
    tags=["Traceability"],
)


def get_project_or_404(project_id: UUID, user: User, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == user.id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/rtm", response_model=RTMOut)
def get_rtm(
    project_id: UUID,
    verified: Optional[bool] = Query(None, description="Filter by verification status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_or_404(project_id, current_user, db)

    query = (
        db.query(Requirement, TraceabilityMatrix, UserStory)
        .outerjoin(
            TraceabilityMatrix,
            TraceabilityMatrix.requirement_id == Requirement.id,
        )
        .outerjoin(
            UserStory,
            UserStory.id == TraceabilityMatrix.user_story_id,
        )
        .filter(
            Requirement.project_id == project_id,
            Requirement.is_current_version == True,
        )
    )

    if verified is not None:
        query = query.filter(TraceabilityMatrix.verified == verified)

    rows = query.order_by(Requirement.req_id.asc()).all()

    rtm_rows = []
    for req, rtm, story in rows:
        rtm_rows.append(RTMRow(
            req_id=req.req_id,
            requirement_id=req.id,
            title=req.title,
            type=req.type,
            status=req.status,
            priority=req.priority,
            # Source traceability (backward)
            user_story_id=rtm.user_story_id if rtm else None,
            user_story_text=story.raw_text[:200] if story else None,
            # Forward traceability
            test_case_ref=rtm.test_case_ref if rtm else None,
            implementation_ref=rtm.implementation_ref if rtm else None,
            verification_method=rtm.verification_method if rtm else None,
            verified=rtm.verified if rtm else False,
            notes=rtm.notes if rtm else None,
            rtm_id=rtm.id if rtm else None,
        ))

    total = len(rtm_rows)
    verified_count = sum(1 for r in rtm_rows if r.verified)

    return RTMOut(
        project_id=project_id,
        total_requirements=total,
        verified_count=verified_count,
        unverified_count=total - verified_count,
        coverage_percent=round((verified_count / total * 100), 1) if total else 0.0,
        rows=rtm_rows,
    )


@router.patch("/rtm/{requirement_id}", response_model=RTMRow)
def update_rtm_entry(
    project_id: UUID,
    requirement_id: UUID,
    payload: RTMEntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update the forward-traceability fields of an RTM entry:
    test_case_ref, implementation_ref, verification_method, verified, notes.

    This is how engineers mark a requirement as verified and link it to
    its test case or implementation artefact (e.g. a Jira ticket, Git PR).
    """
    get_project_or_404(project_id, current_user, db)

    # Confirm requirement belongs to this project
    req = db.query(Requirement).filter(
        Requirement.id == requirement_id,
        Requirement.project_id == project_id,
        Requirement.is_current_version == True,
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")

    rtm = db.query(TraceabilityMatrix).filter(
        TraceabilityMatrix.requirement_id == requirement_id,
    ).first()

    if not rtm:
        # Create RTM entry if it doesn't exist (e.g. manually created requirements)
        rtm = TraceabilityMatrix(
            project_id=project_id,
            requirement_id=requirement_id,
            user_story_id=req.user_story_id,
        )
        db.add(rtm)

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(rtm, field, value)

    db.commit()
    db.refresh(rtm)

    story = None
    if rtm.user_story_id:
        story = db.query(UserStory).filter(UserStory.id == rtm.user_story_id).first()

    return RTMRow(
        req_id=req.req_id,
        requirement_id=req.id,
        title=req.title,
        type=req.type,
        status=req.status,
        priority=req.priority,
        user_story_id=rtm.user_story_id,
        user_story_text=story.raw_text[:200] if story else None,
        test_case_ref=rtm.test_case_ref,
        implementation_ref=rtm.implementation_ref,
        verification_method=rtm.verification_method,
        verified=rtm.verified,
        notes=rtm.notes,
        rtm_id=rtm.id,
    )


# ═════════════════════════════════════════════════════════════════════════════
#  2. REQUIREMENT VERSION HISTORY
#  GET /api/projects/{project_id}/requirements/{req_id}/history
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/requirements/{req_id}/history", response_model=list[RequirementVersionOut])
def get_requirement_history(
    project_id: UUID,
    req_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns all versions of a requirement in descending version order.

    The current version (is_current_version=True) appears first.
    Previous versions show the full requirement state at each point in time,
    enabling engineers to see exactly what changed between versions.

    Version history is stored as separate rows in the requirements table —
    each edit that increments version creates a new row with is_current_version=False
    on the old row and is_current_version=True on the new one.
    """
    get_project_or_404(project_id, current_user, db)

    # First confirm the req_id UUID exists in this project
    target = db.query(Requirement).filter(
        Requirement.id == req_id,
        Requirement.project_id == project_id,
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Requirement not found")

    # Fetch all versions by the human-readable req_id string (e.g. "FR-001")
    versions = (
        db.query(Requirement)
        .filter(
            Requirement.project_id == project_id,
            Requirement.req_id == target.req_id,
        )
        .order_by(Requirement.version.desc())
        .all()
    )

    return [
        RequirementVersionOut(
            id=r.id,
            req_id=r.req_id,
            version=r.version,
            is_current_version=r.is_current_version,
            title=r.title,
            statement=r.statement,
            type=r.type,
            status=r.status,
            priority=r.priority,
            rationale=r.rationale,
            fit_criterion=r.fit_criterion,
            overall_quality_score=r.overall_quality_score,
            weighted_score=float(r.weighted_score) if r.weighted_score else None,
            ai_generated=r.ai_generated,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in versions
    ]


# ═════════════════════════════════════════════════════════════════════════════
#  3. CHANGE IMPACT ANALYSIS
#  GET /api/projects/{project_id}/requirements/{req_id}/impact
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/requirements/{req_id}/impact", response_model=ImpactAnalysisOut)
def get_impact_analysis(
    project_id: UUID,
    req_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Change impact analysis for a requirement.

    Returns two dependency sets:
      - depends_on:     requirements THIS requirement depends on
                        (if those change, this one is affected)
      - depended_on_by: requirements that depend ON this one
                        (if THIS changes, those are affected)

    Also returns a plain-language impact_summary suitable for display
    in the frontend and for inclusion in your paper's evaluation section.

    The dependency data comes from the requirement_dependencies table,
    which engineers populate manually via the PATCH /{req_id} workflow.
    """
    get_project_or_404(project_id, current_user, db)

    req = db.query(Requirement).filter(
        Requirement.id == req_id,
        Requirement.project_id == project_id,
        Requirement.is_current_version == True,
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")

    # Requirements this one depends on (outgoing edges)
    outgoing = (
        db.query(RequirementDependency, Requirement)
        .join(Requirement, Requirement.id == RequirementDependency.depends_on_id)
        .filter(
            RequirementDependency.requirement_id == req_id,
            Requirement.is_current_version == True,
        )
        .all()
    )

    # Requirements that depend on this one (incoming edges)
    incoming = (
        db.query(RequirementDependency, Requirement)
        .join(Requirement, Requirement.id == RequirementDependency.requirement_id)
        .filter(
            RequirementDependency.depends_on_id == req_id,
            Requirement.is_current_version == True,
        )
        .all()
    )

    depends_on = [
        {
            "requirement_id": str(dep.depends_on_id),
            "req_id": r.req_id,
            "title": r.title,
            "status": r.status.value,
            "dependency_type": dep.dependency_type,
            "notes": dep.notes,
        }
        for dep, r in outgoing
    ]

    depended_on_by = [
        {
            "requirement_id": str(dep.requirement_id),
            "req_id": r.req_id,
            "title": r.title,
            "status": r.status.value,
            "dependency_type": dep.dependency_type,
            "notes": dep.notes,
        }
        for dep, r in incoming
    ]

    # Plain-language impact summary
    if not depends_on and not depended_on_by:
        summary = f"{req.req_id} has no recorded dependencies. Changes to it are self-contained."
    else:
        parts = []
        if depended_on_by:
            ids = ", ".join(d["req_id"] for d in depended_on_by)
            parts.append(
                f"Changing {req.req_id} will directly affect {len(depended_on_by)} "
                f"requirement(s): {ids}."
            )
        if depends_on:
            ids = ", ".join(d["req_id"] for d in depends_on)
            parts.append(
                f"{req.req_id} depends on {len(depends_on)} requirement(s): {ids}. "
                f"Changes to those upstream requirements may invalidate this one."
            )
        summary = " ".join(parts)

    return ImpactAnalysisOut(
        requirement_id=req_id,
        req_id=req.req_id,
        title=req.title,
        depends_on=depends_on,
        depended_on_by=depended_on_by,
        total_upstream=len(depends_on),
        total_downstream=len(depended_on_by),
        impact_summary=summary,
    )


# ═════════════════════════════════════════════════════════════════════════════
#  4. AUDIT LOG
#  GET /api/projects/{project_id}/audit-log
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/audit-log", response_model=AuditLogOut)
def get_audit_log(
    project_id: UUID,
    requirement_id: Optional[UUID] = Query(None, description="Filter to a single requirement"),
    change_type: Optional[ChangeType] = Query(None, description="Filter by change type"),
    limit: int = Query(100, ge=1, le=500, description="Max entries to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the immutable audit trail for all requirement changes in a project.

    The audit log is populated automatically by the PostgreSQL trigger
    `trg_audit_requirements` — it fires on every INSERT, UPDATE, and DELETE
    on the requirements table and records:
      - What changed (field_changed, old_value, new_value)
      - When it changed (created_at)
      - A full JSON snapshot of the requirement state at time of change

    Optional filters:
      - ?requirement_id=<uuid>  — scoped to one requirement
      - ?change_type=created|updated|status_changed|priority_changed|approved|rejected|deleted
      - ?limit=100&offset=0     — pagination

    This endpoint exposes what the DB trigger already records — no new writes.
    """
    get_project_or_404(project_id, current_user, db)

    query = db.query(AuditLog).filter(AuditLog.project_id == project_id)

    if requirement_id:
        query = query.filter(AuditLog.requirement_id == requirement_id)
    if change_type:
        query = query.filter(AuditLog.change_type == change_type)

    total = query.count()
    entries = (
        query.order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    # Enrich each entry with req_id string for display convenience
    # (audit_log only stores the UUID — we resolve the human-readable ID)
    req_id_cache: dict[UUID, str] = {}

    def resolve_req_id(rid: Optional[UUID]) -> Optional[str]:
        if not rid:
            return None
        if rid not in req_id_cache:
            r = db.query(Requirement.req_id).filter(Requirement.id == rid).first()
            req_id_cache[rid] = r[0] if r else str(rid)
        return req_id_cache[rid]

    log_entries = [
        AuditLogEntryOut(
            id=entry.id,
            project_id=entry.project_id,
            requirement_id=entry.requirement_id,
            req_id_label=resolve_req_id(entry.requirement_id),
            changed_by=entry.changed_by,
            change_type=entry.change_type,
            field_changed=entry.field_changed,
            old_value=entry.old_value,
            new_value=entry.new_value,
            change_reason=entry.change_reason,
            snapshot=entry.snapshot,
            created_at=entry.created_at,
        )
        for entry in entries
    ]

    return AuditLogOut(
        project_id=project_id,
        total=total,
        returned=len(log_entries),
        offset=offset,
        entries=log_entries,
    )
