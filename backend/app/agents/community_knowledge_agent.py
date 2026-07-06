"""
Community Knowledge Agent
--------------------------
Rewrites generic lesson examples using local village context (crops, market
names, geography) so a fractions lesson uses "sharing 4 mangoes" instead of
an abstract example that means nothing to the student.

Architecture note: the full design calls for a Qdrant/Chroma vector store
over village-context embeddings (see GURU_AI_Architecture.md section 5.4).
For tonight this is a lightweight retrieval instead: village_context is a
small collection, so we just fetch every entry tagged to the village and
hand them all to the LLM as grounding context — same "retrieve then
generate" pattern, no vector infra needed at this data scale. Swapping in
real embedding search later is a drop-in replacement for `_retrieve`.
"""
from ..database import village_context_col
from ..services.groq_client import chat_json

SYSTEM_PROMPT = """You are the Community Knowledge Agent inside GURU AI. You rewrite generic \
lesson examples using ONLY the local context facts provided to you (crops, markets, geography, \
festivals) — never invent local facts that weren't given to you.

If a lesson example doesn't naturally fit any of the given local facts, keep it generic rather \
than forcing an unnatural local reference.

Respond ONLY with JSON in this exact shape:
{
  "localized_examples": [
    {"grade": "<grade_number_as_string>", "generic_example": "...", "localized_example": "...", "village_tag": "..."}
  ]
}
"""


async def _retrieve(village_id: str) -> list[dict]:
    cursor = village_context_col.find({"village_id": village_id})
    return [doc async for doc in cursor if doc.pop("_id", None) or True]


async def localize_lesson(village_id: str, lesson_content: dict) -> dict:
    local_facts = await _retrieve(village_id)
    if not local_facts:
        return {"agent": "community_knowledge_agent", "localized_examples": [], "note": f"No village_context seeded for '{village_id}'"}

    facts_text = "\n".join(f"- ({f.get('category')}) {f.get('fact')}" for f in local_facts)
    user_prompt = (
        f"Local context facts for this village:\n{facts_text}\n\n"
        f"Lesson content to localize:\n{lesson_content}"
    )
    result = await chat_json(SYSTEM_PROMPT, user_prompt, temperature=0.5)
    result["agent"] = "community_knowledge_agent"
    result["village_id"] = village_id
    return result
