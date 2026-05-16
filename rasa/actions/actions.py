import os
import re
import logging
import httpx
from typing import Any, Text, Dict, List, Optional
from rasa_sdk import Action, Tracker, FormValidationAction
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import (
    SlotSet,
    AllSlotsReset,
    SessionStarted,
    ActionExecuted,
)
from rasa_sdk.types import DomainDict

logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8001")
HF_SPACE_URL = os.getenv("HF_SPACE_URL", "https://roniegbu-reqgen-nlp.hf.space")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_session_credentials(tracker: Tracker):
    """Extract project_id and user_token from message metadata or slots."""
    metadata = tracker.latest_message.get("metadata") or {}
    project_id = metadata.get("project_id") or tracker.get_slot("project_id")
    user_token = metadata.get("user_token") or tracker.get_slot("user_token")
    return project_id, user_token


def _build_story_text(actor: str, goal: str, constraint: str) -> str:
    story = f"As a {actor}, I want to {goal}"
    if constraint and constraint.strip():
        story += f" so that {constraint}"
    return story + "."


def _clean_slot(value: Optional[str]) -> Optional[str]:
    """Strip leading filler phrases and whitespace from a slot value."""
    if not value:
        return None
    value = re.sub(
        r"^(so that|so|the goal is|the actor is|the constraint is)\s+",
        "",
        str(value).strip(),
        flags=re.IGNORECASE,
    )
    return value.strip() or None


def _regex_extract(text: str) -> Dict:
    """
    Synchronous regex extraction from a well-formed user story sentence.
    This is the primary extraction path — fast and reliable for the standard
    'As a X, I want to Y so that Z' format.
    Returns dict with keys: actor, goal, constraint (all str or None).
    """
    result = {"actor": None, "goal": None, "constraint": None}

    # Actor: "As a <actor>," or "As an <actor>,"
    actor_match = re.search(
        r"[Aa]s an?\s+([\w][\w\s\-]+?)(?:\s*,|\s+I\s+want|\s+i\s+want)",
        text,
    )
    if actor_match:
        actor = actor_match.group(1).strip().rstrip(",")
        if actor:
            result["actor"] = actor

    # Goal: "I want to <goal>" — capture until "so that" or end of sentence
    goal_match = re.search(
        r"[Ii]\s+want\s+to\s+([\w][\w\s,\-]+?)(?:\s+so\s+that\b|\s+in\s+order\s+to\b|[.!?]|$)",
        text,
    )
    if goal_match:
        goal = goal_match.group(1).strip().rstrip(".,")
        if goal and len(goal) <= 150:
            result["goal"] = goal

    # Constraint: "so that <constraint>" — capture to end of sentence
    constraint_match = re.search(
        r"[Ss]o\s+that\s+([\w][\w\s,\-]+?)(?:[.!?]|$)",
        text,
    )
    if constraint_match:
        constraint = constraint_match.group(1).strip().rstrip(".,")
        if constraint and len(constraint) >= 5:
            result["constraint"] = constraint

    return result


def _call_nlp_service(text: str) -> Dict:
    """
    Call the HuggingFace Space NLP endpoint. Used to supplement regex results,
    not replace them. Short timeout so it never blocks the conversation.
    Returns dict with keys: actors, goals, constraints, success.
    """
    try:
        resp = httpx.post(
            f"{HF_SPACE_URL}/process",
            json={"text": text},
            timeout=8.0,  # short — HF cold starts can be 30s+; don't block
        )
        if resp.status_code == 200:
            data = resp.json()
            return {
                "actors": data.get("actors", []),
                "goals": data.get("goals", []),
                "constraints": data.get("constraints", []),
                "success": True,
            }
        logger.warning(f"NLP service returned HTTP {resp.status_code}")
    except httpx.TimeoutException:
        logger.warning("NLP service timed out — using regex results only")
    except Exception as e:
        logger.warning(f"NLP service call failed: {e}")
    return {"actors": [], "goals": [], "constraints": [], "success": False}


