import asyncio
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import mcp.types as mcp_types
from openai import AsyncOpenAI

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MIN_FIT_SCORE = int(os.getenv("MIN_FIT_SCORE", "60"))
MODEL = "gpt-4o-mini"

_SERVERS_DIR = Path(__file__).parent.parent / "mcp-servers"

_SERVER_CONFIGS = {
    "naukri":     _SERVERS_DIR / "naukri-server"     / "server.py",
    "linkedin":   _SERVERS_DIR / "linkedin-server"   / "server.py",
    "internshala":_SERVERS_DIR / "internshala-server"/ "server.py",
    "indeed":     _SERVERS_DIR / "indeed-server"     / "server.py",
    "database":   _SERVERS_DIR / "database-server"   / "server.py",
}

openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)


# MCP helpers 

def _mcp_tool_to_openai(tool: mcp_types.Tool, server_prefix: str) -> dict:
    """Convert an MCP Tool to an OpenAI function-calling tool definition."""
    return {
        "type": "function",
        "function": {
            "name": f"{server_prefix}__{tool.name}",
            "description": tool.description or "",
            "parameters": tool.inputSchema,
        },
    }


async def _call_mcp_tool(session: ClientSession, tool_name: str, arguments: dict) -> Any:
    result = await session.call_tool(tool_name, arguments)
    # MCP returns a list of content blocks; combine text blocks
    texts = [block.text for block in result.content if hasattr(block, "text")]
    combined = "\n".join(texts)
    try:
        return json.loads(combined)
    except json.JSONDecodeError:
        return combined


# Scoring

_SCORE_SYSTEM = (
    "You are an expert technical recruiter. Given a job description and a candidate's resume, "
    "return a JSON object with exactly two keys:\n"
    "  fit_score: integer 0-100 (how well the candidate fits the role)\n"
    "  fit_reason: string of 2-3 sentences explaining the score.\n"
    "Respond with ONLY the JSON object, no markdown fences."
)


async def _score_job(job: dict, resume_text: str) -> tuple[int, str]:
    prompt = (
        f"Job Title: {job.get('title', 'N/A')}\n"
        f"Company: {job.get('company', 'N/A')}\n"
        f"Location: {job.get('location', 'N/A')}\n"
        f"Description: {job.get('description', '')[:1500]}\n\n"
        f"Candidate Resume:\n{resume_text[:3000]}"
    )
    try:
        response = await openai_client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": _SCORE_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=300,
        )
        raw = response.choices[0].message.content or "{}"
        data = json.loads(raw)
        return int(data.get("fit_score", 0)), str(data.get("fit_reason", ""))
    except Exception as exc:
        sys.stderr.write(f"[orchestrator] scoring error: {exc}\n")
        return 0, ""


# Collection agent loop

_SEARCH_SYSTEM = (
    "You are a job search agent. The user will provide their job preferences. "
    "Call the search tools on ALL platforms (naukri, linkedin, internshala, indeed) "
    "with appropriate queries derived from the user's roles and skills. "
    "Search at least once per platform. "
    "When you have collected results from all platforms, output a JSON array "
    'of all collected jobs under the key "jobs", then stop calling tools.'
)


async def _collect_jobs(
    search_sessions: dict[str, ClientSession],
    search_tools: list[dict],
    preferences: dict,
) -> list[dict]:
    """Run the agentic collection loop and return raw job dicts."""
    roles = ", ".join(preferences.get("roles", ["Software Developer"]))
    skills = ", ".join(preferences.get("skills", []))
    location = ", ".join(preferences.get("location", ["India"]))
    experience = preferences.get("experience", 0)

    user_msg = (
        f"Find jobs for someone with these preferences:\n"
        f"  Roles: {roles}\n"
        f"  Skills: {skills}\n"
        f"  Location: {location}\n"
        f"  Experience: {experience} years\n\n"
        "Search all platforms and return the collected jobs."
    )

    messages: list[dict] = [
        {"role": "system", "content": _SEARCH_SYSTEM},
        {"role": "user", "content": user_msg},
    ]

    all_jobs: list[dict] = []
    max_iterations = 12  # safety cap

    for _ in range(max_iterations):
        response = await openai_client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=search_tools,
            tool_choice="auto",
            temperature=0,
        )
        msg = response.choices[0].message
        messages.append(msg.model_dump(exclude_none=True))

        if not msg.tool_calls:
            # Model finished — parse final content
            content = msg.content or ""
            try:
                data = json.loads(content)
                if isinstance(data, dict) and "jobs" in data:
                    all_jobs.extend(data["jobs"])
                elif isinstance(data, list):
                    all_jobs.extend(data)
            except json.JSONDecodeError:
                pass
            break

        # Dispatch each tool call to the correct MCP server
        tool_results = []
        for tc in msg.tool_calls:
            fn_name: str = tc.function.name  # e.g. "naukri__search_jobs"
            args = json.loads(tc.function.arguments or "{}")

            # Route to the right server session
            parts = fn_name.split("__", 1)
            if len(parts) != 2:
                continue
            server_key, mcp_tool_name = parts

            session = search_sessions.get(server_key)
            if session is None:
                result_data = {"error": f"No session for server '{server_key}'"}
            else:
                try:
                    result_data = await _call_mcp_tool(session, mcp_tool_name, args)
                except Exception as exc:
                    result_data = {"error": str(exc)}

            # Collect jobs from this tool call
            if isinstance(result_data, list):
                all_jobs.extend(result_data)

            tool_results.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result_data, ensure_ascii=False),
            })

        messages.extend(tool_results)

    return all_jobs



