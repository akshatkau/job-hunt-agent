# Job Hunt Agent

AI-powered job aggregator using the Model Context Protocol (MCP).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  React Frontend  (Phase 2)                                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST
┌──────────────────────────▼──────────────────────────────────────┐
│  FastAPI Backend  (backend/main.py)                              │
│  GET /jobs  POST /jobs/scrape  PUT /jobs/:id/status              │
│  POST /users  GET /users/:id                                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ asyncio.create_task
┌──────────────────────────▼──────────────────────────────────────┐
│  Agent Orchestrator  (agent/orchestrator.py)                     │
│  OpenAI gpt-4o-mini  ←→  MCP tool calling                       │
└──┬───────────┬────────────┬────────────┬─────────────┬──────────┘
   │ stdio     │ stdio      │ stdio      │ stdio       │ stdio
┌──▼──┐  ┌────▼───┐  ┌─────▼────┐  ┌───▼──┐  ┌───────▼──────────┐
│Naukri│  │LinkedIn│  │Internshala│  │Indeed│  │  Database Server  │
│MCP  │  │MCP     │  │MCP        │  │MCP   │  │  (MongoDB/motor)  │
└──────┘  └────────┘  └───────────┘  └──────┘  └──────────────────┘
```

## Quick Start

### 1. Prerequisites

- Python 3.11+
- MongoDB Atlas cluster (or local MongoDB)
- OpenAI API key

### 2. Install dependencies

```bash
pip install -r requirements.txt
playwright install chromium
```

### 3. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
# edit .env with your OPENAI_API_KEY and MONGODB_URI
```

### 4. Run the backend

```bash
uvicorn backend.main:app --reload --port 8000
```

### 5. Trigger a scrape (API)

```bash
# Create a user first
curl -X POST http://localhost:8000/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Aakash",
    "email": "you@example.com",
    "resume_text": "Python developer with 2 years experience...",
    "preferences": {
      "roles": ["Backend Developer", "Python Engineer"],
      "skills": ["Python", "FastAPI", "MongoDB"],
      "location": ["Bangalore", "Remote"],
      "experience": 2
    }
  }'

# Trigger job scraping (returns 202, runs in background)
curl -X POST http://localhost:8000/jobs/scrape \
  -H "Content-Type: application/json" \
  -d '{"user_id": "<user_id_from_above>"}'

# Fetch results
curl "http://localhost:8000/jobs?user_id=<id>&minScore=70"
```

### 6. Run the agent directly (CLI)

```bash
python -m agent.orchestrator \
  --user-id <mongo_id> \
  --roles "Backend Developer" "Python Engineer" \
  --skills "Python" "FastAPI" \
  --location "Bangalore" \
  --experience 2 \
  --resume path/to/resume.txt
```

## MCP Servers

Each server is a standalone Python process communicating over stdio.

| Server | File | Tool |
|--------|------|------|
| Naukri | `mcp-servers/naukri-server/server.py` | `search_jobs` |
| LinkedIn | `mcp-servers/linkedin-server/server.py` | `search_jobs` |
| Internshala | `mcp-servers/internshala-server/server.py` | `search_jobs` |
| Indeed | `mcp-servers/indeed-server/server.py` | `search_jobs` |
| Database | `mcp-servers/database-server/server.py` | `save_job`, `get_jobs`, `update_job_status` |

### Tool: `search_jobs` (all job servers)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Job title / skills |
| `location` | string | `"India"` | City or region |
| `experience` | integer | `0` | Years of experience |
| `limit` | integer | `20` | Max results (≤50) |

### Tools: Database server

**`save_job(job_data)`** — upserts on `(user_id, url)`  
**`get_jobs(filters)`** — filters: `user_id`, `platform`, `status`, `min_score`, `limit`  
**`update_job_status(id, status)`** — statuses: `new | saved | applied | rejected | interview`

## MongoDB Collections

**`users`**
```json
{
  "name": "string",
  "email": "string",
  "resume_text": "string",
  "preferences": {
    "roles": ["string"],
    "skills": ["string"],
    "location": ["string"],
    "salary_min": 0,
    "experience": 0
  }
}
```

**`jobs`**
```json
{
  "user_id": "string",
  "title": "string",
  "company": "string",
  "platform": "naukri|linkedin|internshala|indeed",
  "location": "string",
  "url": "string",
  "description": "string",
  "fit_score": 0,
  "fit_reason": "string",
  "status": "new|saved|applied|rejected|interview",
  "scraped_at": "ISO8601"
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for scoring |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `PORT` | FastAPI port (default `8000`) |
| `SCRAPE_INTERVAL_HOURS` | Auto-scrape interval (default `6`) |
| `MIN_FIT_SCORE` | Minimum score to save a job (default `60`) |
