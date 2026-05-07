import re
import logging
from uuid import UUID
from sqlalchemy.orm import Session
from app.models.nlp import NlpJob, UserStory
from app.models.requirement import Requirement
from app.models.traceability import TraceabilityMatrix
from app.models.enums import (
    RequirementType, RequirementStatus, PriorityLevel
)

logger = logging.getLogger(__name__)

TYPE_MAP = {
    "functional requirement":     RequirementType.functional,
    "performance requirement":    RequirementType.performance,
    "security requirement":       RequirementType.security,
    "usability requirement":      RequirementType.usability,
    "reliability requirement":    RequirementType.reliability,
    "constraint":                 RequirementType.constraint,
}

VAGUE_WORDS = [
    "somehow", "etc", "maybe", "possibly", "some", "various",
    "appropriate", "suitable", "better", "improve", "efficient",
    "easy", "fast", "friendly", "good", "nice", "simple",
    "informed", "relevant", "proper", "adequate", "reasonable",
]

MEASURABLE_WORDS = [
    "within", "seconds", "milliseconds", "percent", "%", "minutes",
    "hours", "less than", "more than", "at least", "no more than",
    "maximum", "minimum", "exactly", "all", "every", "each",
    "must", "shall", "always", "never", "100", "zero",
]

VAGUE_MOTIVATIONS = [
    "make informed decisions",
    "make better decisions",
    "do my job",
    "do their job",
    "be more productive",
    "be more efficient",
    "improve performance",
    "improve productivity",
    "save time",
    "work better",
    "work faster",
    "help users",
    "help them",
]


def _map_requirement_type(label: str | None) -> RequirementType:
    if not label:
        return RequirementType.functional
    return TYPE_MAP.get(label.lower(), RequirementType.functional)


def _is_vague_motivation(text: str) -> bool:
    text_lower = text.lower().strip()
    for phrase in VAGUE_MOTIVATIONS:
        if phrase in text_lower:
            return True
    has_vague = any(w in text_lower for w in VAGUE_WORDS)
    has_measurable = any(w in text_lower for w in MEASURABLE_WORDS)
    return has_vague and not has_measurable


def _build_statement(actors, goals, constraints, extracted) -> str:
    actor = actors[0].strip() if actors else None
    goal = goals[0].strip(",. ") if goals else None

    if not goal and extracted:
        best = max(extracted, key=lambda x: x.get("confidence", 0))
        goal = best.get("answer", "").strip().rstrip(".")

    if actor and goal:
        statement = f"The system shall allow {actor} to {goal}"
    elif goal:
        statement = f"The system shall {goal}"
    else:
        return "The system shall perform the requested operation."

    if constraints:
        constraint = constraints[0].strip().rstrip(".")
        if not _is_vague_motivation(constraint):
            statement += f" so that {constraint}"

    return statement.rstrip(".") + "."


def _build_title(actors, goals) -> str:
    actor = actors[0].title() if actors else "User"
    goal = goals[0].strip(",. ") if goals else "perform action"
    return f"{actor} - {goal.capitalize()}"[:200]


def _build_rationale(actors, goals, constraints, domain_context) -> str:
    actor = actors[0] if actors else "the user"
    goal = goals[0].strip(",. ") if goals else "complete the required action"
    domain = f" in the {domain_context} domain" if domain_context else ""
    rationale = f"This requirement supports {actor}{domain} by enabling them to {goal}."
    if constraints and not _is_vague_motivation(constraints[0]):
        rationale += f" The expected outcome is that {constraints[0]}."
    return rationale


def _build_fit_criterion(goals, constraints, req_type) -> str:
    goal = goals[0] if goals else "the operation"
    testable_constraint = None
    if constraints and not _is_vague_motivation(constraints[0]):
        testable_constraint = constraints[0]

    if req_type == RequirementType.functional:
        base = (
            f"Given the user has appropriate access, "
            f"when they attempt to {goal}, "
            f"then the system shall complete the action successfully "
            f"and provide appropriate feedback."
        )
        if testable_constraint:
            base = base.rstrip(".") + f", ensuring that {testable_constraint}."
        return base
    elif req_type == RequirementType.performance:
        if testable_constraint:
            return (
                f"The system shall allow the user to {goal} "
                f"within the time specified: {testable_constraint}. "
                f"This shall be verified under normal load conditions."
            )
        return (
            f"The system shall allow the user to {goal} within an acceptable response time "
            f"under normal load conditions. Specific thresholds shall be defined during detailed design."
        )
    elif req_type == RequirementType.security:
        return (
            f"The system shall enforce access controls for {goal}, "
            f"ensuring only authorised users can perform this action. "
            f"All access attempts shall be logged."
        )
    else:
        return (
            f"The system shall successfully support {goal} "
            f"as verified through testing and stakeholder acceptance."
        )


