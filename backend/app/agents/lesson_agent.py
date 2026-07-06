"""
Lesson Agent
------------
Turns raw material (OCR'd textbook/blackboard text, or typed notes) into
grade-differentiated lesson content for Grades 1-5 in a single generation
pass — one structured JSON object, one field per requested grade.
"""
from ..services.groq_client import chat_json

SYSTEM_PROMPT = """You are the Lesson Agent inside GURU AI, a classroom AI system for a single \
teacher running Grades 1-5 together in one rural Indian classroom.

Given raw source material (a textbook excerpt, a transcribed blackboard photo, or teacher notes) \
and a target list of grades, produce grade-differentiated lesson content: the same underlying \
concept, explained at the right depth and vocabulary for each grade.

Rules:
- Grade 1-2: very short sentences, concrete everyday objects, no abstract terms.
- Grade 3-4: slightly more depth, simple worked examples.
- Grade 5: full explanation with one worked example and one practice question.
- Keep every grade's content self-contained (a teacher may only read out one grade's version).
- Do not invent facts not supported by or reasonably inferable from the source material.

Respond ONLY with JSON in this exact shape:
{
  "title": "short lesson title",
  "concept_summary": "1-2 sentence summary of the core concept",
  "grade_versions": {
    "<grade_number_as_string>": {
      "explanation": "grade-appropriate explanation",
      "example": "one worked example appropriate to the grade",
      "key_vocabulary": ["term1", "term2"]
    }
  }
}
"""


async def generate_lesson(subject: str, concept_id: str, source_text: str, grades: list[int]) -> dict:
    user_prompt = (
        f"Subject: {subject}\n"
        f"Concept ID: {concept_id}\n"
        f"Target grades: {grades}\n\n"
        f"Source material:\n{source_text}"
    )
    result = await chat_json(SYSTEM_PROMPT, user_prompt, temperature=0.3)
    result["agent"] = "lesson_agent"
    result["subject"] = subject
    result["concept_id"] = concept_id
    return result
