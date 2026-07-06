from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status

from ..agents.parent_communication_agent import generate_parent_update
from ..auth import require_role
from ..database import students_col
from ..models import ParentUpdateRequest

router = APIRouter(prefix="/api/parent", tags=["parent"])


@router.post("/updates/generate")
async def generate_update(body: ParentUpdateRequest, user: dict = Depends(require_role("teacher"))):
    # The frontend's Student Mode roster uses simple in-memory ids (not real
    # Mongo documents), so student_id here isn't guaranteed to be a valid
    # ObjectId or to exist in students_col. This previously raised an
    # unhandled bson.errors.InvalidId -> 500, which drops CORS headers on
    # the way out and makes the browser report it as an unreachable backend
    # even though the server is up. Fall back to whatever name the client
    # already has instead of requiring a matching DB record to exist.
    student_name = body.student_name or body.student_id
    try:
        student = await students_col.find_one({"_id": ObjectId(body.student_id)})
        if student:
            student_name = student["name"]
    except InvalidId:
        pass

    try:
        return await generate_parent_update(body.student_id, student_name, body.parent_language)
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))