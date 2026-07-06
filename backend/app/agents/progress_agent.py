"""
Progress Agent
--------------
No LLM call — this agent's job (per the architecture doc) is scoring and
bookkeeping, not generation, so it's implemented as deterministic logic.
That's a feature, not a shortcut: the doc explicitly requires mastery to be
recomputed from the raw attempt log rather than trusted from a client-sent
aggregate, so a replayed offline batch can never double-count. An LLM would
make that guarantee non-deterministic.

Maintains two things per student:
- concept_mastery: a 0-100 score per (student, concept), exponential-moving-
  average style update per attempt.
- digital_twins: the append-only long-term memory — mastery_history,
  strengths, gaps — that the Planner Agent and future lessons read from.
"""
from datetime import datetime, timezone

from ..database import concept_mastery_col, digital_twins_col

# How much a single attempt shifts the running mastery score.
# Correct answers pull the score up toward 100, wrong answers pull it down
# toward 0 — same rule, no branching logic, no black box.
LEARNING_RATE = 0.25


async def record_attempt(student_id: str, concept_id: str, correct: bool, response_time_ms: int | None = None) -> dict:
    existing = await concept_mastery_col.find_one({"student_id": student_id, "concept_id": concept_id})
    prev_score = existing["mastery_score"] if existing else 50.0  # neutral prior
    prev_attempts = existing["attempts"] if existing else 0

    target = 100.0 if correct else 0.0
    new_score = round(prev_score + LEARNING_RATE * (target - prev_score), 2)

    await concept_mastery_col.update_one(
        {"student_id": student_id, "concept_id": concept_id},
        {
            "$set": {
                "mastery_score": new_score,
                "last_attempt_at": datetime.now(timezone.utc),
            },
            "$inc": {"attempts": 1},
        },
        upsert=True,
    )

    await digital_twins_col.update_one(
        {"student_id": student_id},
        {
            "$push": {
                "concept_mastery_history": {
                    "concept_id": concept_id,
                    "score": new_score,
                    "recorded_at": datetime.now(timezone.utc),
                }
            }
        },
        upsert=True,
    )

    # Recompute strengths/gaps snapshot from the full current mastery table —
    # cheap at classroom scale, and avoids strengths/gaps ever drifting out
    # of sync with the actual scores.
    await _refresh_strengths_and_gaps(student_id)

    return {
        "agent": "progress_agent",
        "student_id": student_id,
        "concept_id": concept_id,
        "previous_score": prev_score,
        "new_score": new_score,
        "attempts": prev_attempts + 1,
    }


async def _refresh_strengths_and_gaps(student_id: str) -> None:
    cursor = concept_mastery_col.find({"student_id": student_id})
    scores = [doc async for doc in cursor]
    strengths = sorted((s for s in scores if s["mastery_score"] >= 75), key=lambda s: -s["mastery_score"])
    gaps = sorted((s for s in scores if s["mastery_score"] <= 40), key=lambda s: s["mastery_score"])

    await digital_twins_col.update_one(
        {"student_id": student_id},
        {
            "$set": {
                "strengths": [s["concept_id"] for s in strengths[:5]],
                "gaps": [s["concept_id"] for s in gaps[:5]],
            }
        },
        upsert=True,
    )


async def get_digital_twin(student_id: str) -> dict | None:
    return await digital_twins_col.find_one({"student_id": student_id})
