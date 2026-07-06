"""
Classroom-level views driven by the Planner and Peer Learning agents, plus
a direct Digital Twin read (Progress Agent's long-term memory).

These take student_ids explicitly rather than a classroom_id because this
build doesn't have a classrooms collection yet (see database.py) — the
teacher dashboard already has the roster client-side, so it just passes the
relevant IDs.
"""
from fastapi import APIRouter, Body, Depends

from ..agents.peer_learning_agent import suggest_pairs
from ..agents.planner_agent import plan_tomorrow
from ..agents.progress_agent import get_digital_twin
from ..auth import require_role

router = APIRouter(prefix="/api/classrooms", tags=["classrooms"])


@router.post("/lesson-plan/tomorrow")
async def lesson_plan_tomorrow(student_ids: list[str] = Body(embed=True), user: dict = Depends(require_role("teacher"))):
    return await plan_tomorrow(student_ids)


@router.post("/peer-pairs")
async def peer_pairs(
    concept_id: str = Body(embed=True),
    student_ids: list[str] = Body(embed=True),
    user: dict = Depends(require_role("teacher")),
):
    return await suggest_pairs(concept_id, student_ids)


@router.get("/students/{student_id}/digital-twin")
async def digital_twin(student_id: str, user: dict = Depends(require_role("teacher"))):
    twin = await get_digital_twin(student_id)
    if not twin:
        return {"student_id": student_id, "concept_mastery_history": [], "strengths": [], "gaps": []}
    twin["id"] = str(twin.pop("_id"))
    return twin
