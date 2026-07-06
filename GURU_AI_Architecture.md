# GURU AI — Technical Architecture & Build Blueprint
**Generative Unified Rural Education using Agentic Intelligence**
*Offline-First Multi-Agent AI Classroom Operating System*

---

## 1. Product Summary

GURU AI is not a chatbot — it is a classroom operating system. One teacher running Grades 1–5
in a single room uploads whatever they already have (a textbook photo, a blackboard photo, a
voice note) and a coordinated team of AI agents turns it into grade-differentiated lessons,
translations, spoken explanations, adaptive quizzes, and homework — all of which keep working
with zero internet, and sync silently the moment connectivity returns.

**Design constraints that shape every decision:**
- Shared low-end Android devices, multiple children per phone, no usernames/passwords for students.
- Intermittent/no connectivity — offline is the default state, not an edge case.
- Multilingual by default (Kannada, Hindi, Tamil, English, extensible).
- One adult (the teacher) manages 30–50 children of different ages/abilities simultaneously.

---

## 2. High-Level System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                 │
│   Next.js PWA (Teacher Web/Tablet)   │   Next.js PWA (Student Kiosk Mode) │
│   - IndexedDB local store            │   - IndexedDB local store          │
│   - Service Worker (offline cache)   │   - Service Worker                 │
│   - Background Sync API              │   - Local TTS/STT fallback cache   │
└───────────────────────────┬────────────────────────────────────────────┬─┘
                             │  REST/WebSocket (when online)              │
                             ▼                                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         API GATEWAY (FastAPI)                             │
│   AuthN/Z │ Rate limiting │ Request routing │ WebSocket hub for sync      │
└───────────────────────────┬────────────────────────────────────────────┬─┘
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR AGENT (LangGraph)                        │
│   Intent classification → Agent DAG planning → Parallel dispatch →        │
│   Result merge → Response synthesis → State checkpointing                 │
└──┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬────────────────┘
   │     │     │     │     │     │     │     │     │     │
   ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼
 Lesson Lang  Voice Quiz  Prog  Plan  Peer  Comm  Sync  Parent
 Agent  Agent Agent Agent Agent Agent Agent Agent Agent Agent
   │     │     │     │     │     │     │     │     │     │
   └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          DATA & MODEL LAYER                               │
│  PostgreSQL (relational: users, classes, progress, sync log)              │
│  MongoDB (documents: lessons, quizzes, transcripts, worksheets)           │
│  Redis (session cache, job queue, rate limits, pub/sub for live sync)     │
│  Qdrant/Chroma (vector store: concept embeddings, RAG over textbooks)     │
│  Object storage (S3-compatible: uploaded images/PDFs/audio)               │
│  LLM Providers: Gemini / OpenAI (text+vision) · Whisper (speech-to-text)  │
│  OCR: Tesseract / Google Vision (textbook & blackboard extraction)        │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Multi-Agent Design (LangGraph)

The **Orchestrator Agent** is a LangGraph `StateGraph` whose nodes are the specialist agents
below. Nodes run in parallel where their inputs don't depend on each other, and every state
transition is checkpointed to Postgres so a task can resume after a connectivity drop or app
restart (critical for low-end, low-battery rural devices).

| Agent | Responsibility | Primary inputs | Primary outputs |
|---|---|---|---|
| **Orchestrator** | Classifies intent, builds execution DAG, merges results, owns conversation state | Any user action | Unified response, updated state |
| **Lesson Agent** | Converts raw material (text/PDF/photo/voice) into grade-differentiated (1–5) lesson content | OCR/ASR text, curriculum metadata | Structured lesson JSON per grade |
| **Language Agent** | Translates/localizes lessons, quizzes, and UI strings; preserves pedagogical meaning, not literal translation | Lesson JSON, target language | Localized lesson JSON |
| **Voice Agent** | Text-to-speech for explanations; speech-to-text (Whisper) for student questions | Lesson text / audio blob | Audio file (TTS) or transcript (STT) |
| **Quiz Agent** | Generates adaptive, difficulty-scaling quizzes per concept per grade | Lesson JSON, student mastery vector | Quiz JSON with difficulty tags |
| **Progress Agent** | Scores attempts, updates per-concept mastery, writes to the student's Digital Twin | Quiz attempts, session logs | Mastery deltas, Digital Twin update |
| **Planner Agent** | Predicts next lesson plan from class-wide performance trends | Class mastery aggregates | Tomorrow's lesson plan draft |
| **Peer Learning Agent** | Matches strong/weak students on the same concept for buddy pairing | Mastery vectors across class | Suggested peer pairs + shared activity |
| **Community Knowledge Agent** | Rewrites generic examples using local village context (crops, markets, geography) | Lesson JSON, village profile config | Localized example variants |
| **Offline Sync Agent** | Queues all local writes, resolves conflicts, replays queue on reconnect | Local IndexedDB change log | Server-acknowledged sync batch |
| **Parent Communication Agent** | Converts progress data into a short voice message in the parent's language | Digital Twin snapshot | Audio message + text summary |

