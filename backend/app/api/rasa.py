import re
import uuid
from uuid import UUID
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, text

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user_project import User, Project
from app.models.conversation import Conversation, Message
from app.models.enums import ConversationStatus, MessageSender
from app.schemas.rasa import (
    SessionInitRequest,
    SessionInitResponse,
    MessageStoreRequest,
    ConversationOut,
    ConversationHistoryOut,
)

router = APIRouter(prefix="/api/rasa", tags=["Rasa / Chat"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_project_or_404(project_id: UUID, user: User, db: Session) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.owner_id == user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _generate_title(text: str) -> str:
    """
    Generate a short human-readable title from the first user message.
    Tries to extract 'As a <actor>' pattern first, otherwise truncates.
    """
    text = text.strip()
    # Try "As a doctor, I want to..." → "Doctor: access dashboard"
    actor_match = re.search(r"as an?\s+([\w\s]+?)(?:,|\s+i\s+want)", text, re.IGNORECASE)
    goal_match = re.search(r"i want to\s+([\w\s,]+?)(?:\s+so that|\s+in order|\.|$)", text, re.IGNORECASE)

    if actor_match and goal_match:
        actor = actor_match.group(1).strip().title()
        goal = goal_match.group(1).strip()
        # Cap goal at 30 chars
        if len(goal) > 30:
            goal = goal[:30] + "…"
        return f"{actor}: {goal}"
    elif actor_match:
        actor = actor_match.group(1).strip().title()
        return f"Story — {actor}"
    else:
        # Plain truncation
        if len(text) > 50:
            return text[:50] + "…"
        return text


# ── Session init ──────────────────────────────────────────────────────────────

@router.post("/session", response_model=SessionInitResponse, status_code=status.HTTP_201_CREATED)
def init_rasa_session(
    payload: SessionInitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Creates a conversation record. The session is 'pending' until the user
    sends their first message. list_conversations filters out empty sessions
    so they don't appear in the sidebar.
    """
    get_project_or_404(payload.project_id, current_user, db)

    conversation = Conversation(
        project_id=payload.project_id,
        user_id=current_user.id,
        status=ConversationStatus.active,
        context={"initiated_from": "web_chat"},
    )
    db.add(conversation)
    db.flush()

    conversation.rasa_session_id = str(conversation.id)
    db.commit()
    db.refresh(conversation)

    return SessionInitResponse(
        conversation_id=conversation.id,
        rasa_session_id=conversation.rasa_session_id,
        project_id=payload.project_id,
        started_at=conversation.started_at,
    )


# ── Store message (also generates title on first user message) ────────────────

@router.post(
    "/conversations/{conversation_id}/messages",
    status_code=status.HTTP_201_CREATED,
)
def store_message(
    conversation_id: UUID,
    payload: MessageStoreRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    message = Message(
        conversation_id=conversation_id,
        sender=payload.sender,
        content=payload.content,
        intent=payload.intent,
        confidence=payload.confidence,
        entities=payload.entities or [],
    )
    db.add(message)
    db.flush()

    # Auto-generate title from the first user message if not already set
    if payload.sender == MessageSender.user and not conversation.title:
        user_msg_count = (
            db.query(func.count(Message.id))
            .filter(
                Message.conversation_id == conversation_id,
                Message.sender == MessageSender.user,
            )
            .scalar()
        )
        # user_msg_count is 1 now (the message we just flushed)
        if user_msg_count <= 1:
            conversation.title = _generate_title(payload.content)

    db.commit()
    return {"status": "stored", "message_id": str(message.id)}


# ── End conversation ──────────────────────────────────────────────────────────

@router.patch("/conversations/{conversation_id}/end")
def end_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conversation.status = ConversationStatus.completed
    conversation.ended_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "completed", "conversation_id": str(conversation_id)}


# ── Delete conversation ───────────────────────────────────────────────────────

@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify ownership first
    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
 
    # Use raw SQL — lets Postgres handle ON DELETE CASCADE on messages
    db.execute(
        text("DELETE FROM conversations WHERE id = :id"),
        {"id": str(conversation_id)},
    )
    db.commit()


# ── Get single conversation with messages ─────────────────────────────────────

@router.get("/conversations/{conversation_id}", response_model=ConversationHistoryOut)
def get_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .all()
    )

    return ConversationHistoryOut(
        conversation_id=conversation.id,
        project_id=conversation.project_id,
        status=conversation.status,
        started_at=conversation.started_at,
        ended_at=conversation.ended_at,
        messages=messages,
    )


# ── List conversations (ONLY those with at least one user message) ────────────

@router.get("/projects/{project_id}/conversations", response_model=list[ConversationOut])
def list_conversations(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Only returns conversations where the user has actually sent a message.
    This prevents ghost/empty sessions from appearing in the sidebar.
    """
    get_project_or_404(project_id, current_user, db)

    # Subquery: conversation IDs that have at least one user message
    has_user_msg = (
        db.query(Message.conversation_id)
        .filter(Message.sender == MessageSender.user)
        .subquery()
    )

    return (
        db.query(Conversation)
        .filter(
            Conversation.project_id == project_id,
            Conversation.user_id == current_user.id,
            Conversation.id.in_(has_user_msg),
        )
        .order_by(Conversation.started_at.desc())
        .all()
    )