# ── Action: extract actor/goal/constraint before form activates ───────────────

class ActionExtractNlpSlots(Action):
    """
    Runs immediately after the user submits a user story, before the form
    activates. Strategy:
      1. Always run fast regex extraction first.
      2. Attempt NLP service with a short timeout to potentially improve results.
      3. NLP only overrides a regex result if it returns something that passes
         the quality checks (non-empty, within length bounds).
    This guarantees actor/goal/constraint are always populated for well-formed
    stories even when the HF Space is cold.
    """

    def name(self) -> Text:
        return "action_extract_nlp_slots"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:
        text = tracker.latest_message.get("text", "").strip()
        if not text:
            return []

        logger.info(f"Extracting slots from: {text[:100]}")

        # ── Step 1: regex (always runs, always fast) ──────────────────────────
        regex = _regex_extract(text)
        actor = regex["actor"]
        goal = regex["goal"]
        constraint = regex["constraint"]

        logger.info(f"Regex extracted — actor: {actor!r}, goal: {goal!r}, constraint: {constraint!r}")

        # ── Step 2: NLP service (optional improvement, short timeout) ─────────
        nlp = _call_nlp_service(text)
        if nlp["success"]:
            nlp_actors = nlp.get("actors", [])
            nlp_goals = nlp.get("goals", [])
            nlp_constraints = nlp.get("constraints", [])

            # Override actor from NLP only if regex found nothing
            if not actor and nlp_actors:
                cleaned = _clean_slot(nlp_actors[0])
                if cleaned and len(cleaned) >= 2:
                    actor = cleaned
                    logger.info(f"NLP override actor: {actor!r}")

            # Override goal from NLP only if regex found nothing, and cap at 120 chars
            if not goal and nlp_goals:
                cleaned = _clean_slot(nlp_goals[0])
                if cleaned and 3 <= len(cleaned) <= 120:
                    goal = cleaned
                    logger.info(f"NLP override goal: {goal!r}")

            # Override constraint from NLP only if regex found nothing
            if not constraint and nlp_constraints:
                cleaned = _clean_slot(nlp_constraints[0])
                if cleaned and len(cleaned) >= 5:
                    constraint = cleaned
                    logger.info(f"NLP override constraint: {constraint!r}")

        # ── Step 3: set slots ─────────────────────────────────────────────────
        events: List[Dict[Text, Any]] = []
        if actor:
            events.append(SlotSet("actor", actor))
        if goal:
            events.append(SlotSet("goal", goal))
        if constraint:
            events.append(SlotSet("constraint", constraint))

        if not actor or not goal:
            logger.warning(
                f"Extraction incomplete — actor: {actor!r}, goal: {goal!r}. "
                f"User may need to rephrase."
            )

        return events


# ── Form validator ────────────────────────────────────────────────────────────

