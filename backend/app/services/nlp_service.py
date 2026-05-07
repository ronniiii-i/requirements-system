import httpx
import logging
from app.config import settings

logger = logging.getLogger(__name__)

# Timeout is generous — cold starts on HF free tier can be slow
HF_TIMEOUT = 120.0


async def call_nlp_pipeline(text: str, domain_context: str | None = None) -> dict:
    """
    Sends a user story to the HuggingFace Space NLP service.
    Returns the full structured NLP output.
    """
    payload = {"text": text, "domain_context": domain_context}

    async with httpx.AsyncClient(timeout=HF_TIMEOUT) as client:
        try:
            response = await client.post(
                f"{settings.HF_SPACE_URL}/process",
                json=payload,
            )
            response.raise_for_status()
            return {"success": True, "data": response.json()}

        except httpx.TimeoutException:
            logger.error("HuggingFace Space timed out")
            return {"success": False, "error": "NLP service timed out. Space may be waking up — try again in 30 seconds."}

        except httpx.HTTPStatusError as e:
            logger.error(f"HF Space returned error: {e.response.status_code}")
            return {"success": False, "error": f"NLP service error: {e.response.text}"}

        except Exception as e:
            logger.error(f"Unexpected NLP error: {e}")
            return {"success": False, "error": str(e)}


async def check_nlp_health() -> bool:
    """Ping the HF Space health endpoint."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(f"{settings.HF_SPACE_URL}/health")
            return response.status_code == 200
        except Exception:
            return False