**Concept Dependency Graph** (used by Progress + Planner agents): a directed graph where each
node is a curriculum concept and edges encode prerequisite relationships (e.g. *Fractions (G4)
→ depends on → Division remainders (G3) → depends on → Basic division (G2)*). When a student
fails a concept repeatedly, the Progress Agent walks the graph backward to surface the most
likely root cause rather than just flagging the symptom.

---

## 4. Repository / Folder Structure

```
guru-ai/
├── apps/
│   ├── web/                          # Next.js 14 (App Router) PWA — teacher + student UI
│   │   ├── app/
│   │   │   ├── (teacher)/dashboard/
│   │   │   ├── (teacher)/upload/
│   │   │   ├── (teacher)/reports/
│   │   │   ├── (student)/select-profile/
│   │   │   ├── (student)/learn/[subject]/
│   │   │   ├── (student)/quiz/[quizId]/
│   │   │   ├── (parent)/updates/
│   │   │   └── api/ (BFF route handlers → FastAPI)
│   │   ├── components/
│   │   │   ├── ui/                   # ShadCN primitives
│   │   │   ├── dashboard/            # Charts, heatmaps, health score widgets
│   │   │   ├── agents/               # Agent status/architecture visualizations
│   │   │   └── offline/              # Sync indicator, offline banner
│   │   ├── lib/
│   │   │   ├── db/indexeddb.ts       # Dexie.js wrapper for local-first storage
│   │   │   ├── sync/syncEngine.ts    # Background Sync + conflict resolution
│   │   │   ├── api/client.ts
│   │   │   └── i18n/                 # next-intl locale bundles
│   │   ├── public/locales/{kn,hi,ta,en}/
│   │   ├── service-worker.ts
│   │   └── tailwind.config.ts
│   │
│   └── mobile-wrapper/               # (optional) Capacitor/PWA-to-APK wrapper for Play Store
│
├── services/
│   ├── gateway/                      # FastAPI API gateway
│   │   ├── main.py
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── lessons.py
│   │   │   ├── quizzes.py
│   │   │   ├── progress.py
│   │   │   ├── uploads.py
│   │   │   ├── sync.py
│   │   │   └── parent.py
│   │   ├── middleware/ (rate_limit.py, auth.py, request_logging.py)
│   │   └── websocket/sync_hub.py
│   │
│   ├── orchestrator/                 # LangGraph orchestration service
│   │   ├── graph.py                  # StateGraph definition & routing rules
│   │   ├── state.py                  # Shared TypedDict state schema
│   │   └── agents/
│   │       ├── lesson_agent.py
│   │       ├── language_agent.py
│   │       ├── voice_agent.py
│   │       ├── quiz_agent.py
│   │       ├── progress_agent.py
│   │       ├── planner_agent.py
│   │       ├── peer_learning_agent.py
│   │       ├── community_knowledge_agent.py
│   │       ├── offline_sync_agent.py
│   │       └── parent_communication_agent.py
│   │
│   ├── ingestion/                    # OCR + ASR pipeline
│   │   ├── ocr_service.py            # Tesseract / Vision API, handwriting mode for blackboard
│   │   └── asr_service.py            # Whisper wrapper
│   │
│   └── vector-index/                 # Embedding + retrieval service (Chroma/Qdrant client)
│       ├── indexer.py
│       └── retriever.py
│
├── packages/
│   ├── shared-types/                 # Shared TS + Pydantic schema definitions (OpenAPI-driven)
│   └── concept-graph/                # Concept Dependency Graph data + traversal utilities
│
├── infra/
│   ├── docker-compose.yml            # Local dev: postgres, mongo, redis, qdrant, minio
│   ├── k8s/                          # Production manifests (per-service deployments)
│   └── migrations/                   # Alembic (Postgres) + Mongo migration scripts
│
├── data/
│   ├── seed/                         # Sample students, classes, lessons, village profiles
│   └── curriculum/                   # Grade 1–5 concept taxonomy + dependency graph source
│
└── docs/
    ├── api-spec.yaml                 # OpenAPI 3.1
    ├── agent-protocols.md
    └── offline-sync-design.md
```

