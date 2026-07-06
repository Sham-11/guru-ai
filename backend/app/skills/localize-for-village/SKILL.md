---
name: localize-for-village
description: Use this skill whenever generic lesson examples need to be rewritten using a specific village's local context (crops, market names, geography, festivals), so a fractions lesson says "share 4 mangoes" instead of an abstract example a rural student has never seen. Trigger whenever a lesson has been generated and a village_id is available.
---

# Localize for Village

## When to use this
After the Lesson Agent produces grade-differentiated content, and a
`village_id` is available, use this skill to swap generic examples for
locally grounded ones — this is what makes a fractions lesson land for a
student in a village that's never seen a "pizza cut into slices" but has
seen a market stall selling mangoes.

## How it works (progressive disclosure)
This SKILL.md is the lightweight "menu" entry — the orchestrator only loads
the full local-context facts (`RESOURCES.md` below) once it has actually
decided to localize a lesson, rather than stuffing every village's data
into every prompt regardless of whether it's needed. This keeps token cost
down and avoids "context rot" from irrelevant grounding data.

## Steps
1. Look up local context facts for the target `village_id` (category + fact
   pairs: crops, market names, geography, festivals — see
   `RESOURCES.md` for the schema and current seeded villages).
2. For each grade's example in the lesson, check whether it can be
   naturally rewritten using ONLY the facts retrieved in step 1.
3. If a natural fit exists, rewrite it; if not, leave the example generic —
   never invent a local fact that wasn't retrieved.
4. Tag each localized example with which village fact it drew from
   (`village_tag`), so a teacher can verify it's grounded, not hallucinated.

## Implementation
The concrete implementation of this skill is
`app/agents/community_knowledge_agent.py::localize_lesson`. It is exposed
two ways so it's usable from either surface:
- REST: `POST /api/lessons/generate` (`generate_quiz=true`, orchestrator
  calls it automatically after the Lesson Agent finishes)
- MCP: `localize_lesson_tool` in `app/mcp_server.py`, callable directly by
  any MCP client

## Guardrails
- Never invent local facts not present in the retrieved context — this is
  enforced in the agent's own system prompt, not just this skill file.
- If no `village_context` is seeded for the given `village_id`, skip
  localization entirely and say so, rather than guessing.