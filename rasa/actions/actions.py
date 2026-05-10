import os
import re
import logging
import httpx
from typing import Any, Text, Dict, List, Optional
from rasa_sdk import Action, Tracker, FormValidationAction
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet, AllSlotsReset
from rasa_sdk.types import DomainDict

logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_session_credentials(tracker: Tracker) -> tuple[Optional[str], Optional[str]]:
    """
    Retrieves project_id and user_token from two possible sources, in priority order:

    1. tracker.latest_message metadata — sent by the React frontend on EVERY
       REST webhook message as:
         { "sender": "...", "message": "...", "metadata": { "project_id": "...", "user_token": "..." } }
       This is the primary mechanism for the REST webhook channel.

    2. Slot values — set previously by ActionSetSessionMetadata during a
       SocketIO session start event (fallback for SocketIO channel).
    """
    # Priority 1: metadata on current message (REST channel)
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
    """Strip leading 'so that', 'the', 'a', etc. from extracted slot values."""
    if not value:
        return value
    # Remove common prefixes that NLU sometimes pulls in
    value = re.sub(r"^(so that|so|the goal is|the actor is|the constraint is)\s+", "", value.strip(), flags=re.IGNORECASE)
    return value.strip() or None


# ── Form validation ───────────────────────────────────────────────────────────

class ValidateUserStoryForm(FormValidationAction):
    """
    Validates and cleans each slot as the user_story_form fills them.
    This is where we catch vague constraints and nudge users toward specificity.
    """

    def name(self) -> Text:
        return "validate_user_story_form"

    def validate_actor(
        self, slot_value: Any, dispatcher: CollectingDispatcher,
        tracker: Tracker, domain: DomainDict,
    ) -> Dict[Text, Any]:
        cleaned = _clean_slot(str(slot_value)) if slot_value else None
        if not cleaned or len(cleaned) < 2:
            dispatcher.utter_message(text="Please provide a valid actor (e.g. 'doctor', 'admin', 'registered user').")
            return {"actor": None}
        return {"actor": cleaned}

    def validate_goal(
        self, slot_value: Any, dispatcher: CollectingDispatcher,
        tracker: Tracker, domain: DomainDict,
    ) -> Dict[Text, Any]:
        cleaned = _clean_slot(str(slot_value)) if slot_value else None
        if not cleaned or len(cleaned) < 3:
            dispatcher.utter_message(text="Please describe what the user wants to achieve in more detail.")
            return {"goal": None}
        return {"goal": cleaned}

    def validate_constraint(
        self, slot_value: Any, dispatcher: CollectingDispatcher,
        tracker: Tracker, domain: DomainDict,
    ) -> Dict[Text, Any]:
        cleaned = _clean_slot(str(slot_value)) if slot_value else None
        if not cleaned or len(cleaned) < 5:
            dispatcher.utter_message(text="Please provide a measurable condition (e.g. 'records load within 3 seconds').")
            return {"constraint": None}

        # Flag vague constraints
        vague_patterns = [
            r"\bbetter\b", r"\beasier\b", r"\bfaster\b", r"\bmore efficient\b",
            r"\bimproved\b", r"\bnice(ly)?\b", r"\bquick(ly)?\b",
        ]
        if any(re.search(p, cleaned, re.IGNORECASE) for p in vague_patterns):
            dispatcher.utter_message(
                text=(
                    "⚠️ That condition is a bit vague. Try to be measurable, e.g.:\n"
                    "- 'records load within 3 seconds'\n"
                    "- 'only authorised users can access the data'\n"
                    "- 'confirmation email sent within 30 seconds'"
                )
            )
            return {"constraint": None}

        return {"constraint": cleaned}

    def validate_domain_context(
        self, slot_value: Any, dispatcher: CollectingDispatcher,
        tracker: Tracker, domain: DomainDict,
    ) -> Dict[Text, Any]:
        cleaned = _clean_slot(str(slot_value)) if slot_value else None
        if not cleaned or len(cleaned) < 2:
            dispatcher.utter_message(text="Please specify the domain (e.g. 'Authentication', 'Patient Management').")
            return {"domain_context": None}
        return {"domain_context": cleaned}