def _params(key: str) -> StdioServerParameters:
    return StdioServerParameters(
        command=sys.executable,
        args=[str(_SERVER_CONFIGS[key])],
        env=dict(os.environ),
    )


async def run(user_id: str, preferences: dict, resume_text: str) -> list[dict]:
    """
    Run the full job-hunt pipeline for one user.

    Args:
        user_id:     MongoDB user _id string.
        preferences: Dict with keys: roles, skills, location, experience, salary_min.
        resume_text: Full resume as plain text.

    Returns:
        List of saved job dicts (those that met MIN_FIT_SCORE).
    """
    print(f"[orchestrator] Starting job hunt for user {user_id}", flush=True)

    # Build search args with fallbacks ──────────────────────────────────────
    roles = preferences.get("roles", [])
    locations = preferences.get("location", [])

    if not roles:
        roles = ["Software Engineer", "Developer"]
    if not locations:
        locations = ["India", "Remote"]

    query = " OR ".join(roles[:3])
    location = locations[0] if locations else "India"

    search_args = {
        "query": query,
        "location": location,
        "experience": preferences.get("experience", 0),
        "limit": 20,
    }

    print(f"[orchestrator] search query: {query} | location: {location}", flush=True)

    # Sequential scraping (one Chromium at a time to save memory)
    all_raw_jobs: list[dict] = []
    for server_name in ["naukri", "linkedin", "internshala", "indeed"]:
        try:
            jobs = await _open_and_collect(server_name, search_args)
            all_raw_jobs.extend(jobs)
            print(f"[orchestrator] {server_name}: {len(jobs)} jobs", flush=True)
        except Exception as e:
            print(f"[orchestrator] {server_name} failed: {e}", flush=True)

    print(f"[orchestrator] Collected {len(all_raw_jobs)} raw jobs", flush=True)

    # Score & filter
    score_tasks = [_score_job(job, resume_text) for job in all_raw_jobs]
    scores = await asyncio.gather(*score_tasks, return_exceptions=True)

    saved_jobs: list[dict] = []

    async with (
        stdio_client(_params("database")) as (db_read, db_write),
        ClientSession(db_read, db_write) as db_sess,
    ):
        await db_sess.initialize()

        for job, score_result in zip(all_raw_jobs, scores):
            if isinstance(score_result, Exception):
                continue
            fit_score, fit_reason = score_result
            if fit_score < MIN_FIT_SCORE:
                continue

            job_doc = {
                **job,
                "user_id": user_id,
                "fit_score": fit_score,
                "fit_reason": fit_reason,
                "status": "new",
            }

            try:
                await _call_mcp_tool(db_sess, "save_job", {"job_data": job_doc})
                saved_jobs.append(job_doc)
            except Exception as exc:
                print(f"[orchestrator] save_job error: {exc}", flush=True)

    if all_raw_jobs and not saved_jobs:
        sys.stderr.write(
            f"[orchestrator] WARNING: 0 jobs passed scoring threshold. "
            f"Check OpenAI API key or lower MIN_FIT_SCORE in .env\n"
        )

    print(
        f"[orchestrator] Done. Saved {len(saved_jobs)} / {len(all_raw_jobs)} jobs "
        f"(threshold {MIN_FIT_SCORE})",
        flush=True,
    )
    return saved_jobs


async def _open_and_collect(key: str, search_args: dict) -> list[dict]:
    """Open a single search server session, call search_jobs, and return jobs."""
    jobs: list[dict] = []
    try:
        async with stdio_client(_params(key)) as (r, w):
            async with ClientSession(r, w) as session:
                await session.initialize()
                result = await _call_mcp_tool(session, "search_jobs", search_args)
                if isinstance(result, list):
                    jobs.extend(result)
    except Exception as exc:
        print(f"[orchestrator] {key} FAILED: {type(exc).__name__}: {exc}", flush=True)
        print(traceback.format_exc(), flush=True)
    return jobs


# CLI entry

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run the job hunt agent manually")
    parser.add_argument("--user-id", required=True, help="MongoDB user _id")
    parser.add_argument("--roles", nargs="+", default=["Software Developer"])
    parser.add_argument("--skills", nargs="+", default=["Python"])
    parser.add_argument("--location", nargs="+", default=["India"])
    parser.add_argument("--experience", type=int, default=0)
    parser.add_argument("--resume", default="", help="Path to plain-text resume file")
    args = parser.parse_args()

    resume_text = ""
    if args.resume and Path(args.resume).exists():
        resume_text = Path(args.resume).read_text(encoding="utf-8")

    preferences = {
        "roles": args.roles,
        "skills": args.skills,
        "location": args.location,
        "experience": args.experience,
    }

    saved = asyncio.run(run(args.user_id, preferences, resume_text))
    print(f"Saved {len(saved)} jobs.", flush=True)
