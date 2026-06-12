"""
FastAPI backend — exposes job data and triggers the agent orchestrator.

Routes:
  GET  /jobs                → list jobs (filters: platform, score, status)
  POST /jobs/scrape         → trigger agent run
  PUT  /jobs/{id}/status    → update job status
  POST /users               → create user profile
  GET  /users/{id}          → get user profile
  PUT  /users/{id}          → update user profile
  POST /users/parse-resume  → AI resume parsing
"""
import asyncio
import base64
import io
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from starlette.requests import Request
from starlette.responses import Response
from openai import AsyncOpenAI
from pydantic import BaseModel

from backend.auth import verify_jwt
from backend.database import close_client, get_db, serialize_doc
from backend.models import (
    JobResponse,
    JobStatusUpdate,
    ScrapeRequest,
    UserCreate,
    UserPreferences,
    UserResponse,
    UserUpdate,
)
from backend.routes.auth import router as auth_router

load_dotenv()

_openai_client: Optional[AsyncOpenAI] = None


def _get_openai() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _openai_client


# ── App lifecycle ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_client()


app = FastAPI(
    title="Job Hunt Agent API",
    description="AI-powered job aggregator backed by MCP servers and MongoDB",
    version="1.0.0",
    lifespan=lifespan,
)

_ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    *([os.getenv("FRONTEND_URL")] if os.getenv("FRONTEND_URL") else []),
}


@app.middleware("http")
async def cors_middleware(request: Request, call_next):
    origin = request.headers.get("origin", "")

    if request.method == "OPTIONS":
        response = Response()
        if origin in _ALLOWED_ORIGINS:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "*"
        return response

    response = await call_next(request)
    if origin in _ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
    return response


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    origin = request.headers.get("origin", "")
    if isinstance(exc, HTTPException):
        response = JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )
    else:
        response = JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )
    if origin in _ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
    return response


app.include_router(auth_router, prefix="/auth", tags=["auth"])


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Users ──────────────────────────────────────────────────────────────────────

@app.post("/users", response_model=UserResponse, status_code=201, dependencies=[Depends(verify_jwt)])
async def create_user(body: UserCreate):
    db = get_db()
    existing = await db.users.find_one({"email": body.email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    doc = body.model_dump()
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _user_response(doc)


class _ParseResumeRequest(BaseModel):
    user_id: str
    resume_text: Optional[str] = None
    resume_pdf: Optional[str] = None  # base64-encoded PDF
    filename: Optional[str] = "resume.pdf"


_PARSE_SCHEMA = (
    '{\n  "roles": ["..."],\n  "skills": ["..."],\n'
    '  "locations": ["..."],\n  "resume_text": "full extracted text"\n}'
)
_PARSE_INSTRUCTIONS = (
    "You are a resume parser. Extract from this resume:\n"
    "1. Top 5 most suitable job roles/titles for this person\n"
    "2. Top 10 technical skills\n"
    "3. Top 3 preferred work locations (infer from education/experience, always include Remote)\n"
    "4. The full resume text content\n\n"
    f"Respond ONLY with valid JSON:\n{_PARSE_SCHEMA}"
)


@app.post("/users/parse-resume", dependencies=[Depends(verify_jwt)])
async def parse_resume(body: _ParseResumeRequest):
    # ── Extract plain text from whichever source was provided ─────────────────
    if body.resume_pdf:
        try:
            from pypdf import PdfReader
            pdf_bytes = base64.b64decode(body.resume_pdf)
            reader = PdfReader(io.BytesIO(pdf_bytes))
            resume_text = "\n".join(
                page.extract_text() or "" for page in reader.pages
            ).strip()
            if not resume_text:
                raise HTTPException(
                    status_code=422,
                    detail="Could not extract text from PDF — try a text-based PDF or paste the text instead",
                )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"PDF parsing failed: {exc}")
    elif body.resume_text and body.resume_text.strip():
        resume_text = body.resume_text.strip()
    else:
        raise HTTPException(status_code=422, detail="Provide resume_pdf or resume_text")

    # ── Validate document is actually a resume ────────────────────────────────
    client = _get_openai()
    validation_prompt = (
        "You are a document classifier.\n"
        "Analyze this document and determine if it is a resume/CV.\n"
        "A resume typically contains: name, contact info, work experience, "
        "education, and/or skills.\n\n"
        'Respond ONLY with valid JSON:\n{"is_resume": true/false, "reason": "brief reason"}\n\n'
        f"Document:\n{resume_text[:2000]}"
    )
    validation_response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": validation_prompt}],
        response_format={"type": "json_object"},
        temperature=0,
    )
    validation = json.loads(validation_response.choices[0].message.content)
    if not validation.get("is_resume", False):
        raise HTTPException(
            status_code=422,
            detail=(
                f"The uploaded file does not appear to be a resume. "
                f"{validation.get('reason', '')} "
                f"Please upload your CV or resume."
            ),
        )

    # ── Send extracted text to GPT-4o-mini ────────────────────────────────────
    prompt = _PARSE_INSTRUCTIONS + f"\n\nResume:\n{resume_text}"
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.2,
    )

    result = json.loads(response.choices[0].message.content)
    # Always return the extracted text so the frontend can store it
    if not result.get("resume_text"):
        result["resume_text"] = resume_text
    return result


