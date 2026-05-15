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

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8001")
HF_SPACE_URL = os.getenv("HF_SPACE_URL", "https://roniegbu-reqgen-nlp.hf.space")


def _get_session_credentials(tracker):
    metadata = tracker.latest_message.get("metadata") or {}
    project_id = metadata.get("project_id") or tracker.get_slot("project_id")
    user_token = metadata.get("user_token") or tracker.get_slot("user_token")
    return project_id, user_token


def _build_story_text(actor, goal, constraint):
    story = f"As a {actor}, I want to {goal}"
    if constraint and constraint.strip():
        story += f" so that {constraint}"
    return story + "."


def _clean_slot(value):
    if not value:
        return None
    value = re.sub(
        r"^(so that|so|the goal is|the actor is|the constraint is)\s+",
        "",
        str(value).strip(),
        flags=re.IGNORECASE,
    )
    return value.strip() or None


def _call_nlp_service(text):
    try:
        resp = httpx.post(
            f"{HF_SPACE_URL}/process",
            json={"text": text},
            timeout=45.0,
        )
        if resp.status_code == 200:
            data = resp.json()
            return {
                "actors": data.get("actors", []),
                "goals": data.get("goals", []),
                "constraints": data.get("constraints", []),
                "success": True,
            }
    except Exception as e:
        logger.warning(f"NLP service call failed: {e}")
    return {"actors": [], "goals": [], "constraints": [], "success": False}


class ActionExtractSlotsWithNLP(Action):
    def name(self):
        return "action_extract_slots_with_nlp"

    def run(self, dispatcher, tracker, domain):
        text = tracker.latest_message.get("text", "").strip()
        if not text:
            return []

        has_story_pattern = bool(
            re.search(r"\bas an?\b", text, re.IGNORECASE) or
            re.search(r"\bi want\b", text, re.IGNORECASE) or
            re.search(r"\bneed to\b", text, re.IGNORECASE)
        )
        if not has_story_pattern:
            return []

        logger.info(f"NLP extraction for: {text[:80]}")
        result = _call_nlp_service(text)
        if not result["success"]:
            return []

        events = []

        actors = result.get("actors", [])
        goals = result.get("goals", [])
        constraints = result.get("constraints", [])

        if actors and not tracker.get_slot("actor"):
            cleaned = _clean_slot(actors[0])
            if cleaned and len(cleaned) >= 2:
                logger.info(f"NLP set actor: {cleaned}")
                events.append(SlotSet("actor", cleaned))

        if goals and not tracker.get_slot("goal"):
            # Use the first goal — but cap it if the NLP returned the full sentence
            cleaned = _clean_slot(goals[0])
            # If the goal is longer than 120 chars it's probably the whole sentence — skip
            if cleaned and 3 <= len(cleaned) <= 120:
                logger.info(f"NLP set goal: {cleaned}")
                events.append(SlotSet("goal", cleaned))

        if constraints and not tracker.get_slot("constraint"):
            cleaned = _clean_slot(constraints[0])
            if cleaned and len(cleaned) >= 5:
                logger.info(f"NLP set constraint: {cleaned}")
                events.append(SlotSet("constraint", cleaned))

        return events


class ValidateUserStoryForm(FormValidationAction):
    def name(self):
        return "validate_user_story_form"

    def validate_actor(self, slot_value, dispatcher, tracker, domain):
        cleaned = _clean_slot(slot_value)
        if not cleaned or len(cleaned) < 2:
            dispatcher.utter_message(
                text="Who is the actor? (e.g. 'doctor', 'admin', 'patient')"
            )
            return {"actor": None}
        return {"actor": cleaned}

    def validate_goal(self, slot_value, dispatcher, tracker, domain):
        cleaned = _clean_slot(slot_value)
        if not cleaned or len(cleaned) < 3:
            dispatcher.utter_message(
                text="What does the user want to achieve?"
            )
            return {"goal": None}
        return {"goal": cleaned}

    def validate_constraint(self, slot_value, dispatcher, tracker, domain):
        cleaned = _clean_slot(slot_value)
        if not cleaned or len(cleaned) < 5:
            dispatcher.utter_message(
                text="What is the acceptance condition? "
                     "(e.g. 'records load within 3 seconds')"
            )
            return {"constraint": None}
        return {"constraint": cleaned}

    def validate_domain_context(self, slot_value, dispatcher, tracker, domain):
        # Accept anything with 2+ characters — domain names can be anything
        cleaned = _clean_slot(slot_value)
        if not cleaned or len(cleaned) < 2:
            dispatcher.utter_message(
                text='Which domain does this belong to?\n'
                     '(e.g. "Healthcare", "Prescription & Medication", "Patient Management")'
            )
            return {"domain_context": None}
        return {"domain_context": cleaned}


class ActionSetSessionMetadata(Action):
    def name(self):
        return "action_set_session_metadata"

    def run(self, dispatcher, tracker, domain):
        metadata = tracker.get_slot("session_started_metadata") or {}
        project_id = metadata.get("project_id")
        user_token = metadata.get("user_token")
        events = []
        if project_id:
            events.append(SlotSet("project_id", project_id))
        if user_token:
            events.append(SlotSet("user_token", user_token))
        return events


class ActionSubmitUserStory(Action):
    def name(self):
        return "action_submit_user_story"

    def run(self, dispatcher, tracker, domain):
        # Idempotency guard
        if tracker.get_slot("submission_result") == "success":
            logger.info("Submit skipped — already submitted.")
            return []

        actor      = tracker.get_slot("actor")
        goal       = tracker.get_slot("goal")
        constraint = tracker.get_slot("constraint") or ""
        domain_ctx = tracker.get_slot("domain_context") or "General"
        project_id, user_token = _get_session_credentials(tracker)

        logger.info(f"Submitting: actor={actor}, goal={goal[:40] if goal else None}")

        if not actor or not goal:
            dispatcher.utter_message(
                text=(
                    "❌ I couldn't extract the actor or goal from your story.\n\n"
                    "Please try again:\n"
                    "\"As a [actor], I want to [goal] so that [condition]\""
                )
            )
            return [SlotSet("submission_result", None)]

        if not project_id or not user_token:
            dispatcher.utter_message(text="❌ Session error — please reload the page.")
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
            dispatcher.utter_message(text="❌ Server took too long. Please try again.")
            return [SlotSet("submission_result", "timeout")]
        except httpx.ConnectError:
            dispatcher.utter_message(text="❌ Could not reach the backend. Is it running?")
            return [SlotSet("submission_result", "connect_error")]
        except Exception as e:
            logger.exception(f"Unexpected error: {e}")
            dispatcher.utter_message(text="❌ An unexpected error occurred.")
            return [SlotSet("submission_result", "error")]


class ActionRestartConversation(Action):
    def name(self):
        return "action_restart_conversation"

    def run(self, dispatcher, tracker, domain):
        project_id, user_token = _get_session_credentials(tracker)
        return [
            AllSlotsReset(),
            SlotSet("project_id", project_id),
            SlotSet("user_token", user_token),
            SlotSet("submission_result", None),
        ]