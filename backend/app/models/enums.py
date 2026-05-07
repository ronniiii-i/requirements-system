import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    requirement_engineer = "requirement_engineer"
    domain_expert = "domain_expert"
    stakeholder = "stakeholder"
    viewer = "viewer"


class ProjectStatus(str, enum.Enum):
    active = "active"
    archived = "archived"
    completed = "completed"
    on_hold = "on_hold"


class RequirementType(str, enum.Enum):
    functional = "functional"
    non_functional = "non_functional"
    constraint = "constraint"
    interface = "interface"
    performance = "performance"
    security = "security"
    usability = "usability"
    reliability = "reliability"
    maintainability = "maintainability"
    portability = "portability"


class RequirementStatus(str, enum.Enum):
    draft = "draft"
    under_review = "under_review"
    approved = "approved"
    rejected = "rejected"
    deprecated = "deprecated"
    implemented = "implemented"


class PriorityLevel(str, enum.Enum):
    must_have = "must_have"
    should_have = "should_have"
    could_have = "could_have"
    wont_have = "wont_have"


class ConversationStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    abandoned = "abandoned"


class MessageSender(str, enum.Enum):
    user = "user"
    bot = "bot"


class ReviewDecision(str, enum.Enum):
    approved = "approved"
    rejected = "rejected"
    needs_revision = "needs_revision"


class ExportFormat(str, enum.Enum):
    json = "json"
    excel = "excel"
    word = "word"
    pdf = "pdf"
    jira = "jira"
    doors = "doors"


class ChangeType(str, enum.Enum):
    created = "created"
    updated = "updated"
    deleted = "deleted"
    status_changed = "status_changed"
    priority_changed = "priority_changed"
    approved = "approved"
    rejected = "rejected"


class NfrCategory(str, enum.Enum):
    performance = "performance"
    security = "security"
    usability = "usability"
    reliability = "reliability"
    scalability = "scalability"
    maintainability = "maintainability"
    portability = "portability"
    availability = "availability"
    compliance = "compliance"
