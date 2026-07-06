"""
MongoDB connection (Motor async client) and typed collection accessors.

All collections used by the offline-sync-first design live here:

- teachers            : teacher accounts
- students            : student roster
- attendance          : one doc per (student, date) attendance mark
- notes               : teacher notes
- announcements       : class announcements
- lesson_uploads      : uploaded lesson material (metadata; files referenced by path/url)
- study_materials     : subject study material, translated into Kannada/Hindi/English
- homework            : homework/activities a teacher assigns per subject and grade
- homework_submissions: a student's graded attempt at a homework item, with mistakes
- sync_log            : audit trail of every op applied via the offline sync endpoint,
                         keyed by client-generated idempotency id so retried/duplicate
                         syncs from a flaky connection never double-write.

Agent-backed collections (added for the live multi-agent build):
- lessons             : Lesson Agent output — grade-differentiated, multilingual content
- quizzes             : Quiz Agent output — adaptive question sets per concept/grade
- concept_mastery     : Progress Agent's per-student-per-concept mastery scores
- digital_twins       : Progress Agent's long-term per-student memory (append-only history)
- village_context     : small local knowledge base the Community Knowledge Agent grounds on
- agent_runs          : Orchestrator's log of each multi-agent pipeline run (for the demo,
                         doubles as proof the agents actually ran in parallel with timings)
"""
from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings

_client = AsyncIOMotorClient(settings.mongodb_uri)
db = _client[settings.mongodb_db_name]

teachers_col = db["teachers"]
students_col = db["students"]
attendance_col = db["attendance"]
notes_col = db["notes"]
announcements_col = db["announcements"]
lesson_uploads_col = db["lesson_uploads"]
study_materials_col = db["study_materials"]
homework_col = db["homework"]
homework_submissions_col = db["homework_submissions"]
sync_log_col = db["sync_log"]

lessons_col = db["lessons"]
quizzes_col = db["quizzes"]
concept_mastery_col = db["concept_mastery"]
digital_twins_col = db["digital_twins"]
village_context_col = db["village_context"]
agent_runs_col = db["agent_runs"]


async def ensure_indexes():
    """Create indexes needed for correctness (uniqueness, idempotency) and speed."""
    await teachers_col.create_index("email", unique=True)
    await students_col.create_index("roll_number", unique=True)
    await attendance_col.create_index([("student_id", 1), ("date", 1)], unique=True)
    await sync_log_col.create_index("client_op_id", unique=True)
    await notes_col.create_index("teacher_id")
    await announcements_col.create_index("created_at")
    await study_materials_col.create_index([("subject_id", 1), ("grade", 1)])
    await homework_col.create_index([("subject_id", 1), ("grade", 1)])
    await homework_submissions_col.create_index([("homework_id", 1), ("student_id", 1)], unique=True)
    await concept_mastery_col.create_index([("student_id", 1), ("concept_id", 1)], unique=True)
    await digital_twins_col.create_index("student_id", unique=True)
    await lessons_col.create_index("concept_id")
    await quizzes_col.create_index("lesson_id")
    await village_context_col.create_index("village_id")
    await agent_runs_col.create_index("created_at")