---

## 5. Database Schema

### 5.1 PostgreSQL — relational, transactional data

```sql
-- Schools & classrooms
CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  village TEXT,
  district TEXT,
  state TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id),
  grade_range TEXT NOT NULL,          -- e.g. '1-5'
  teacher_id UUID REFERENCES teachers(id)
);

CREATE TABLE teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  preferred_language TEXT DEFAULT 'kn',
  device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Students: profile-based, no login credentials
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID REFERENCES classrooms(id),
  name TEXT NOT NULL,
  grade INT NOT NULL CHECK (grade BETWEEN 1 AND 5),
  avatar_seed TEXT,
  preferred_language TEXT DEFAULT 'kn',
  parent_id UUID REFERENCES parents(id),
  shared_device_id TEXT,              -- links multiple students on one household phone
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE,
  preferred_language TEXT DEFAULT 'kn'
);

-- Attendance
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  date DATE NOT NULL,
  present BOOLEAN NOT NULL,
  synced_at TIMESTAMPTZ
);

-- Concept mastery (feeds Digital Twin + Concept Dependency Graph)
CREATE TABLE concept_mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  concept_id TEXT NOT NULL,           -- FK into curriculum concept taxonomy (data/curriculum)
  mastery_score NUMERIC(5,2) DEFAULT 0,   -- 0-100
  attempts INT DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  UNIQUE(student_id, concept_id)
);

-- Quiz attempts (raw event log; aggregated into concept_mastery)
CREATE TABLE quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id),
  quiz_id TEXT NOT NULL,              -- references Mongo quizzes._id
  concept_id TEXT NOT NULL,
  question_index INT,
  correct BOOLEAN,
  response_time_ms INT,
  answered_at TIMESTAMPTZ DEFAULT now(),
  device_id TEXT,
  synced BOOLEAN DEFAULT FALSE
);

-- Classroom Intelligence Score snapshots (engagement, no camera data)
CREATE TABLE classroom_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID REFERENCES classrooms(id),
  date DATE NOT NULL,
  score NUMERIC(5,2),
  signals JSONB                       -- {quiz_rhythm, response_variance, session_frequency, ...}
);

-- Offline sync ledger — every local write queues here until acknowledged
CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,          -- 'quiz_attempt' | 'attendance' | 'lesson_view' ...
  entity_payload JSONB NOT NULL,
  client_created_at TIMESTAMPTZ NOT NULL,
  server_received_at TIMESTAMPTZ DEFAULT now(),
  conflict_resolved BOOLEAN DEFAULT FALSE
);
```

### 5.2 MongoDB — flexible/content-heavy documents

```jsonc
// lessons collection
{
  "_id": "lesson_uuid",
  "classroom_id": "uuid",
  "source_upload_id": "upload_uuid",
  "subject": "Mathematics",
  "concept_id": "math.fractions.intro",
  "grade_versions": {
    "1": { "title": "...", "content_blocks": [...], "difficulty": "foundational" },
    "2": { ... },
    "5": { ... }
  },
  "languages": {
    "kn": { "text": "...", "audio_url": "..." },
    "hi": { "text": "...", "audio_url": "..." },
    "en": { "text": "...", "audio_url": "..." }
  },
  "community_examples": [
    { "generic": "...", "localized": "...", "village_tag": "chintamani_apmc" }
  ],
  "created_by_agent": "lesson_agent_v1",
  "created_at": "ISODate"
}

// quizzes collection
{
  "_id": "quiz_uuid",
  "lesson_id": "lesson_uuid",
  "concept_id": "math.fractions.intro",
  "grade": 4,
  "questions": [
    {
      "id": "q1",
      "prompt": { "kn": "...", "en": "..." },
      "options": [...],
      "correct_index": 1,
      "difficulty": "easy"
    }
  ],
  "adaptive_rules": { "escalate_after_correct": 2, "de_escalate_after_incorrect": 1 }
}

// digital_twins collection — the long-term memory per student
{
  "_id": "student_uuid",
  "concept_mastery_history": [
    { "concept_id": "...", "score": 78, "recorded_at": "ISODate" }
  ],
  "learning_pace": "moderate",
  "strengths": ["kannada.vocabulary", "math.addition"],
  "gaps": ["math.fractions", "kannada.conjuncts"],
  "peer_pairing_history": [...],
  "engagement_pattern": { "avg_session_minutes": 12, "preferred_time": "evening" }
}

// uploads collection — raw teacher material + processing status
{
  "_id": "upload_uuid",
  "type": "blackboard_photo",
  "storage_url": "s3://...",
  "ocr_text": "...",
  "processing_status": "completed",
  "generated_lesson_ids": ["lesson_uuid"]
}
```