class ValidateUserStoryForm(FormValidationAction):
    """
    The form only collects domain_context.
    actor, goal, and constraint are pre-populated by action_extract_nlp_slots.
    """

    def name(self) -> Text:
        return "validate_user_story_form"

    def validate_domain_context(
        self,
        slot_value: Any,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> Dict[Text, Any]:
        cleaned = _clean_slot(slot_value)
        if not cleaned or len(cleaned) < 2:
            dispatcher.utter_message(
                text=(
                    'Which domain does this belong to?\n'
                    '(e.g. "Healthcare", "Prescription & Medication", '
                    '"Authentication", "Billing & Insurance")'
                )
            )
            return {"domain_context": None}
        return {"domain_context": cleaned}


# ── Action: session start ─────────────────────────────────────────────────────

class ActionSessionStart(Action):
    """
    Overrides the default session start so project_id and user_token from
    the connection metadata are injected into slots at conversation start.
    """

    def name(self) -> Text:
        return "action_session_start"

    async def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:
        events: List[Dict[Text, Any]] = [SessionStarted()]

        # Carry over credentials from a previous session if present
        for slot_name in ("project_id", "user_token"):
            val = tracker.get_slot(slot_name)
            if val:
                events.append(SlotSet(slot_name, val))

        # Check the latest message metadata (sent by frontend on connect)
        metadata = tracker.latest_message.get("metadata") or {}
        project_id = metadata.get("project_id")
        user_token = metadata.get("user_token")
        if project_id:
            events.append(SlotSet("project_id", project_id))
        if user_token:
            events.append(SlotSet("user_token", user_token))

        events.append(ActionExecuted("action_listen"))
        return events


# ── Action: submit user story to the backend ──────────────────────────────────

class ActionSubmitUserStory(Action):

    def name(self) -> Text:
        return "action_submit_user_story"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:
        # ── Idempotency guard ─────────────────────────────────────────────────
        if tracker.get_slot("submission_result") == "success":
            logger.info("Submit skipped — already submitted this turn.")
            dispatcher.utter_message(response="utter_submission_success")
            return []

        actor = tracker.get_slot("actor")
        goal = tracker.get_slot("goal")
        constraint = tracker.get_slot("constraint") or ""
        domain_ctx = tracker.get_slot("domain_context") or "General"
        project_id, user_token = _get_session_credentials(tracker)

        logger.info(
            f"Submitting: actor={actor!r}, goal={goal!r:.40}, "
            f"domain={domain_ctx!r}, project={project_id!r}"
        )

        # ── Validation ────────────────────────────────────────────────────────
        if not actor or not goal:
            dispatcher.utter_message(
                text=(
                    "❌ I couldn't extract the actor or goal from your story.\n\n"
                    "Please try again with this format:\n"
                    "\"As a [actor], I want to [goal] so that [condition]\""
                )
            )
            return [SlotSet("submission_result", None)]

        if not project_id or not user_token:
            dispatcher.utter_message(
                text="❌ Session error — project or auth token is missing. Please reload the page."
            )
            return [SlotSet("submission_result", "session_error")]

        raw_text = _build_story_text(actor, goal, constraint)

        # ── HTTP call ─────────────────────────────────────────────────────────
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    f"{BACKEND_URL}/api/projects/{project_id}/stories",
                    json={"raw_text": raw_text, "domain_context": domain_ctx},
                    headers={
                        "Authorization": f"Bearer {user_token}",
                        "Content-Type": "application/json",
                    },
                )

            if response.status_code == 201:
                logger.info(f"Story submitted: {response.json().get('id')}")
                dispatcher.utter_message(response="utter_submission_success")
                return [SlotSet("submission_result", "success")]
            else:
                logger.error(f"Backend {response.status_code}: {response.text[:200]}")
                dispatcher.utter_message(
                    text=f"❌ Submission failed (HTTP {response.status_code}). Please try again."
                )
                return [SlotSet("submission_result", f"http_{response.status_code}")]

        except httpx.TimeoutException:
            dispatcher.utter_message(
                text="❌ The server took too long to respond. Please try again."
            )
            return [SlotSet("submission_result", "timeout")]

        except httpx.ConnectError:
            dispatcher.utter_message(
                text="❌ Could not reach the backend server. Please ensure it is running."
            )
            return [SlotSet("submission_result", "connect_error")]

        except Exception as e:
            logger.exception(f"Unexpected error: {e}")
            dispatcher.utter_message(text="❌ An unexpected error occurred. Please try again.")
            return [SlotSet("submission_result", "error")]


# ── Action: restart, preserving session credentials ───────────────────────────

class ActionRestartConversation(Action):

    def name(self) -> Text:
        return "action_restart_conversation"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: DomainDict,
    ) -> List[Dict[Text, Any]]:
        project_id, user_token = _get_session_credentials(tracker)
        return [
            AllSlotsReset(),
            SlotSet("project_id", project_id),
            SlotSet("user_token", user_token),
            SlotSet("submission_result", None),
        ]