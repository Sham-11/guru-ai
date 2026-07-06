"""
Offline sync endpoint.

This is the single door every queued IndexedDB action walks through once the
device is back online. It is designed to be:

  1. Idempotent   — each op carries a client-generated `client_op_id`. If we've
                     already applied it (recorded in sync_log), we skip it and
                     report "duplicate" rather than double-writing. This is what
                     makes it safe for the client to retry a batch after a
                     dropped connection without re-marking attendance twice.

  2. Partial-fail-safe — one bad op in a batch of 40 must not sink the other 39.
                     Each op is applied independently and reported individually.

  3. Order-independent within a batch, but ops are applied in the order the
     client generated them (list order == chronological order on-device).
"""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends

from ..auth import get_current_user
from ..database import (
    announcements_col,
    attendance_col,
    homework_col,
    homework_submissions_col,
    lesson_uploads_col,
    notes_col,
    study_materials_col,
    sync_log_col,
)
from ..models import SyncBatchRequest, SyncBatchResponse, SyncOp, SyncOpResult

router = APIRouter(prefix="/api/sync", tags=["sync"])


async def _apply_op(op: SyncOp, user: dict) -> None:
    """Raises on failure; caller decides how to report it."""
    payload = op.payload

    if op.type == "attendance.mark":
        await attendance_col.update_one(
            {"student_id": payload["student_id"], "date": payload["date"]},
            {
                "$set": {
                    "status": payload["status"],  # present | absent | late | half_day
                    "marked_by": user["id"],
                    "marked_offline": payload.get("marked_offline", False),
                    "updated_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )

    elif op.type == "note.create":
        await notes_col.insert_one(
            {
                "_client_id": payload.get("local_id"),
                "teacher_id": user["id"],
                "title": payload["title"],
                "body": payload["body"],
                "category": payload.get("category", "general"),
                "pinned": payload.get("pinned", False),
                "created_at": op.created_at,
            }
        )

    elif op.type == "note.update":
        await notes_col.update_one(
            {"_id": ObjectId(payload["note_id"])},
            {"$set": {k: v for k, v in payload.items() if k != "note_id"}},
        )

    elif op.type == "note.delete":
        await notes_col.delete_one({"_id": ObjectId(payload["note_id"])})

    elif op.type == "lesson_upload.create":
        await lesson_uploads_col.insert_one(
            {
                "teacher_id": user["id"],
                "material_type": payload["material_type"],
                "file_ref": payload.get("file_ref"),
                "status": "queued_for_ai_processing",
                "created_at": op.created_at,
            }
        )

    elif op.type == "announcement.create":
        await announcements_col.insert_one(
            {
                "teacher_id": user["id"],
                "message": payload["message"],
                "created_at": op.created_at,
            }
        )

    elif op.type == "study_material.create":
        await study_materials_col.insert_one(
            {
                "teacher_id": user["id"],
                "subject_id": payload["subject"],
                "title": payload["title"],
                "grade": payload.get("grade"),
                "created_at": op.created_at,
            }
        )

    elif op.type == "homework.create":
        await homework_col.insert_one(
            {
                "teacher_id": user["id"],
                "subject_id": payload["subject"],
                "title": payload["title"],
                "grade": payload.get("grade"),
                "created_at": op.created_at,
            }
        )

    elif op.type == "homework.submit":
        await homework_submissions_col.update_one(
            {"homework_id": payload["homework_id"], "student_id": payload["student_id"]},
            {
                "$set": {
                    "correct_count": payload["correct_count"],
                    "total_questions": payload["total_questions"],
                    "mistakes": payload.get("mistakes", []),
                    "marked_offline": payload.get("marked_offline", False),
                    "completed_at": op.created_at,
                }
            },
            upsert=True,
        )

    else:  # pragma: no cover - guarded by the SyncOpType literal type
        raise ValueError(f"Unknown op type: {op.type}")


@router.post("/batch", response_model=SyncBatchResponse)
async def sync_batch(body: SyncBatchRequest, user: dict = Depends(get_current_user)):
    results: list[SyncOpResult] = []

    for op in body.ops:
        already = await sync_log_col.find_one({"client_op_id": op.client_op_id})
        if already:
            results.append(SyncOpResult(client_op_id=op.client_op_id, status="duplicate"))
            continue

        try:
            await _apply_op(op, user)
            await sync_log_col.insert_one(
                {
                    "client_op_id": op.client_op_id,
                    "type": op.type,
                    "user_id": user["id"],
                    "applied_at": datetime.now(timezone.utc),
                }
            )
            results.append(SyncOpResult(client_op_id=op.client_op_id, status="applied"))
        except Exception as exc:  # noqa: BLE001 - report per-op, keep batch going
            results.append(SyncOpResult(client_op_id=op.client_op_id, status="error", detail=str(exc)))

    return SyncBatchResponse(results=results, server_time=datetime.now(timezone.utc))
