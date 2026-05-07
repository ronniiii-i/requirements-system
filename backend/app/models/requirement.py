import uuid
from datetime import datetime
from sqlalchemy import (
    String, Boolean, Integer, SmallInteger, Text,
    DateTime, Enum, ForeignKey, Numeric, CheckConstraint, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database import Base
from app.models.enums import (
    RequirementType, RequirementStatus, PriorityLevel, NfrCategory
)


class Requirement(Base):
    __tablename__ = "requirements"
    __table_args__ = (
        UniqueConstraint("project_id", "req_id", "version"),
        CheckConstraint("business_value_score BETWEEN 1 AND 5", name="chk_business_value"),
        CheckConstraint("risk_score BETWEEN 1 AND 5", name="chk_risk"),
        CheckConstraint("cost_effort_score BETWEEN 1 AND 5", name="chk_cost_effort"),
        CheckConstraint("stakeholder_importance BETWEEN 1 AND 5", name="chk_stakeholder"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False
    )
    user_story_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_stories.id", ondelete="SET NULL")
    )
    nlp_job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("nlp_jobs.id", ondelete="SET NULL")
    )

    # IEEE 29148 fields
    req_id: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[RequirementType] = mapped_column(
        Enum(RequirementType, name="requirement_type"), nullable=False
    )
    rationale: Mapped[str | None] = mapped_column(Text)
    fit_criterion: Mapped[str | None] = mapped_column(Text)
    originator: Mapped[str | None] = mapped_column(String(255))

    # Classification
    status: Mapped[RequirementStatus] = mapped_column(
        Enum(RequirementStatus, name="requirement_status"),
        nullable=False,
        default=RequirementStatus.draft,
    )
    priority: Mapped[PriorityLevel] = mapped_column(
        Enum(PriorityLevel, name="priority_level"),
        nullable=False,
        default=PriorityLevel.should_have,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_current_version: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Scoring
    business_value_score: Mapped[int | None] = mapped_column(SmallInteger)
    risk_score: Mapped[int | None] = mapped_column(SmallInteger)
    cost_effort_score: Mapped[int | None] = mapped_column(SmallInteger)
    stakeholder_importance: Mapped[int | None] = mapped_column(SmallInteger)
    weighted_score: Mapped[float | None] = mapped_column(Numeric(6, 3))

    # QA scores
    ambiguity_score: Mapped[float | None] = mapped_column(Numeric(5, 4))
    completeness_score: Mapped[float | None] = mapped_column(Numeric(5, 4))
    consistency_score: Mapped[float | None] = mapped_column(Numeric(5, 4))
    testability_score: Mapped[float | None] = mapped_column(Numeric(5, 4))
    overall_quality_score: Mapped[float | None] = mapped_column(Numeric(5, 4))
    qa_issues: Mapped[list] = mapped_column(JSONB, default=list)
    qa_confidence: Mapped[float | None] = mapped_column(Numeric(5, 4))

    # AI metadata
    ai_generated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ai_confidence: Mapped[float | None] = mapped_column(Numeric(5, 4))

    # Audit
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="requirements")
    user_story: Mapped["UserStory"] = relationship("UserStory", back_populates="requirements")
    nlp_job: Mapped["NlpJob"] = relationship("NlpJob", back_populates="requirements")
    nfr_details: Mapped["NfrDetail | None"] = relationship("NfrDetail", back_populates="requirement", uselist=False)
    reviews: Mapped[list["Review"]] = relationship("Review", back_populates="requirement")
    dependencies: Mapped[list["RequirementDependency"]] = relationship(
        "RequirementDependency",
        foreign_keys="RequirementDependency.requirement_id",
        back_populates="requirement",
    )
    traceability: Mapped["TraceabilityMatrix | None"] = relationship(
        "TraceabilityMatrix", back_populates="requirement", uselist=False
    )


class NfrDetail(Base):
    __tablename__ = "nfr_details"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirements.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    nfr_category: Mapped[NfrCategory] = mapped_column(
        Enum(NfrCategory, name="nfr_category"), nullable=False
    )
    metric: Mapped[str | None] = mapped_column(String(255))
    target_value: Mapped[str | None] = mapped_column(String(255))
    measurement_method: Mapped[str | None] = mapped_column(Text)

    # Relationships
    requirement: Mapped["Requirement"] = relationship("Requirement", back_populates="nfr_details")


class RequirementDependency(Base):
    __tablename__ = "requirement_dependencies"
    __table_args__ = (
        UniqueConstraint("requirement_id", "depends_on_id"),
        CheckConstraint("requirement_id != depends_on_id", name="chk_no_self_dependency"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirements.id", ondelete="CASCADE"), nullable=False
    )
    depends_on_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirements.id", ondelete="CASCADE"), nullable=False
    )
    dependency_type: Mapped[str] = mapped_column(String(50), default="depends_on")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    requirement: Mapped["Requirement"] = relationship(
        "Requirement", foreign_keys=[requirement_id], back_populates="dependencies"
    )
    depends_on: Mapped["Requirement"] = relationship(
        "Requirement", foreign_keys=[depends_on_id]
    )
