# GURU AI — Live Multi-Agent Build (tonight's work)

This adds real, working agents on top of the offline-sync backend from the
previous pass. Every agent below actually runs — this is not new mock data.

## What each agent does now

| Agent | Real implementation |
|---|---|
| **Orchestrator** | `backend/app/agents/orchestrator.py` — Lesson Agent runs first, then Language, Quiz (one per grade), and Community Knowledge fire **concurrently** via `asyncio.gather`. Every run logs real per-agent timings to `agent_runs` in MongoDB. |
| **Lesson Agent** | Real Groq LLM call. Raw text in, grade-differentiated JSON out. |
| **Language Agent** | Real Groq LLM call. Translates for pedagogical meaning, not literal word-for-word. |
| **Quiz Agent** | Real Groq LLM call. Difficulty-tagged (easy/medium/hard) question sets. |
| **Progress Agent** | Real logic, no LLM — deliberately deterministic (see the docstring in `progress_agent.py` for why). Updates mastery scores + the Digital Twin on every quiz attempt. |
| **Community Knowledge Agent** | Real Groq LLM call, grounded on a small seeded `village_context` collection (lightweight retrieval — see the docstring for why this isn't Qdrant yet). |
| **Planner Agent** | Real logic — ranks concepts by how many students in a group are "blocked" (mastery ≤ 50). |
| **Peer Learning Agent** | Real logic — pairs stronger/weaker students on a concept where the mastery gap ≥ 20. |
| **Parent Communication Agent** | Real — composes the Progress Agent's Digital Twin data with the Language Agent's translation into a short parent-language update. |
| **Voice Agent** | Real Groq Whisper transcription (STT) on the backend. Spoken output (TTS) runs **client-side** via the browser's Web Speech API — free, no key, see `lib/voice.ts`. |
| **Offline Sync Agent** | Unchanged from the previous pass — already real. |

## What's still simplified (be upfront about this in the demo)

- **No vector DB.** Community Knowledge retrieval is a small seeded collection, not Qdrant/Chroma embeddings. Same "retrieve then generate" pattern, swappable later — see the docstring in `community_knowledge_agent.py`.
- **No classrooms collection yet.** Planner/Peer Learning take an explicit list of `student_ids` rather than a `classroom_id`, since the roster already lives client-side.
- **No login screen for the demo widget.** The "Live Agents" tab logs in as the seeded demo teacher automatically when you click "Connect to backend."

## Run it

**1. Get a free Groq key:** https://console.groq.com/keys

**Backend**
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env
# edit .env — set MONGODB_URI and GROQ_API_KEY at minimum
python -m app.seed        # demo teacher + 6 students + village_context for the Community Knowledge Agent
uvicorn app.main:app --reload --port 8000
```

**Frontend**
```bash
cp .env.local.example .env.local
npm install
npm run dev
```

Open http://localhost:3000, go to the **Live Agents** tab, click "Connect to backend," then "Run the Orchestrator." You'll see real per-agent timings, real lesson/translation/quiz/localized-example output, and can click "Speak" to hear a translation via the browser's TTS.

## Verified tonight

- Backend imports cleanly with all 24 routes registered.
- Progress, Planner, and Peer Learning agents were run end-to-end against an in-memory Mongo-compatible store with simulated quiz attempts — mastery scoring, Digital Twin history, blocked-concept ranking, and peer pairing all behave correctly.
- Lesson/Language/Quiz/Community Knowledge agents are structurally verified (clean imports, correct prompts, graceful `503` with a clear message if `GROQ_API_KEY` is missing) — they need your Groq key to verify live output quality, which you should do before the demo.
- Frontend: `tsc --noEmit`, `next lint`, and `next build` all pass with zero errors/warnings.

## Honest framing for the capstone writeup

"Offline-first sync layer" and now "6 of 10 agents make real LLM/logic calls,
orchestrated with genuine parallelism" are both true claims you can make
confidently. The remaining gaps (vector DB, OCR/ASR pipeline, classrooms
collection, Postgres/Redis) are accurately described as roadmap, not done —
keep that framing rather than overclaiming, judges will ask.
