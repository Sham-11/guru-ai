"""
Attendance is *written* exclusively through /api/sync/batch, so that a mark
made on a device with no signal and a mark made while online go through the
exact same code path and can never diverge. This router only reads.
"""
from fastapi import APIRouter, Depends

from ..auth import require_role
from ..database import attendance_col

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


@router.get("/by-date/{date}")
async def get_attendance_for_date(date: str, user: dict = Depends(require_role("teacher"))):
    cursor = attendance_col.find({"date": date})
    out = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        out.append(doc)
    return out


@router.get("/student/{student_id}")
async def get_attendance_for_student(student_id: str, user: dict = Depends(require_role("teacher"))):
    cursor = attendance_col.find({"student_id": student_id}).sort("date", -1)
    out = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        out.append(doc)
    return out
