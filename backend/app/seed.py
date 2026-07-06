"""
Run with:  python -m app.seed
Creates one demo teacher and the six students already shown in the frontend
mock data, so the real backend has matching roster data from the start.
"""
import asyncio

from .auth import hash_password
from .database import students_col, teachers_col, village_context_col

DEMO_TEACHER = {
    "name": "Demo Teacher",
    "email": "teacher@guru.ai",
    "password_hash": hash_password("password123"),
    "role": "teacher",
}

DEMO_STUDENTS = [
    {"name": "Chandrika", "grade": 2, "roll_number": "R001", "preferred_language": "Kannada"},
    {"name": "Vinay", "grade": 4, "roll_number": "R002", "preferred_language": "Kannada"},
    {"name": "Fatima", "grade": 3, "roll_number": "R003", "preferred_language": "Hindi"},
    {"name": "Manju", "grade": 1, "roll_number": "R004", "preferred_language": "Kannada"},
    {"name": "Ashwini", "grade": 5, "roll_number": "R005", "preferred_language": "English"},
    {"name": "Prakash", "grade": 2, "roll_number": "R006", "preferred_language": "Kannada"},
]


DEMO_VILLAGE_ID = "chintamani_apmc"

DEMO_VILLAGE_CONTEXT = [
    {"village_id": DEMO_VILLAGE_ID, "category": "crops", "fact": "Farmers here mainly grow tomatoes, mangoes, and ragi (finger millet)."},
    {"village_id": DEMO_VILLAGE_ID, "category": "market", "fact": "The weekly APMC market day is Wednesday, where farmers sell produce by the crate and by weight in kilograms."},
    {"village_id": DEMO_VILLAGE_ID, "category": "geography", "fact": "The village is near a seasonal lake (kere) used for irrigation during the monsoon."},
    {"village_id": DEMO_VILLAGE_ID, "category": "festival", "fact": "Ugadi and the local jatre (village fair) are the two biggest yearly community events."},
    {"village_id": DEMO_VILLAGE_ID, "category": "daily_life", "fact": "Most families keep a few chickens or a milch cow, and children often help count eggs or measure milk in litres before school."},
]


async def seed():
    if not await teachers_col.find_one({"email": DEMO_TEACHER["email"]}):
        await teachers_col.insert_one(DEMO_TEACHER)
        print(f"Created demo teacher: {DEMO_TEACHER['email']} / password123")
    else:
        print("Demo teacher already exists, skipping.")

    for s in DEMO_STUDENTS:
        if not await students_col.find_one({"roll_number": s["roll_number"]}):
            await students_col.insert_one(s)
    print(f"Seeded {len(DEMO_STUDENTS)} students (idempotent).")

    if not await village_context_col.find_one({"village_id": DEMO_VILLAGE_ID}):
        await village_context_col.insert_many(DEMO_VILLAGE_CONTEXT)
        print(f"Seeded village_context for '{DEMO_VILLAGE_ID}' — use this as village_id when generating a lesson.")
    else:
        print("Village context already seeded, skipping.")


if __name__ == "__main__":
    asyncio.run(seed())