# ── Session metadata injection ────────────────────────────────────────────────

class ActionSetSessionMetadata(Action):
    """
    Reads project_id and user_token from the SocketIO session_started
    metadata and stores them as slots.

    For the REST channel, credentials are read directly from
    tracker.latest_message metadata on each request — this action
    is only relevant for the SocketIO channel.
    """

    def name(self) -> Text:
        return "action_set_session_metadata"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:

        # session_started_metadata is Rasa's built-in slot — do not redeclare in domain.yml
        metadata = tracker.get_slot("session_started_metadata") or {}
        project_id = metadata.get("project_id")
        user_token = metadata.get("user_token")

        events = []
        if project_id:
            events.append(SlotSet("project_id", project_id))
        if user_token:
            events.append(SlotSet("user_token", user_token))

        if not project_id or not user_token:
            logger.warning("Session started without project_id/user_token in metadata.")

        return events


# ── Story submission ──────────────────────────────────────────────────────────

class ActionSubmitUserStory(Action):
    """
    Submits the collected user story to the FastAPI backend.

    Reads credentials from tracker.latest_message metadata first (REST channel),
    then falls back to slots (SocketIO channel). This is the fix for the
    'session_error' problem when using the REST webhook.
    """

    def name(self) -> Text:
        return "action_submit_user_story"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:

        actor      = tracker.get_slot("actor")
        goal       = tracker.get_slot("goal")
        constraint = tracker.get_slot("constraint") or ""
        domain_ctx = tracker.get_slot("domain_context")

        # Get credentials — REST metadata takes priority over slots
        project_id, user_token = _get_session_credentials(tracker)

        logger.info(f"Submitting story — project_id={project_id}, actor={actor}, goal={goal}")

        if not actor or not goal:
            dispatcher.utter_message(text="❌ Missing actor or goal. Please restart and try again.")
            return [SlotSet("submission_result", "missing_fields")]

        if not project_id or not user_token:
            logger.error(f"No credentials — project_id={project_id}, token={'present' if user_token else 'MISSING'}")
            dispatcher.utter_message(
                text="❌ Session error — project or auth token missing. Please reload the page and try again."
            )
            return [SlotSet("submission_result", "session_error")]

        raw_text = _build_story_text(actor, goal, constraint)

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
                story_id = response.json().get("id", "unknown")
                logger.info(f"Story submitted: {story_id}")
                dispatcher.utter_message(response="utter_submission_success")
                return [SlotSet("submission_result", "success")]

            else:
                logger.error(f"Backend {response.status_code}: {response.text}")
                dispatcher.utter_message(
                    text=f"❌ Submission failed (HTTP {response.status_code}). Please try again."
                )
                return [SlotSet("submission_result", f"http_{response.status_code}")]

        except httpx.TimeoutException:
            logger.error("Backend timed out")
            dispatcher.utter_message(text="❌ The server took too long to respond. Please try again.")
            return [SlotSet("submission_result", "timeout")]

        except httpx.ConnectError:
            logger.error(f"Cannot connect to backend at {BACKEND_URL}")
            dispatcher.utter_message(text="❌ Could not reach the backend. Is the server running?")
            return [SlotSet("submission_result", "connect_error")]

        except Exception as e:
            logger.exception(f"Unexpected error: {e}")
            dispatcher.utter_message(text="❌ An unexpected error occurred. Please try again.")
            return [SlotSet("submission_result", str(e))]


# ── Restart ───────────────────────────────────────────────────────────────────

class ActionRestartConversation(Action):
    """
    Resets all story slots. Preserves project_id and user_token from
    both slots AND the current message metadata so credentials survive restart.
    """

    def name(self) -> Text:
        return "action_restart_conversation"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:

        project_id, user_token = _get_session_credentials(tracker)

        return [
            AllSlotsReset(),
            SlotSet("project_id", project_id),
            SlotSet("user_token", user_token),
        ]