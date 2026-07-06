"""
Voice Agent (speech-to-text side)
-----------------------------------
Real transcription via Groq's hosted Whisper endpoint — a student's spoken
question becomes text the rest of the pipeline can reason over.

The text-to-speech side (spoken explanations) intentionally runs in the
browser via the Web Speech API instead of another backend call tonight —
same agent, split across client/server the same way the offline-sync layer
already splits work between device and server. See frontend lib/voice.ts.
"""
from ..services.groq_client import transcribe_audio


async def transcribe_question(file_bytes: bytes, filename: str) -> dict:
    text = await transcribe_audio(file_bytes, filename)
    return {"agent": "voice_agent", "transcript": text}