### 5.3 Redis — ephemeral / high-speed layer
- `session:{device_id}` — active session cache
- `sync_queue:{device_id}` — pending sync job list (BullMQ/RQ-style)
- `ratelimit:{teacher_id}` — API throttling
- Pub/Sub channel `sync-events` — pushes live updates to connected teacher dashboards via WebSocket

### 5.4 Vector DB (Qdrant/Chroma)
- Collection `concept_embeddings` — embeddings of curriculum concepts for RAG-based retrieval when generating lessons/quizzes grounded in the correct grade-level content.
- Collection `village_context` — embeddings of local knowledge base entries (crops, geography, market terms) used by the Community Knowledge Agent.

---

## 6. API Structure (FastAPI, OpenAPI-first)

```
POST   /api/v1/auth/teacher/login          # phone + OTP
POST   /api/v1/auth/device/register        # binds shared device to school/classroom

POST   /api/v1/uploads                     # multipart: text/pdf/image/audio
GET    /api/v1/uploads/{id}/status

POST   /api/v1/lessons/generate            # triggers Orchestrator → Lesson+Language+Voice agents
GET    /api/v1/lessons/{id}?lang=kn&grade=3

POST   /api/v1/quizzes/generate            # concept_id, grade, student_id (adaptive seed)
POST   /api/v1/quizzes/{id}/attempt        # single answer event (offline-queued)
GET    /api/v1/quizzes/{id}/result

GET    /api/v1/students/{id}/digital-twin
GET    /api/v1/students/{id}/progress
GET    /api/v1/classrooms/{id}/health-score
GET    /api/v1/classrooms/{id}/weak-concepts     # Concept Dependency Graph output
GET    /api/v1/classrooms/{id}/peer-pairs        # Peer Learning Agent output
GET    /api/v1/classrooms/{id}/lesson-plan/tomorrow   # Planner Agent output

POST   /api/v1/voice/transcribe            # Whisper STT
POST   /api/v1/voice/synthesize            # TTS

POST   /api/v1/sync/push                   # batch of queued local mutations
GET    /api/v1/sync/pull?since={cursor}    # server → device delta sync

POST   /api/v1/parent/updates/generate     # Parent Communication Agent
GET    /api/v1/parent/updates/{parent_id}

WS     /ws/sync/{device_id}                # live sync + agent status stream
```

All write endpoints accept an idempotency key (`client_mutation_id`) so replayed offline
batches never double-apply.

---

## 7. Offline-First & Sync Architecture

**Principle:** the device is the source of truth for anything happening *right now*; the
server is the source of truth for anything shared across devices/students.

1. **Local store:** IndexedDB (via Dexie.js) mirrors the subset of Postgres/Mongo schema
   relevant to the current classroom/device — lessons already downloaded, quizzes, mastery
   scores, attendance for today.
2. **Every user action writes locally first** (attendance mark, quiz answer, voice question),
   tagged with `device_id`, `client_created_at`, and a UUID `client_mutation_id`.
3. **Service Worker + Background Sync API** detects connectivity and triggers `POST
   /sync/push` with the queued batch; on success, entries are marked `synced` and pruned.
4. **Conflict resolution:** last-write-wins per field for attendance/profile data; for
   `concept_mastery`, the server recomputes from the full `quiz_attempts` event log rather
   than trusting a client-sent aggregate — so replays are always safe and mastery is never
   double-counted.
5. **Content pre-caching:** once a lesson/quiz is generated, its assets (text, audio, images)
   are cached via Service Worker `CacheStorage` so a device that goes offline mid-lesson can
   continue uninterrupted.
