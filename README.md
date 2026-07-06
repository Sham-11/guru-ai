# GURU AI — Rural Classroom Copilot (Frontend Demo)

**Generative Unified Rural Education using Agentic Intelligence**

This is a runnable Next.js (App Router + TypeScript + Tailwind) project containing the
interactive GURU AI product demo: an Overview/landing page, Teacher Dashboard, Student Mode,
and a clickable Multi-Agent Architecture diagram — built with mock data so it runs standalone,
no backend required.

For the full system design (multi-agent backend, database schema, offline-sync architecture,
API spec), see `GURU_AI_Architecture.md` in the project root — that's the blueprint for turning
this into the real production platform.

## Run it

Requirements: **Node.js 18.18+** (Node 20 LTS recommended) and npm.

```bash
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

## Other scripts

```bash
npm run build   # production build
npm run start   # run the production build locally
npm run lint    # lint the project
```

## Project structure

```
guru-ai/
├── app/
│   ├── page.tsx        # the GURU AI demo (Overview / Teacher / Student / Agents views)
│   ├── layout.tsx       # root layout + page metadata
│   └── globals.css      # Tailwind entrypoint
├── public/               # static assets
├── GURU_AI_Architecture.md   # full backend/system architecture blueprint
├── package.json
└── tsconfig.json
```

## What's real vs. mock in this build

- **Real:** the entire UI, layout, interactivity, charts (Recharts), icons (Lucide),
  view routing (client-side state), the agent-architecture diagram, and the offline-mode toggle
  in the top nav (visually flips UI state — no actual device network detection yet).
- **Mock:** all student/classroom data is hardcoded sample data in `app/page.tsx`
  (`students`, `weeklyClassHealth`, `weakConcepts`, etc.) — there is no database or LLM call
  wired in yet. See `GURU_AI_Architecture.md` for how to build the real FastAPI + LangGraph
  + Postgres/Mongo/Redis backend that would replace this mock layer.

## Notes on the demo page

`app/page.tsx` is fully typed TypeScript (no `@ts-nocheck`, no `any`) and passes both
`npm run build` and `npm run lint` with zero errors or warnings. All student/agent/UI shapes
(`Student`, `Agent`, `ViewId`, `PillTone`, `LangKey`) are defined at the top of the file.
As you wire in a real backend, it's still worth splitting it into components under `components/`
so each piece (students, agents, lessons) lives in its own file —
`packages/shared-types` in the architecture doc's proposed structure is where the shared
interfaces would live in the full monorepo.

## Next steps

1. Read `GURU_AI_Architecture.md` for the full multi-agent backend design.
2. Stand up the backend services (FastAPI gateway + LangGraph orchestrator + Postgres/Mongo/Redis)
   described there.
3. Replace the mock arrays in `app/page.tsx` with real API calls (`fetch`/React Query) against
   that backend.
4. Add the offline-first layer (IndexedDB + Service Worker) as described in the architecture doc's
   Offline-First & Sync Architecture section.
