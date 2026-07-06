"""
Pydantic request/response models.
"""
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------- auth
class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


# ---------------------------------------------------------------- sync
# Every offline-queued action the client produces looks like this.
# `client_op_id` is generated on-device (uuid) the moment the action happens,
# so re-sending the same op after a dropped connection is a no-op server-side.
SyncOpType = Literal[
    "attendance.mark",
    "note.create",
    "note.update",
    "note.delete",
    "lesson_upload.create",
    "announcement.create",
    "study_material.create",
    "homework.create",
    "homework.submit",
]


class SyncOp(BaseModel):
    client_op_id: str
    type: SyncOpType
    payload: dict[str, Any]
    created_at: datetime


class SyncBatchRequest(BaseModel):
    ops: list[SyncOp]


class SyncOpResult(BaseModel):
    client_op_id: str
    status: Literal["applied", "duplicate", "error"]
    detail: Optional[str] = None


class SyncBatchResponse(BaseModel):
    results: list[SyncOpResult]
    server_time: datetime


# ---------------------------------------------------------------- agents / lessons
class GenerateLessonRequest(BaseModel):
    subject: str
    concept_id: str = Field(description="e.g. 'math.fractions.intro'")
    source_text: str = Field(description="OCR'd or typed raw material — textbook page, blackboard photo text, notes")
    grades: list[int] = Field(default=[1, 2, 3, 4, 5])
    languages: list[str] = Field(default=["en", "kn", "hi"])
    village_id: Optional[str] = Field(default=None, description="If set, runs the Community Knowledge Agent too")
    generate_quiz: bool = True


class QuizAttemptRequest(BaseModel):
    student_id: str
    quiz_id: str
    concept_id: str
    question_index: int
    correct: bool
    response_time_ms: Optional[int] = None


class PeerPairRequest(BaseModel):
    concept_id: str
    student_ids: list[str] = Field(description="Students to consider for pairing; mastery pulled from concept_mastery")


class ParentUpdateRequest(BaseModel):
    student_id: str
    parent_language: str = "kn"
    student_name: Optional[str] = None