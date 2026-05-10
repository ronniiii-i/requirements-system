from uuid import UUID
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

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

from datetime import timezone
router = APIRouter(prefix="/api/rasa", tags=["Rasa / Chat"])


def get_project_or_404(project_id: UUID, user: User, db: Session) -> Project:
    if (
        project := db.query(Project)
        .filter(
            Project.id == project_id,
            Project.owner_id == user.id,
        )
        .first()
    ):
        return project
    else:
        raise HTTPException(status_code=404, detail="Project not found")


@router.post("/session", response_model=SessionInitResponse, status_code=status.HTTP_201_CREATED)
def init_rasa_session(
    payload: SessionInitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_or_404(payload.project_id, current_user, db)

    conversation = Conversation(
        project_id=payload.project_id,
        user_id=current_user.id,
        status=ConversationStatus.active,
        context={"initiated_from": "web_chat"},
    )
    db.add(conversation)
    db.flush()  # get the UUID without committing

    # Use the conversation UUID as the Rasa session ID
    conversation.rasa_session_id = str(conversation.id)
    db.commit()
    db.refresh(conversation)

    return SessionInitResponse(
        conversation_id=conversation.id,
        rasa_session_id=conversation.rasa_session_id,
        project_id=payload.project_id,
        started_at=conversation.started_at,
    )


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
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.user_id == current_user.id,
    ).first()
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
    db.commit()

    return {"status": "stored", "message_id": str(message.id)}


@router.patch("/conversations/{conversation_id}/end")
def end_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.user_id == current_user.id,
    ).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conversation.status = ConversationStatus.completed
    conversation.ended_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "completed", "conversation_id": str(conversation_id)}


@router.get("/conversations/{conversation_id}", response_model=ConversationHistoryOut)
def get_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.user_id == current_user.id,
    ).first()
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



@router.get("/projects/{project_id}/conversations", response_model=list[ConversationOut])
def list_conversations(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project_or_404(project_id, current_user, db)

    return (
        db.query(Conversation)
        .join(Message, Message.conversation_id == Conversation.id)
        .filter(
            Conversation.project_id == project_id,
            Conversation.user_id == current_user.id,
            Message.sender == MessageSender.user,
        )
        .group_by(Conversation.id)
        .order_by(Conversation.started_at.desc())
        .all()
    )