"""
Planner Agent
-------------
Predicts tomorrow's lesson plan by aggregating concept_mastery across a
classroom's students and ranking concepts by how many students are blocked
on them — exactly the "ranked by number of students blocked" rule in the
architecture doc. Pure aggregation logic, no LLM call: this is a query over
data GURU AI already owns, not a generative task.
"""
from ..database import concept_mastery_col

BLOCKED_THRESHOLD = 50.0  # mastery_score at/below this counts as "blocked" on a concept


async def plan_tomorrow(student_ids: list[str]) -> dict:
    cursor = concept_mastery_col.find({"student_id": {"$in": student_ids}})
    rows = [doc async for doc in cursor]

    blocked_by_concept: dict[str, list[str]] = {}
    for row in rows:
        if row["mastery_score"] <= BLOCKED_THRESHOLD:
            blocked_by_concept.setdefault(row["concept_id"], []).append(row["student_id"])

    ranked = sorted(
        (
            {"concept_id": concept, "blocked_student_count": len(students), "blocked_student_ids": students}
            for concept, students in blocked_by_concept.items()
        ),
        key=lambda c: -c["blocked_student_count"],
    )

    return {
        "agent": "planner_agent",
        "classroom_size": len(student_ids),
        "priority_concepts_tomorrow": ranked,
    }
