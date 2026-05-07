import json
from decimal import Decimal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user_project import User, Project
from app.services.export_service import export_word, export_excel, export_json

router = APIRouter(prefix="/api/projects/{project_id}/export", tags=["Export"])


def get_project_or_404(project_id: UUID, user: User, db: Session) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/word")
def export_to_word(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all requirements as an IEEE 29148 formatted Word document."""
    project = get_project_or_404(project_id, current_user, db)
    doc_bytes = export_word(project, db)
    filename = f"{project.name.replace(' ', '_')}_SRS.docx"
    return Response(
        content=doc_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/excel")
def export_to_excel(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all requirements as a formatted Excel spreadsheet."""
    project = get_project_or_404(project_id, current_user, db)
    xlsx_bytes = export_excel(project, db)
    filename = f"{project.name.replace(' ', '_')}_requirements.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/json")
def export_to_json(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = get_project_or_404(project_id, current_user, db)
    data = export_json(project, db)
    filename = f"{project.name.replace(' ', '_')}_requirements.json"

    # Decimal isn't JSON serializable by default — convert to float
    json_str = json.dumps(data, default=lambda o: float(o) if isinstance(o, Decimal) else str(o))

    return Response(
        content=json_str,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )