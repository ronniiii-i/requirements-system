from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class UserStoryCreate(BaseModel):
    raw_text: str
    domain_context: Optional[str] = None


class UserStoryOut(BaseModel):
    id: UUID
    project_id: UUID
    raw_text: str
    domain_context: Optional[str]
    goals: Optional[list[str]]
    actors: Optional[list[str]]
    constraints: Optional[list[str]]
    processed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class NlpJobOut(BaseModel):
    id: UUID
    user_story_id: UUID
    model_used: Optional[str] = None
    tokens: Optional[list[str]] = None
    named_entities: Optional[list] = []
    processing_time_ms: Optional[int] = None
    success: bool
    error_message: Optional[str] = None
    created_at: datetime
    actors: Optional[list[str]] = []
    goals: Optional[list[str]] = []
    constraints: Optional[list[str]] = []
    requirement_type: Optional[str] = None
    requirement_type_confidence: Optional[float] = None
    extracted_requirements: Optional[list] = []

    model_config = {"from_attributes": True}


class UserStoryWithNlp(BaseModel):
    user_story: UserStoryOut
    nlp_job: Optional[NlpJobOut]
