"""
Peer Learning Agent
--------------------
Pairs the stronger half of a group of students with the weaker half on a
specific concept, per the architecture doc's rule:
mastery(A, concept) - mastery(B, concept) > threshold.
Pure logic, no LLM call — pairing is a sort-and-match problem, not a
generative one.
"""
from ..database import concept_mastery_col

GAP_THRESHOLD = 20.0
DEFAULT_MASTERY = 50.0  # neutral prior for a student with no recorded attempts yet


async def suggest_pairs(concept_id: str, student_ids: list[str]) -> dict:
    cursor = concept_mastery_col.find({"concept_id": concept_id, "student_id": {"$in": student_ids}})
    scored = {doc["student_id"]: doc["mastery_score"] async for doc in cursor}
    # Anyone with no attempts yet still gets a neutral score so they can be paired.
    for sid in student_ids:
        scored.setdefault(sid, DEFAULT_MASTERY)

    ranked = sorted(scored.items(), key=lambda kv: -kv[1])
    strong = ranked[: len(ranked) // 2]
    weak = list(reversed(ranked[len(ranked) // 2 :]))

    pairs = []
    for (strong_id, strong_score), (weak_id, weak_score) in zip(strong, weak):
        if strong_score - weak_score >= GAP_THRESHOLD:
            pairs.append(
                {
                    "stronger_student_id": strong_id,
                    "stronger_mastery": strong_score,
                    "weaker_student_id": weak_id,
                    "weaker_mastery": weak_score,
                    "gap": round(strong_score - weak_score, 2),
                }
            )

    return {"agent": "peer_learning_agent", "concept_id": concept_id, "suggested_pairs": pairs}