@app.get("/users/{user_id}", response_model=UserResponse, dependencies=[Depends(verify_jwt)])
async def get_user(user_id: str):
    db = get_db()
    doc = await db.users.find_one({"_id": _object_id(user_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_response(doc)


@app.put("/users/{user_id}", response_model=UserResponse, dependencies=[Depends(verify_jwt)])
async def update_user(user_id: str, body: UserUpdate):
    update_data: dict = {}
    if body.name is not None:
        update_data["name"] = body.name
    if body.resume_text is not None:
        update_data["resume_text"] = body.resume_text
    if body.preferences is not None:
        update_data["preferences"] = body.preferences.model_dump()

    if not update_data:
        raise HTTPException(status_code=422, detail="No fields to update")

    db = get_db()
    result = await db.users.find_one_and_update(
        {"_id": _object_id(user_id)},
        {"$set": update_data},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_response(result)


# ── Jobs ───────────────────────────────────────────────────────────────────────

@app.get("/jobs", response_model=list[JobResponse], dependencies=[Depends(verify_jwt)])
async def list_jobs(
    user_id: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    min_score: Optional[int] = Query(None, alias="minScore"),
    posted_within_hours: Optional[int] = Query(None),
    is_new: Optional[bool] = Query(None),
    limit: int = Query(50, le=200),
):
    db = get_db()
    query: dict = {}

    if user_id:
        query["user_id"] = user_id
    if platform:
        query["platform"] = platform
    if status:
        query["status"] = status
    if min_score is not None:
        query["fit_score"] = {"$gte": min_score}
    if posted_within_hours is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=posted_within_hours)
        query["posted_at"] = {"$gte": cutoff}
    if is_new is not None:
        cutoff_24h = datetime.now(timezone.utc) - timedelta(hours=24)
        query["scraped_at"] = {"$gte": cutoff_24h} if is_new else {"$lt": cutoff_24h}

    cursor = db.jobs.find(query).sort("fit_score", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [_job_response(d) for d in docs]


@app.post("/jobs/scrape", status_code=202, dependencies=[Depends(verify_jwt)])
async def trigger_scrape(body: ScrapeRequest):
    """
    Kick off the agent orchestrator asynchronously.
    Returns immediately; scraping/scoring runs in the background.
    """
    db = get_db()
    user_doc = await db.users.find_one({"_id": _object_id(body.user_id)})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    preferences = (
        body.preferences.model_dump()
        if body.preferences
        else user_doc.get("preferences", {})
    )
    resume_text = body.resume_text or user_doc.get("resume_text", "")

    # Import here to avoid circular deps at module load
    from agent.orchestrator import run as agent_run

    asyncio.create_task(
        agent_run(
            user_id=body.user_id,
            preferences=preferences,
            resume_text=resume_text,
        )
    )

    return {"message": "Scrape job started", "user_id": body.user_id}


@app.put("/jobs/{job_id}/status", response_model=JobResponse, dependencies=[Depends(verify_jwt)])
async def update_job_status(job_id: str, body: JobStatusUpdate):
    valid = {"new", "saved", "applied", "rejected", "interview"}
    if body.status not in valid:
        raise HTTPException(status_code=422, detail=f"status must be one of {valid}")

    db = get_db()
    result = await db.jobs.find_one_and_update(
        {"_id": _object_id(job_id)},
        {"$set": {"status": body.status}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_response(result)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _object_id(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except Exception:
        raise HTTPException(status_code=422, detail=f"Invalid ObjectId: {id_str}")


def _user_response(doc: dict) -> UserResponse:
    s = serialize_doc(doc)
    return UserResponse(
        id=s.get("id", s.get("_id", "")),
        name=s["name"],
        email=s["email"],
        resume_text=s.get("resume_text", ""),
        preferences=UserPreferences(**s.get("preferences", {})),
        created_at=s.get("created_at"),
        google_id=s.get("google_id"),
        picture=s.get("picture"),
    )


def _job_response(doc: dict) -> JobResponse:
    s = serialize_doc(doc)
    scraped_at = s.get("scraped_at")
    last_seen_at = s.get("last_seen_at")
    return JobResponse(
        id=s.get("id", s.get("_id", "")),
        user_id=s.get("user_id", ""),
        title=s.get("title", ""),
        company=s.get("company", ""),
        platform=s.get("platform", ""),
        location=s.get("location", ""),
        url=s.get("url", ""),
        description=s.get("description", ""),
        fit_score=int(s.get("fit_score", 0)),
        fit_reason=s.get("fit_reason", ""),
        status=s.get("status", "new"),
        scraped_at=scraped_at.isoformat() if isinstance(scraped_at, datetime) else scraped_at,
        posted_at=s.get("posted_at"),
        last_seen_at=last_seen_at.isoformat() if isinstance(last_seen_at, datetime) else last_seen_at,
    )


# ── Dev entry ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=True,
    )
