from uuid import UUID
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel
from app.models.enums import ConversationStatus, MessageSender


# ── Request schemas ───────────────────────────────────────────────────────────

class SessionInitRequest(BaseModel):
    project_id: UUID


class MessageStoreRequest(BaseModel):
    sender: MessageSender
    content: str
    intent: Optional[str] = None
    confidence: Optional[float] = None
    entities: Optional[list[dict[str, Any]]] = []


# ── Response schemas ──────────────────────────────────────────────────────────

class SessionInitResponse(BaseModel):
    conversation_id: UUID
    rasa_session_id: str
    project_id: UUID
    started_at: datetime

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: UUID
    conversation_id: UUID
    sender: MessageSender
    content: str
    intent: Optional[str]
    confidence: Optional[float]
    entities: list[Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationOut(BaseModel):
    id: UUID
    project_id: UUID
    rasa_session_id: Optional[str]
    status: ConversationStatus
    # ── NEW: human-readable title (None if no messages yet) ──
    title: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ConversationHistoryOut(BaseModel):
    conversation_id: UUID
    project_id: UUID
    status: ConversationStatus
    title: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime]
    messages: list[MessageOut]

    model_config = {"from_attributes": True}