6. **Bandwidth-aware sync:** when connectivity is detected, the client requests a diff
   (`/sync/pull?since=cursor`) rather than a full re-download, and audio assets sync last /
   at lowest priority behind text and mastery data.

---

## 8. Authentication Model

- **Teachers:** phone number + OTP (SMS when online; pre-shared offline PIN fallback when
  registering a new device without connectivity, reconciled on next sync).
- **Students:** no credentials. Profile selection only, scoped to the physical device
  (`shared_device_id`), similar to a Netflix profile picker. A device is bound to a
  classroom during teacher setup, so a student profile only ever appears on devices
  belonging to their class.
- **Parents:** phone number only, used solely as a delivery channel for voice updates (SMS/IVR
  or app if available) — no login required.
- **Authorization:** teacher tokens scoped to their `classroom_id`; all API reads for student
  data are filtered server-side by classroom membership, never by client-supplied IDs alone.

---

## 9. Novel AI Feature — Implementation Notes

| Feature | How it actually works |
|---|---|
| **AI Digital Twin** | `digital_twins` Mongo document, updated incrementally by the Progress Agent after every quiz attempt; not regenerated from scratch, so it accumulates a genuine multi-year history. |
| **Predictive Lesson Planning** | Planner Agent runs nightly (or on-demand) over the classroom's `concept_mastery` aggregates + the Concept Dependency Graph to draft tomorrow's plan, ranked by number of students blocked on each concept. |
| **Peer Learning Recommendations** | Peer Learning Agent pairs students where `mastery(A, concept) - mastery(B, concept) > threshold` and both are in a compatible grade band, avoiding repeat pairings via `peer_pairing_history`. |
| **Community Knowledge Engine** | RAG pipeline: village profile (crops, market names, geography) stored as embeddings in Qdrant; Community Knowledge Agent retrieves relevant local entities and rewrites lesson examples via LLM prompt-grounding, never inventing ungrounded local facts. |
| **Concept Dependency Graph** | Static curriculum graph (`data/curriculum/dependency_graph.json`) authored from the syllabus, traversed backward from a failed concept to surface the most probable prerequisite gap. |
| **Classroom Intelligence Score** | Computed purely from *interaction telemetry* — quiz response-time variance, session frequency, question-attempt rhythm — explicitly excluding any camera/audio surveillance, aggregated into `classroom_health_scores.signals`. |
| **Offline-first architecture** | See Section 7. |
| **Long-term memory** | `digital_twins.concept_mastery_history` is append-only, so a Grade 5 lesson can reference a concept struggle from Grade 1 instead of starting cold each year. |

---

## 10. Suggested Build Sequence (MVP → Full Platform)

1. **Foundation:** Postgres + Mongo schemas, FastAPI gateway skeleton, Next.js PWA shell with IndexedDB wiring.
2. **Core loop:** Upload → OCR/ASR → Lesson Agent → single-language lesson rendering (prove the ingestion pipeline before adding agents).
3. **Multilingual + voice:** Language Agent, Voice Agent (Whisper + TTS), locale-switch UI.
4. **Assessment loop:** Quiz Agent + Progress Agent + Digital Twin, offline quiz-taking with sync.
5. **Teacher intelligence:** Classroom Health Score, weak-concept dashboard, Concept Dependency Graph traversal.
6. **Adaptive layer:** Planner Agent (predictive lesson plans), Peer Learning Agent.
7. **Localization depth:** Community Knowledge Agent + village profile RAG.
8. **Family loop:** Parent Communication Agent, SMS/voice delivery integration.
9. **Hardening:** offline sync stress-testing on real low-end devices, conflict-resolution edge cases, battery/data-usage optimization.

---

## 11. Sample Seed Data

`data/seed/` should include: 1 school, 1 combined classroom (Grades 1–5), ~40 students across
languages, 3 weeks of attendance + quiz-attempt history (to make the health-score trend and
weak-concept detection meaningful on first run), and a small village knowledge base (5–10
localized example entities) so the Community Knowledge Agent has something real to retrieve
from a demo.

---

*This document, together with the interactive product demo (`guru_ai_platform.jsx`), is meant
as the working blueprint for an engineering team to implement GURU AI as a real, deployable
platform — suitable for pilot deployment, research publication, or a government education
initiative proposal.*
