"""
Quiz reads plus the attempt endpoint that feeds the Progress Agent — every
answer a student submits immediately updates their concept mastery and
Digital Twin.
"""
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from ..agents.progress_agent import record_attempt
from ..auth import get_current_user
from ..database import quizzes_col
from ..models import QuizAttemptRequest

router = APIRouter(prefix="/api/quizzes", tags=["quizzes"])


@router.get("/{quiz_id}")
async def get_quiz(quiz_id: str, user: dict = Depends(get_current_user)):
    doc = await quizzes_col.find_one({"_id": ObjectId(quiz_id)})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz not found")
    doc["id"] = str(doc.pop("_id"))
    return doc


@router.post("/{quiz_id}/attempt")
async def submit_attempt(quiz_id: str, body: QuizAttemptRequest, user: dict = Depends(get_current_user)):
    return await record_attempt(
        student_id=body.student_id,
        concept_id=body.concept_id,
        correct=body.correct,
        response_time_ms=body.response_time_ms,
    )
