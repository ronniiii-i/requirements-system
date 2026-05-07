import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database import Base


class UserStory(Base):
    __tablename__ = "user_stories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="SET NULL")
    )
    submitted_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    domain_context: Mapped[str | None] = mapped_column(String(100))
    goals: Mapped[list | None] = mapped_column(ARRAY(Text))
    actors: Mapped[list | None] = mapped_column(ARRAY(Text))
    constraints: Mapped[list | None] = mapped_column(ARRAY(Text))
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    processed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="user_stories")
    nlp_jobs: Mapped[list["NlpJob"]] = relationship("NlpJob", back_populates="user_story")
    requirements: Mapped[list["Requirement"]] = relationship("Requirement", back_populates="user_story")


class NlpJob(Base):
    __tablename__ = "nlp_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_story_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_stories.id", ondelete="CASCADE"), nullable=False
    )
    model_used: Mapped[str | None] = mapped_column(String(100))
    spacy_output: Mapped[dict] = mapped_column(JSONB, default=dict)
    transformer_output: Mapped[dict] = mapped_column(JSONB, default=dict)
    tokens: Mapped[list | None] = mapped_column(ARRAY(Text))
    named_entities: Mapped[list] = mapped_column(JSONB, default=list)
    dependency_parse: Mapped[dict] = mapped_column(JSONB, default=dict)
    semantic_roles: Mapped[dict] = mapped_column(JSONB, default=dict)
    processing_time_ms: Mapped[int | None] = mapped_column(Integer)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    user_story: Mapped["UserStory"] = relationship("UserStory", back_populates="nlp_jobs")
    requirements: Mapped[list["Requirement"]] = relationship("Requirement", back_populates="nlp_job")
