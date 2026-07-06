"""
Minimal student roster endpoints — enough to seed real students and have the
teacher dashboard read real data instead of the hardcoded mock array.
"""
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..auth import require_role
from ..database import students_col

router = APIRouter(prefix="/api/students", tags=["students"])


class StudentCreate(BaseModel):
    name: str
    grade: int
    roll_number: str
    preferred_language: str = "English"


def serialize(doc) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc


@router.get("")
async def list_students(user: dict = Depends(require_role("teacher"))):
    cursor = students_col.find({})
    return [serialize(d) async for d in cursor]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_student(body: StudentCreate, user: dict = Depends(require_role("teacher"))):
    existing = await students_col.find_one({"roll_number": body.roll_number})
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Roll number already exists")
    result = await students_col.insert_one(body.model_dump())
    doc = await students_col.find_one({"_id": result.inserted_id})
    return serialize(doc)


@router.delete("/{student_id}")
async def delete_student(student_id: str, user: dict = Depends(require_role("teacher"))):
    await students_col.delete_one({"_id": ObjectId(student_id)})
    return {"deleted": True}