def _compute_qa_scores(statement, actors, goals, constraints, ai_confidence) -> dict:
    statement_lower = statement.lower()
    issues = []

    # Ambiguity
    vague_found = [w for w in VAGUE_WORDS if w in statement_lower]
    ambiguity = max(0.0, 1.0 - (len(vague_found) * 0.25))
    if vague_found:
        issues.append({
            "type": "ambiguity",
            "severity": "high" if len(vague_found) > 1 else "medium",
            "message": f"Vague terms detected: {', '.join(vague_found)}",
            "suggestion": "Replace vague terms with specific, measurable criteria."
        })

    # Completeness
    completeness = 0.3
    if actors:
        completeness += 0.25
    else:
        issues.append({
            "type": "completeness", "severity": "high",
            "message": "No actor identified in user story.",
            "suggestion": "Specify who performs this action (e.g. 'As a doctor...')."
        })
    if goals:
        completeness += 0.25
    else:
        issues.append({
            "type": "completeness", "severity": "high",
            "message": "No clear goal identified.",
            "suggestion": "Specify what the user wants to achieve."
        })
    if constraints and not _is_vague_motivation(constraints[0]):
        completeness += 0.2
    elif not constraints:
        issues.append({
            "type": "completeness", "severity": "low",
            "message": "No acceptance condition specified.",
            "suggestion": "Add a measurable condition, e.g. 'so that records load within 2 seconds'."
        })
    else:
        issues.append({
            "type": "completeness", "severity": "medium",
            "message": f"Constraint '{constraints[0]}' is a vague motivation, not a testable condition.",
            "suggestion": "Replace with a specific, measurable outcome."
        })

    has_shall = "shall" in statement_lower
    has_mixed = any(w in statement_lower for w in ["should", "may", "might", "could", "would"])
    if has_shall and not has_mixed:
        consistency = 0.95
    elif has_shall and has_mixed:
        consistency = 0.7
        issues.append({
            "type": "consistency", "severity": "medium",
            "message": "Mixed modal verbs detected.",
            "suggestion": "Use 'shall' consistently per IEEE 29148."
        })
    else:
        consistency = 0.5
        issues.append({
            "type": "consistency", "severity": "high",
            "message": "Requirement does not use IEEE 29148 'shall' language.",
            "suggestion": "Rewrite using 'The system shall...' format."
        })

    # Testability
    testability = 0.5
    measurable_found = [w for w in MEASURABLE_WORDS if w in statement_lower]
    testability += min(0.3, len(measurable_found) * 0.1)

    if constraints and _is_vague_motivation(constraints[0]):
        testability -= 0.3
        issues.append({
            "type": "testability", "severity": "high",
            "message": f"'{constraints[0]}' cannot be verified through testing.",
            "suggestion": (
                "Define a specific acceptance criterion, e.g. "
                "'so that all patient records from the last 5 years are accessible'."
            )
        })

    testability -= len(vague_found) * 0.1
    if actors and goals and constraints:
        testability += 0.1
    testability = round(max(0.0, min(1.0, testability)), 4)

    if testability < 0.5:
        issues.append({
            "type": "testability", "severity": "high",
            "message": "Requirement has low testability — acceptance criteria are unclear.",
            "suggestion": "Add quantifiable metrics or specific conditions to verify."
        })

    overall = round(
        (ambiguity * 0.2) + (completeness * 0.3) + (consistency * 0.2) + (testability * 0.3),
        4,
    )

    return {
        "ambiguity_score": round(ambiguity, 4),
        "completeness_score": round(completeness, 4),
        "consistency_score": round(consistency, 4),
        "testability_score": testability,
        "overall_quality_score": overall,
        "qa_issues": issues,
    }


def generate_requirements_from_nlp(
    nlp_job: NlpJob,
    story: UserStory,
    created_by: UUID,
    db: Session,
) -> list[Requirement]:
    transformer_output = nlp_job.transformer_output or {}
    req_type_label = transformer_output.get("requirement_type")
    req_type_confidence = transformer_output.get("requirement_type_confidence", 0.0)
    extracted = transformer_output.get("extracted_requirements", [])

    actors = story.actors or []
    goals = story.goals or []
    constraints = story.constraints or []

    req_type = _map_requirement_type(req_type_label)
    statement = _build_statement(actors, goals, constraints, extracted)
    title = _build_title(actors, goals)
    rationale = _build_rationale(actors, goals, constraints, story.domain_context)
    fit_criterion = _build_fit_criterion(goals, constraints, req_type)
    qa_scores = _compute_qa_scores(
        statement, actors, goals, constraints, req_type_confidence
    )

    requirement = Requirement(
        project_id=story.project_id,
        user_story_id=story.id,
        nlp_job_id=nlp_job.id,
        req_id="",
        title=title,
        statement=statement,
        type=req_type,
        rationale=rationale,
        fit_criterion=fit_criterion,
        originator=None,
        status=RequirementStatus.draft,
        priority=PriorityLevel.should_have,
        ai_generated=True,
        ai_confidence=round(req_type_confidence, 4),
        ambiguity_score=qa_scores["ambiguity_score"],
        completeness_score=qa_scores["completeness_score"],
        consistency_score=qa_scores["consistency_score"],
        testability_score=qa_scores["testability_score"],
        overall_quality_score=qa_scores["overall_quality_score"],
        qa_issues=qa_scores["qa_issues"],
        created_by=created_by,
    )

    db.add(requirement)
    db.flush()

    rtm_entry = TraceabilityMatrix(
        project_id=story.project_id,
        requirement_id=requirement.id,
        user_story_id=story.id,
        verification_method="test",
        verified=False,
    )
    db.add(rtm_entry)
    db.commit()
    db.refresh(requirement)

    logger.info(
        f"Generated requirement {requirement.req_id} "
        f"(quality: {qa_scores['overall_quality_score']}) "
        f"from story {story.id}"
    )
    return [requirement]