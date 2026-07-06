"""
Thin, shared Groq wrapper. Every LLM-backed agent goes through this module —
one place to swap models, add retries, or switch providers later.

Runs the (sync) Groq SDK in a thread so it doesn't block the FastAPI event
loop, which matters once several agents are firing in parallel via
asyncio.gather() from the orchestrator.
"""
import asyncio
import json
from typing import Any

from groq import Groq

from ..config import settings

_client: Groq | None = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        if not settings.groq_api_key:
            raise RuntimeError(
                "GROQ_API_KEY is not set. Add it to backend/.env — "
                "get a free key at https://console.groq.com/keys"
            )
        _client = Groq(api_key=settings.groq_api_key)
    return _client


async def chat_json(system_prompt: str, user_prompt: str, *, temperature: float = 0.4) -> dict[str, Any]:
    """
    Calls Groq's chat completion with JSON mode and returns a parsed dict.
    Every generative agent (Lesson, Language, Quiz, Community Knowledge) uses
    this so their outputs are structured data, not prose to re-parse.
    """
    client = _get_client()

    def _call() -> str:
        resp = client.chat.completions.create(
            model=settings.groq_model,
            temperature=temperature,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        return resp.choices[0].message.content or "{}"

    raw = await asyncio.to_thread(_call)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Extremely rare with JSON mode, but never let one malformed
        # generation take the whole orchestrator run down.
        return {"error": "model_returned_invalid_json", "raw": raw}


async def transcribe_audio(file_bytes: bytes, filename: str = "audio.webm") -> str:
    """Voice Agent (STT side) — Groq Whisper transcription."""
    client = _get_client()

    def _call() -> str:
        resp = client.audio.transcriptions.create(
            model=settings.groq_whisper_model,
            file=(filename, file_bytes),
        )
        return resp.text

    return await asyncio.to_thread(_call)
