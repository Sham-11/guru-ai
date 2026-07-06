"""
Notes are written via /api/sync/batch (note.create / note.update / note.delete)
so they work identically offline and online. This router only reads.
"""
from fastapi import APIRouter, Depends

from ..auth import require_role
from ..database import notes_col

router = APIRouter(prefix="/api/notes", tags=["notes"])


@router.get("")
async def list_notes(user: dict = Depends(require_role("teacher"))):
    cursor = notes_col.find({"teacher_id": user["id"]}).sort("created_at", -1)
    out = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        out.append(doc)
    return out
