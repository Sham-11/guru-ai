"""
Parent Communication Agent
---------------------------
Converts a student's Digital Twin snapshot into a short, warm update in the
parent's language. Deliberately built as a *composition* of two agents
already built tonight (Progress Agent's data + Language Agent's translation)
rather than a new model call from scratch — matches how the architecture
doc frames it (Digital Twin snapshot -> audio message + text summary) and
means one fewer prompt to get right under time pressure.

Text-to-speech is deliberately NOT a backend call tonight: the browser's
built-in Web Speech API (speechSynthesis) turns this text into spoken audio
client-side for free, in the same target language, with zero API key and
zero latency. See frontend lib/voice.ts.
"""
from .language_agent import translate_text
from .progress_agent import get_digital_twin

TEMPLATES = {
    "no_data": "We don't have enough activity yet to share an update for {name}.",
    "summary": (
        "Update on {name}: doing well in {strengths}. "
        "Could use a little extra practice on {gaps} this week."
    ),
}


async def generate_parent_update(student_id: str, student_name: str, parent_language: str) -> dict:
    twin = await get_digital_twin(student_id)

    if not twin or not twin.get("concept_mastery_history"):
        text_en = TEMPLATES["no_data"].format(name=student_name)
    else:
        strengths = ", ".join(twin.get("strengths", [])[:2]) or "several topics"
        gaps = ", ".join(twin.get("gaps", [])[:2]) or "nothing major right now"
        text_en = TEMPLATES["summary"].format(name=student_name, strengths=strengths, gaps=gaps)

    translated = text_en if parent_language == "en" else await translate_text(text_en, parent_language)

    return {
        "agent": "parent_communication_agent",
        "student_id": student_id,
        "language": parent_language,
        "text_en": text_en,
        "text_translated": translated,
        "tts_note": "Synthesize `text_translated` client-side via Web Speech API — see lib/voice.ts",
    }
