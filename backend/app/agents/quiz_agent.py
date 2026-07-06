"""
Quiz Agent
----------
Generates a difficulty-tagged question set per concept per grade from
already-generated lesson content. Difficulty tags are what let the frontend
implement adaptive escalation (escalate after N correct, de-escalate after
a miss) without another model call per question.
"""
from ..services.groq_client import chat_json

SYSTEM_PROMPT = """You are the Quiz Agent inside GURU AI. Given lesson content for a specific \
grade, generate 5 multiple-choice questions that test the concept at increasing difficulty.

Rules:
- Question 1-2: "easy" — directly restates the explanation/example.
- Question 3: "medium" — requires applying the concept to a new but similar example.
- Question 4-5: "hard" — requires combining the concept with basic reasoning.
- Each question has exactly 4 options, only one correct.
- Keep language as simple as the grade level allows.

Respond ONLY with JSON in this exact shape:
{
  "questions": [
    {
      "id": "q1",
      "prompt": "...",
      "options": ["...", "...", "...", "..."],
      "correct_index": 0,
      "difficulty": "easy"
    }
  ]
}
"""


async def generate_quiz(concept_id: str, grade: int, lesson_grade_content: dict) -> dict:
    user_prompt = f"Concept: {concept_id}\nGrade: {grade}\n\nLesson content for this grade:\n{lesson_grade_content}"
    result = await chat_json(SYSTEM_PROMPT, user_prompt, temperature=0.5)
    result["agent"] = "quiz_agent"
    result["concept_id"] = concept_id
    result["grade"] = grade
    return result
