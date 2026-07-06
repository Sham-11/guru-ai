# GURU AI — Offline Sync Implementation

This adds a real, working offline-first sync layer on top of the existing
frontend, plus the minimum backend needed for it to sync *to* something real
(MongoDB). The UI, theme, and layout are unchanged — the same "Online ·
Synced" pill and upload/attendance controls now do real work instead of
being cosmetic.

## What was built

**Frontend (`lib/offline/`, `hooks/useOfflineSync.ts`, `public/sw.js`)**
- `lib/offline/db.ts` — IndexedDB schema (via `idb`): a `syncQueue` store
  (every offline action, idempotency-keyed) and a `cache` store (last-known
  server data).
- `lib/offline/syncManager.ts` — connectivity tracking (real
  `navigator.onLine` + a manual override so the existing UI toggle still
  works as a demo switch), batch flushing to the backend, retry with
  attempt-capping, and a tiny pub/sub so any component can show live status.
- `public/sw.js` — registers for the Background Sync API (`sync` event,
  tag `guru-flush-queue`), so a queued action still syncs even if the tab is
  backgrounded or closed when connectivity returns (where the browser
  supports it — it degrades gracefully to the `online`/`offline` window
  events everywhere else).
- `hooks/useOfflineSync.ts` — the React binding: `status`, `pendingCount`,
  `enqueue(type, payload)`, `setForcedOffline(bool)`.
- Wired into `app/page.tsx`: the top-nav status pill now reflects real
  status (`Online · Synced` / `Syncing N items…` / `Offline · N queued`),
  the "Offline Sync Queue" stat card shows the real pending count, and the
  student list has working **Present / Absent** buttons plus the lesson
  upload modal now actually queues an operation — both go through
  `sync.enqueue(...)`, work identically online or offline, and are visibly
  queued/synced.

**Backend (`backend/`)** — FastAPI + MongoDB (Motor), just enough to be a
real sync target:
- `POST /api/sync/batch` — the one endpoint every queued op flushes to.
  Idempotent via a client-generated `client_op_id` recorded in `sync_log`,
  so a retried batch (e.g. after a connection drop mid-flush) never
  double-writes. Partial-failure-safe: one bad op doesn't sink the batch.
- `POST /api/auth/signup` / `POST /api/auth/login` — JWT auth for teachers
  (and students, once created by a teacher).
- Read endpoints: `/api/students`, `/api/attendance/by-date/{date}`,
  `/api/attendance/student/{id}`, `/api/notes` — attendance and notes are
  *written* only via the sync endpoint, so an offline mark and an online
  mark take the exact same code path and can never diverge.

## Run it

**Backend**
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # fill in MONGODB_URI, JWT_SECRET, your AI key
python -m app.seed        # creates a demo teacher (teacher@guru.ai / password123) + 6 students
uvicorn app.main:app --reload --port 8000
```

**Frontend**
```bash
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev
```

Log in isn't wired into the UI yet in this pass (the dashboard is still
reachable directly, matching the current demo flow) — `lib/api.ts` and the
auth endpoints are ready for a login screen whenever you want one. For now,
`useOfflineSync`'s calls to `/api/sync/batch` will 401 until a token is
stored in `localStorage` under `guru_ai_token`; the quickest way to test
end-to-end right now is to call `authApi.login("teacher@guru.ai",
"password123")` once from the browser console, or wire it into a login form
next.

## Try the offline flow

1. Start both servers, open the Teacher Dashboard.
2. Click the top-right pill to flip into forced-offline mode (or actually
   disconnect your network).
3. Mark a couple of students present/absent, or queue a lesson upload.
   Notice the pill switches to "Offline · N queued" and the stat card
   counts them.
4. Click the pill again (or reconnect). Within a second or two it flips to
   "Syncing…" then "Online · Synced", and the ops are gone from IndexedDB
   and now sit in MongoDB's `attendance` / `lesson_uploads` collections.
5. Refresh mid-offline, or even close the tab (on a browser that supports
   Background Sync) — the queue survives in IndexedDB and flushes as soon
   as the service worker sees connectivity return.

## Next slice

The other three priorities from the original spec (real dashboards/auth
wired into the UI, AI report generation, real multilingual translation)
build naturally on top of this: they're all just more `enqueue(...)` calls
and more `router.py` files following the same pattern established here.
