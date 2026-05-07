from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.enums import ProjectStatus


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    domain: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    domain: Optional[str] = None
    status: Optional[ProjectStatus] = None


class ProjectOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    domain: Optional[str]
    status: ProjectStatus
    owner_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectSummary(BaseModel):
    id: UUID
    name: str
    domain: Optional[str]
    status: ProjectStatus
    created_at: datetime

    model_config = {"from_attributes": True}