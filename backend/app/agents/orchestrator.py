"""
Orchestrator Agent
-------------------
The one piece that has to be true for "multi-agent" to mean anything: agents
whose inputs don't depend on each other actually run concurrently, not just
sequentially-but-labeled-as-agents.

Dependency shape for a lesson-generation request:

    Lesson Agent (must run first — everything else reads its output)
         │
         ├──► Language Agent        ┐
         ├──► Quiz Agent (per grade)├─ run concurrently via asyncio.gather
         └──► Community Knowledge   ┘   (only if village_id was given)

Every run is timestamped start/end per agent and logged to `agent_runs` —
in the demo, printing that log is the proof the "simultaneous" agents
actually overlapped in wall-clock time, not just in the pitch deck.
"""
import asyncio
import time
from datetime import datetime, timezone

from ..database import agent_runs_col, lessons_col, quizzes_col
from . import community_knowledge_agent, language_agent, lesson_agent, quiz_agent


async def _timed(agent_name: str, coro):
    start = time.monotonic()
    result = await coro
    elapsed_ms = round((time.monotonic() - start) * 1000)
    return agent_name, result, elapsed_ms


async def generate_lesson_package(
    subject: str,
    concept_id: str,
    source_text: str,
    grades: list[int],
    languages: list[str],
    village_id: str | None,
    generate_quiz: bool,
) -> dict:
    run_started_at = datetime.now(timezone.utc)
    timings: dict[str, int] = {}

    # Stage 1 — Lesson Agent runs alone; everything downstream reads its output.
    lesson_name, lesson_content, lesson_ms = await _timed(
        "lesson_agent", lesson_agent.generate_lesson(subject, concept_id, source_text, grades)
    )
    timings[lesson_name] = lesson_ms

    # Stage 2 — everything that only depends on lesson_content fires together.
    parallel_tasks = []

    if languages:
        parallel_tasks.append(_timed("language_agent", language_agent.translate_lesson(lesson_content, languages)))

    if generate_quiz:
        for grade in grades:
            grade_content = lesson_content.get("grade_versions", {}).get(str(grade))
            if grade_content:
                parallel_tasks.append(
                    _timed(f"quiz_agent_grade_{grade}", quiz_agent.generate_quiz(concept_id, grade, grade_content))
                )

    if village_id:
        parallel_tasks.append(
            _timed("community_knowledge_agent", community_knowledge_agent.localize_lesson(village_id, lesson_content))
        )

    parallel_results = await asyncio.gather(*parallel_tasks) if parallel_tasks else []

    translations = None
    quizzes_by_grade: dict[str, dict] = {}
    localization = None

    for name, result, elapsed_ms in parallel_results:
        timings[name] = elapsed_ms
        if name == "language_agent":
            translations = result
        elif name.startswith("quiz_agent_grade_"):
            grade = name.rsplit("_", 1)[-1]
            quizzes_by_grade[grade] = result
        elif name == "community_knowledge_agent":
            localization = result

    run_finished_at = datetime.now(timezone.utc)
    total_wall_ms = round((run_finished_at - run_started_at).total_seconds() * 1000)
    sum_of_agent_ms = sum(timings.values())

    lesson_doc = {
        "subject": subject,
        "concept_id": concept_id,
        "grade_versions": lesson_content.get("grade_versions", {}),
        "title": lesson_content.get("title"),
        "concept_summary": lesson_content.get("concept_summary"),
        "translations": translations.get("translations") if translations else {},
        "community_examples": localization.get("localized_examples") if localization else [],
        "created_by_agent": "lesson_agent",
        "created_at": run_finished_at,
    }
    insert_result = await lessons_col.insert_one(lesson_doc)
    lesson_id = str(insert_result.inserted_id)
    lesson_doc.pop("_id", None)

    quiz_ids: dict[str, str] = {}
    for grade, quiz in quizzes_by_grade.items():
        quiz_doc = {
            "lesson_id": lesson_id,
            "concept_id": concept_id,
            "grade": int(grade),
            "questions": quiz.get("questions", []),
        }
        quiz_insert = await quizzes_col.insert_one(quiz_doc)
        quiz_ids[grade] = str(quiz_insert.inserted_id)

    await agent_runs_col.insert_one(
        {
            "lesson_id": lesson_id,
            "concept_id": concept_id,
            "agents_run": list(timings.keys()),
            "timings_ms": timings,
            "total_wall_clock_ms": total_wall_ms,
            "sum_of_agent_ms": sum_of_agent_ms,
            "parallelism_saved_ms": max(sum_of_agent_ms - total_wall_ms, 0),
            "started_at": run_started_at,
            "finished_at": run_finished_at,
        }
    )

    return {
        "lesson_id": lesson_id,
        "lesson": lesson_doc,
        "quizzes": {grade: {"quiz_id": quiz_ids[grade], **quiz} for grade, quiz in quizzes_by_grade.items()},
        "localization": localization,
        "agent_timings_ms": timings,
        "total_wall_clock_ms": total_wall_ms,
        "sum_of_agent_ms": sum_of_agent_ms,
        "parallelism_saved_ms": max(sum_of_agent_ms - total_wall_ms, 0),
    }
