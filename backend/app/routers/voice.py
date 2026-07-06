"""
Voice Agent endpoint — a student's recorded question comes in as an audio
file, Groq Whisper transcribes it. (TTS is client-side — see
frontend lib/voice.ts and parent_communication_agent.py's docstring.)
"""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from ..agents.voice_agent import transcribe_question
from ..auth import get_current_user

router = APIRouter(prefix="/api/voice", tags=["voice"])


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    try:
        contents = await file.read()
        return await transcribe_question(contents, file.filename or "audio.webm")
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))
