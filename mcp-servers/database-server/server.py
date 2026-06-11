"""
MCP Server: MongoDB database operations
Transport: stdio
"""
import asyncio
import json
import os
import sys
from datetime import datetime, timedelta, timezone

import motor.motor_asyncio
from bson import ObjectId
from dotenv import load_dotenv
from mcp.server import Server
from mcp.server.stdio import stdio_server
import mcp.types as types

load_dotenv()

server = Server("database-server")

_client: motor.motor_asyncio.AsyncIOMotorClient | None = None


def _get_db():
    global _client
    if _client is None:
        uri = os.getenv("MONGODB_URI")
        if not uri:
            raise RuntimeError("MONGODB_URI not set in environment")
        _client = motor.motor_asyncio.AsyncIOMotorClient(uri)
    return _client["jobhunt"]


def _serialize(doc: dict) -> dict:
    """Convert MongoDB document to JSON-serializable dict."""
    result = {}
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
        elif isinstance(value, dict):
            result[key] = _serialize(value)
        elif isinstance(value, list):
            result[key] = [
                _serialize(v) if isinstance(v, dict) else str(v) if isinstance(v, ObjectId) else v
                for v in value
            ]
        else:
            result[key] = value
    return result


# ── Tool implementations ──────────────────────────────────────────────────────

async def _save_job(job_data: dict) -> dict:
    db = _get_db()
    job_data.setdefault("status", "new")
    job_data.setdefault("scraped_at", datetime.now(timezone.utc).isoformat())

    # Store posted_at as a proper BSON datetime for reliable range queries.
    # Drop it entirely when null so $gte filters don't match docs without a date.
    if "posted_at" in job_data:
        if job_data["posted_at"] is None:
            del job_data["posted_at"]
        elif isinstance(job_data["posted_at"], str):
            try:
                job_data["posted_at"] = datetime.fromisoformat(job_data["posted_at"])
            except ValueError:
                del job_data["posted_at"]

    # Upsert on (user_id + url) to avoid duplicates
    filter_q = {
        "user_id": job_data.get("user_id"),
        "url": job_data.get("url"),
    }
    update = {"$set": job_data}
    result = await db.jobs.update_one(filter_q, update, upsert=True)

    upserted_id = result.upserted_id
    if upserted_id:
        return {"inserted_id": str(upserted_id), "action": "inserted"}
    return {"matched_count": result.matched_count, "action": "updated"}


async def _get_jobs(filters: dict) -> list[dict]:
    db = _get_db()
    query: dict = {}

    if filters.get("user_id"):
        query["user_id"] = filters["user_id"]
    if filters.get("platform"):
        query["platform"] = filters["platform"]
    if filters.get("status"):
        query["status"] = filters["status"]
    if filters.get("min_score") is not None:
        query["fit_score"] = {"$gte": int(filters["min_score"])}
    if filters.get("posted_within_hours") is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(
            hours=int(filters["posted_within_hours"])
        )
        query["posted_at"] = {"$gte": cutoff}

    limit = int(filters.get("limit", 50))
    cursor = db.jobs.find(query).sort("fit_score", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [_serialize(doc) for doc in docs]


async def _update_job_status(job_id: str, status: str) -> dict:
    db = _get_db()
    valid_statuses = {"new", "saved", "applied", "rejected", "interview"}
    if status not in valid_statuses:
        raise ValueError(f"Invalid status '{status}'. Must be one of {valid_statuses}")

    result = await db.jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"matched_count": result.matched_count, "modified_count": result.modified_count}


# ── MCP tool definitions ──────────────────────────────────────────────────────

@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="save_job",
            description="Save or update a job in MongoDB. Deduplicates on (user_id, url).",
            inputSchema={
                "type": "object",
                "properties": {
                    "job_data": {
                        "type": "object",
                        "description": (
                            "Job document. Expected fields: user_id, title, company, platform, "
                            "location, url, description, fit_score, fit_reason, status."
                        ),
                    }
                },
                "required": ["job_data"],
            },
        ),
        types.Tool(
            name="get_jobs",
            description="Retrieve jobs from MongoDB with optional filters.",
            inputSchema={
                "type": "object",
                "properties": {
                    "filters": {
                        "type": "object",
                        "description": (
                            "Filter fields: user_id (str), platform (str), status (str), "
                            "min_score (int), posted_within_hours (int), limit (int, default 50)."
                        ),
                        "default": {},
                    }
                },
                "required": [],
            },
        ),
        types.Tool(
            name="update_job_status",
            description="Update the status of a job by its MongoDB ObjectId.",
            inputSchema={
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "MongoDB ObjectId string of the job document.",
                    },
                    "status": {
                        "type": "string",
                        "description": "New status: new | saved | applied | rejected | interview",
                        "enum": ["new", "saved", "applied", "rejected", "interview"],
                    },
                },
                "required": ["id", "status"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    try:
        if name == "save_job":
            result = await _save_job(arguments["job_data"])
        elif name == "get_jobs":
            result = await _get_jobs(arguments.get("filters", {}))
        elif name == "update_job_status":
            result = await _update_job_status(arguments["id"], arguments["status"])
        else:
            raise ValueError(f"Unknown tool: {name}")
    except Exception as exc:
        sys.stderr.write(f"[database-server] tool error ({name}): {exc}\n")
        result = {"error": str(exc)}

    return [types.TextContent(type="text", text=json.dumps(result, ensure_ascii=False))]


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


if __name__ == "__main__":
    asyncio.run(main())
