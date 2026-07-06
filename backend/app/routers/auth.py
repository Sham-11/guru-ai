"""
Teacher signup / login.

Kept intentionally simple: one role ("teacher") with email+password.
Student accounts are created by a teacher (see students router) and log in
the same way, with role="student" in the token.
"""
from fastapi import APIRouter, HTTPException, status

from ..auth import create_access_token, hash_password, verify_password
from ..database import students_col, teachers_col
from ..models import LoginRequest, SignupRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse)
async def signup(body: SignupRequest):
    existing = await teachers_col.find_one({"email": body.email})
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    doc = {
        "name": body.name,
        "email": body.email,
        "password_hash": hash_password(body.password),
        "role": "teacher",
    }
    result = await teachers_col.insert_one(doc)
    user_id = str(result.inserted_id)
    token = create_access_token(subject=user_id, role="teacher")
    return TokenResponse(
        access_token=token,
        user={"id": user_id, "name": body.name, "email": body.email, "role": "teacher"},
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    # Try teacher first, then student — same credential shape, different collection.
    teacher = await teachers_col.find_one({"email": body.email})
    if teacher and verify_password(body.password, teacher["password_hash"]):
        token = create_access_token(subject=str(teacher["_id"]), role="teacher")
        return TokenResponse(
            access_token=token,
            user={"id": str(teacher["_id"]), "name": teacher["name"], "email": teacher["email"], "role": "teacher"},
        )

    student = await students_col.find_one({"email": body.email})
    if student and student.get("password_hash") and verify_password(body.password, student["password_hash"]):
        token = create_access_token(subject=str(student["_id"]), role="student")
        return TokenResponse(
            access_token=token,
            user={"id": str(student["_id"]), "name": student["name"], "email": student["email"], "role": "student"},
        )

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
