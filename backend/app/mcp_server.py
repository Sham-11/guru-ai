"""
GURU AI — MCP Server
=====================
Exposes three of GURU AI's existing agent functions as Model Context
Protocol (MCP) tools, so any MCP-compatible client (Claude Desktop, the
MCP Inspector, another agent) can call them directly through the standard
protocol instead of a bespoke REST contract per integration — the
plug-and-play interoperability MCP was designed for.

This wraps the SAME agent code the FastAPI backend uses (agents/lesson_agent.py,
agents/community_knowledge_agent.py, agents/quiz_agent.py) — it's a second
transport for the same logic, not a reimplementation, so no behavior can
drift between the REST API and the MCP surface.

Run locally to smoke-test with the official MCP Inspector:
    cd backend
    npx @modelcontextprotocol/inspector python -m app.mcp_server

Or register it with Claude Desktop (claude_desktop_config.json):
    {
      "mcpServers": {
        "guru-ai": {
          "command": "python",
          "args": ["-m", "app.mcp_server"],
          "cwd": "/absolute/path/to/guru-ai-build/backend"
        }
      }
    }
"""
from __future__ import annotations

import json

from mcp.server.fastmcp import FastMCP

from .agents.community_knowledge_agent import localize_lesson
from .agents.lesson_agent import generate_lesson
from .agents.quiz_agent import generate_quiz
from .security import sanitize_source_text

mcp = FastMCP("guru-ai")


@mcp.tool()
async def generate_lesson_tool(subject: str, concept_id: str, source_text: str, grades: list[int]) -> str:
    """Generate grade-differentiated lesson content (Grades 1-5) from raw source material —
    a textbook excerpt, transcribed blackboard photo, or teacher notes — via GURU AI's Lesson Agent.

    Args:
        subject: e.g. "Mathematics"
        concept_id: a stable id for the concept, e.g. "math.fractions.intro"
        source_text: the raw material to teach from
        grades: which grades (1-5) to generate versions for, e.g. [1, 3, 5]

    Returns a JSON string: {title, concept_summary, grade_versions: {"<grade>": {explanation, example, key_vocabulary}}}
    """
    clean_text, _flags = sanitize_source_text(source_text)
    result = await generate_lesson(subject, concept_id, clean_text, grades)
    return json.dumps(result)


@mcp.tool()
async def localize_lesson_tool(village_id: str, lesson_content_json: str) -> str:
    """Rewrite a lesson's generic examples using a specific village's local context (crops,
    market names, geography) via GURU AI's Community Knowledge Agent, e.g. turning "cut a cake
    into 4 slices" into "share 4 mangoes from the Chintamani APMC market."

    Args:
        village_id: id of the seeded village_context to draw local facts from
        lesson_content_json: the JSON string returned by generate_lesson_tool

    Returns a JSON string: {localized_examples: [{grade, generic_example, localized_example, village_tag}]}
    """
    lesson_content = json.loads(lesson_content_json)
    result = await localize_lesson(village_id, lesson_content)
    return json.dumps(result)


@mcp.tool()
async def generate_quiz_tool(concept_id: str, grade: int, lesson_grade_content_json: str) -> str:
    """Generate a 5-question, difficulty-tagged (easy/medium/hard) multiple-choice quiz for one
    grade's lesson content via GURU AI's Quiz Agent.

    Args:
        concept_id: the concept this quiz tests, e.g. "math.fractions.intro"
        grade: which grade this quiz is for, e.g. 3
        lesson_grade_content_json: JSON string of that grade's {explanation, example, key_vocabulary}
            object (i.e. lesson["grade_versions"][str(grade)] from generate_lesson_tool's output)

    Returns a JSON string: {questions: [{id, prompt, options, correct_index, difficulty}]}
    """
    lesson_grade_content = json.loads(lesson_grade_content_json)
    result = await generate_quiz(concept_id, grade, lesson_grade_content)
    return json.dumps(result)


if __name__ == "__main__":
    mcp.run(transport="stdio")