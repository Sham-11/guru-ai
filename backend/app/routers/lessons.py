"""
POST /api/lessons/generate triggers the Orchestrator, which fans out to
Lesson -> {Language, Quiz, Community Knowledge} in parallel. This is the
main "watch the agents run" endpoint for the demo.
"""
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from ..agents.orchestrator import generate_lesson_package
from ..auth import require_role
from ..database import lessons_col
from ..models import GenerateLessonRequest
from ..security import orchestrator_rate_limiter, sanitize_source_text

router = APIRouter(prefix="/api/lessons", tags=["lessons"])


@router.post("/generate", status_code=status.HTTP_201_CREATED)
async def generate(body: GenerateLessonRequest, user: dict = Depends(require_role("teacher"))):
    orchestrator_rate_limiter.check(user["id"])

    clean_source_text, flags = sanitize_source_text(body.source_text)
    # Don't hard-fail on a match — a false positive would just break a
    # legitimate lesson. Use the neutralized text either way; flags exist
    # for logging/observability rather than blocking.
    body.source_text = clean_source_text
    if "possible_prompt_injection" in flags:
        print(f"[security] possible prompt injection neutralized for user={user['id']}")

    try:
        return await generate_lesson_package(
            subject=body.subject,
            concept_id=body.concept_id,
            source_text=body.source_text,
            grades=body.grades,
            languages=body.languages,
            village_id=body.village_id,
            generate_quiz=body.generate_quiz,
        )
    except RuntimeError as exc:
        # Most likely: GROQ_API_KEY missing — surface it clearly instead of a 500.
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))


@router.get("/{lesson_id}")
async def get_lesson(lesson_id: str, user: dict = Depends(require_role("teacher"))):
    doc = await lessons_col.find_one({"_id": ObjectId(lesson_id)})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found")
    doc["id"] = str(doc.pop("_id"))
    return doc


@router.get("")
async def list_lessons(user: dict = Depends(require_role("teacher"))):
    cursor = lessons_col.find({}).sort("created_at", -1)
    out = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        out.append(doc)
    return out