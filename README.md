# GURU AI — Rural Classroom Copilot

**Generative Unified Rural Education using Agentic Intelligence**

An AI teaching assistant for a single teacher running Grades 1–5 together in one rural
classroom. A teacher types or pastes source material (standing in for an OCR'd textbook or
blackboard photo), and a set of specialized agents — running in parallel — turn it into
grade-differentiated lessons, translations, localized examples, and adaptive quizzes.

This is a **full-stack app with a real backend**: a Next.js frontend talking to a FastAPI +
MongoDB backend that makes real Groq LLM calls. It is not a mock/demo shell — see "What's real"
below for exactly what's wired up.

## Architecture at a glance

```
Next.js frontend (app/)  ──HTTP──▶  FastAPI backend (backend/app/)  ──▶  Groq (LLM + Whisper STT)
                                            │
                                            ▼
                                        MongoDB
                                            ▲
                                            │
                              MCP server (backend/app/mcp_server.py)
                         exposes the same agents over the Model Context Protocol
```

For the original full production-scale system design (Postgres/Redis/Qdrant, LangGraph,
multi-region deployment), see `GURU_AI_Architecture.md` — that document describes a larger
target architecture; this repo implements a real, working subset of it end-to-end (documented
honestly below), not the full blueprint.

## Run it

### Requirements
- **Node.js 18.18+** (Node 20 LTS recommended) and npm
- **Python 3.11+**
- A **MongoDB** connection (free MongoDB Atlas cluster, or local `mongod`)
- A free **Groq API key** — https://console.groq.com/keys

### 1. Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env             # fill in MONGODB_URI and GROQ_API_KEY
python -m app.seed               # creates demo teacher + 6 students + village context
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend (new terminal)
```bash
cp .env.local.example .env.local   # points the frontend at http://localhost:8000
npm install
npm run dev
```

Open **http://localhost:3000** → **Live Agents** tab → "Connect to backend" → "Run the
Orchestrator".

### 3. (Optional) MCP server
Exposes the Lesson, Community Knowledge, and Quiz agents as standard MCP tools, callable from
any MCP client (Claude Desktop, the MCP Inspector, etc.) instead of only the REST API:
```bash
cd backend
npx @modelcontextprotocol/inspector python -m app.mcp_server
```

### Other frontend scripts
```bash
npm run build   # production build
npm run start   # run the production build locally
npm run lint    # lint the project
```

## Project structure

```
guru-ai-build/
├── app/
│   └── page.tsx              # Overview / Teacher Dashboard / Student Mode / Agent
│                              #   Architecture / Live Agents — all views, one file
├── lib/
│   ├── api.ts                 # typed client for every real backend endpoint
│   ├── voice.ts                # Web Speech API (TTS) + mic recording (STT)
│   └── offline/                # IndexedDB queue + sync manager (offline-first writes)
├── hooks/useOfflineSync.ts
├── backend/
│   └── app/
│       ├── agents/             # Lesson, Language, Quiz, Community Knowledge, Progress,
│       │                       #   Planner, Peer Learning, Parent Communication, Voice
│       ├── agents/orchestrator.py   # fans out to agents in parallel, times each one
│       ├── routers/             # FastAPI routes — one file per resource
│       ├── security.py          # prompt-injection screening + rate limiting
│       ├── mcp_server.py        # same agents, exposed over MCP
│       ├── skills/
│       │   └── localize-for-village/   # SKILL.md + RESOURCES.md (Agent Skills pattern)
│       ├── seed.py               # demo teacher + 6 students + one village's local context
│       └── main.py
├── GURU_AI_Architecture.md    # the larger target system design (see note above)
├── LIVE_AGENTS_README.md      # walkthrough of the Live Agents tab specifically
├── OFFLINE_SYNC_README.md     # walkthrough of the offline-first sync design
└── package.json
```

## What's real vs. still a gap

**Real and working:**
- Lesson Agent — real Groq calls generating grade-1-through-5 differentiated content from
  whatever source text you give it
- Language Agent — real Kannada/Hindi translation, spoken aloud via the Web Speech API
- Quiz Agent — real 5-question, difficulty-tagged quiz generation
- Community Knowledge Agent — real localization against a seeded `village_context` collection
- A real adaptive quiz-taking screen (Student Mode) that escalates/de-escalates difficulty and
  writes real mastery scores to MongoDB via the Progress Agent
- Planner Agent + Peer Learning Agent — real endpoints, surfaced as buttons on the Teacher
  Dashboard ("what to focus on tomorrow", "suggest peer pairs")
- Parent Communication Agent — generates and speaks a real parent update in Kannada/Hindi
- Voice Agent — real press-and-hold microphone recording, transcribed via Groq Whisper
- Offline-first writes — a real IndexedDB queue (`lib/offline/`) that syncs to MongoDB via an
  idempotent `/api/sync/batch` endpoint the moment connectivity returns
- Security — prompt-injection screening and per-teacher rate limiting on the LLM-backed
  lesson-generation endpoint
- An MCP server exposing three of the agents as standard MCP tools

**Known gaps, stated plainly:**
- No real OCR — "photo of a textbook/blackboard" is currently a text box you paste into, not
  actual image-to-text
- No production deployment — this runs locally (`localhost`) only; nothing is deployed to a
  cloud host yet
- Not built on Google's Agent Development Kit (ADK) — the multi-agent orchestration is
  hand-written async Python, not an ADK graph workflow
- `GURU_AI_Architecture.md` describes a larger target design (Postgres/Redis/Qdrant,
  LangGraph, multi-region) that this repo does not fully implement — treat it as a roadmap
  document, not a description of the current codebase