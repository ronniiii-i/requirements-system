# Import all models here so SQLAlchemy registers them
# This file must be imported before any DB operations

from app.models.enums import (
    UserRole, ProjectStatus, RequirementType, RequirementStatus,
    PriorityLevel, ConversationStatus, MessageSender, ReviewDecision,
    ExportFormat, ChangeType, NfrCategory,
)
from app.models.user_project import User, Project, ProjectMember
from app.models.conversation import Conversation, Message
from app.models.nlp import UserStory, NlpJob
from app.models.requirement import Requirement, NfrDetail, RequirementDependency
from app.models.traceability import Review, AuditLog, TraceabilityMatrix, Export

__all__ = [
    "User", "Project", "ProjectMember",
    "Conversation", "Message",
    "UserStory", "NlpJob",
    "Requirement", "NfrDetail", "RequirementDependency",
    "Review", "AuditLog", "TraceabilityMatrix", "Export",
]
