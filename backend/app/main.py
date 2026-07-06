from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import ensure_indexes
from .routers import attendance, auth, classrooms, lessons, notes, parent, quizzes, students, sync, voice

app = FastAPI(title="GURU AI backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(students.router)
app.include_router(attendance.router)
app.include_router(notes.router)
app.include_router(sync.router)
app.include_router(lessons.router)
app.include_router(quizzes.router)
app.include_router(classrooms.router)
app.include_router(voice.router)
app.include_router(parent.router)


@app.on_event("startup")
async def on_startup():
    await ensure_indexes()


@app.get("/api/health")
async def health():
    return {"status": "ok"}
