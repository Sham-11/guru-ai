"""
Language Agent
--------------
Translates/localises already-generated lesson content into target languages,
preserving pedagogical meaning rather than doing literal word-for-word
translation (a literal translation of a math explanation often reads as
nonsense in Kannada/Hindi — this agent is told explicitly to prioritise
a native-speaker teacher's phrasing over literal fidelity).
"""
from ..services.groq_client import chat_json

LANGUAGE_NAMES = {"en": "English", "kn": "Kannada", "hi": "Hindi", "ta": "Tamil"}

SYSTEM_PROMPT = """You are the Language Agent inside GURU AI. You translate classroom lesson \
content for rural Indian primary school students (Grades 1-5).

Critical rule: translate for MEANING and natural classroom phrasing a native-speaking teacher \
would actually say out loud — not literal word-for-word translation. Preserve all numbers, \
proper nouns, and the pedagogical structure exactly.

You will receive lesson content already split by grade. Translate every text field into \
each requested target language, keeping the same grade structure.

Respond ONLY with JSON in this exact shape:
{
  "translations": {
    "<language_code>": {
      "title": "...",
      "grade_versions": {
        "<grade_number_as_string>": {
          "explanation": "...",
          "example": "...",
          "key_vocabulary": ["...", "..."]
        }
      }
    }
  }
}
"""


async def translate_lesson(lesson_content: dict, target_langs: list[str]) -> dict:
    lang_list = ", ".join(f"{code} ({LANGUAGE_NAMES.get(code, code)})" for code in target_langs)
    user_prompt = (
        f"Target languages: {lang_list}\n\n"
        f"Lesson content to translate:\n{lesson_content}"
    )
    result = await chat_json(SYSTEM_PROMPT, user_prompt, temperature=0.3)
    result["agent"] = "language_agent"
    return result


async def translate_text(text: str, target_lang: str) -> str:
    """Lighter-weight path used by the Parent Communication Agent — plain text in, plain text out."""
    lang_name = LANGUAGE_NAMES.get(target_lang, target_lang)
    system = (
        "You are the Language Agent inside GURU AI. Translate the given short message into "
        f"{lang_name}, in warm, plain, spoken language suitable for a parent with limited literacy. "
        'Respond ONLY with JSON: {"translated": "..."}'
    )
    result = await chat_json(system, text, temperature=0.3)
    return result.get("translated", text)
