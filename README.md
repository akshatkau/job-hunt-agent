# Job Hunt Agent 🤖

An AI-powered job aggregator that discovers, scores, and tracks job 
listings across LinkedIn, Naukri, Internshala, and Indeed — 
personalized to your resume using GPT-4o-mini.

## Live Demo
- Frontend: https://job-hunt-agent-topaz.vercel.app
- Backend API: https://job-hunt-agent-production-5d64.up.railway.app/docs

## Features
- 🔍 Scrapes jobs from LinkedIn, Naukri, Internshala, and Indeed
- 🤖 AI scores each job against your resume (fit score 0-100)
- 📄 PDF resume upload with AI-powered preference extraction
- 🔐 Google OAuth authentication
- 📊 Dashboard with filters (platform, score, date, status)
- 📱 Fully responsive (mobile + desktop)
- 🏷️ Track application status (saved/applied/rejected/interview)

## Architecture

This project uses MCP (Model Context Protocol) — each job platform 
is a standalone MCP server exposing a search_jobs tool. A Claude/GPT 
agent orchestrates these servers to collect, score, and store jobs.

```
User → Google OAuth → JWT
     → Onboarding → PDF Resume → GPT-4o-mini → Preferences
     → Dashboard → Run Scrape
                        ↓
              AI Agent (Orchestrator)
                        ↓
            MCP Tool Calls (parallel)
           ↙    ↙    ↙    ↙
      Naukri LinkedIn Internshala Indeed
           ↘    ↘    ↘    ↘
              Playwright Scrapers
                        ↓
              GPT-4o-mini Scoring
                        ↓
              MongoDB Atlas Storage
                        ↓
              React Dashboard
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Backend | FastAPI (Python) |
| Database | MongoDB Atlas |
| AI Scoring | OpenAI GPT-4o-mini |
| Scraping | Playwright + BeautifulSoup |
| Auth | Google OAuth + JWT |
| MCP | Model Context Protocol SDK |
| Deployment | Railway (backend) + Vercel (frontend) |

## Project Structure

```
job-hunt-agent/
├── mcp-servers/
│   ├── naukri-server/       # Naukri MCP server
│   ├── linkedin-server/     # LinkedIn MCP server
│   ├── internshala-server/  # Internshala MCP server
│   ├── indeed-server/       # Indeed MCP server
│   └── database-server/     # MongoDB MCP server
├── agent/
│   └── orchestrator.py      # AI agent that calls MCP servers
├── backend/
│   ├── main.py              # FastAPI routes
│   ├── auth.py              # Google OAuth + JWT
│   ├── database.py          # MongoDB connection
│   ├── models.py            # Pydantic schemas
│   └── routes/auth.py       # Auth routes
├── frontend/
│   └── src/
│       ├── pages/           # Login, Onboarding, Dashboard
│       ├── components/      # JobCard, ProfileModal, TagInput
│       └── lib/             # API client, utilities
├── start.sh                 # Railway startup script
└── requirements.txt
```

## Local Setup

### Prerequisites
- Python 3.12+
- Node.js 18+
- MongoDB Atlas account
- OpenAI API key
- Google OAuth credentials

### Backend
```bash
# Install dependencies
pip install -r requirements.txt
playwright install chromium

# Set environment variables (copy .env.example to .env)
cp .env.example .env
# Fill in your values in .env

# Run backend
python -m uvicorn backend.main:app --port 8000 --reload
```

### Frontend
```bash
cd frontend
npm install

# Set environment variables
cp .env.example .env
# Fill in VITE_API_URL and VITE_GOOGLE_CLIENT_ID

npm run dev
```

## Environment Variables

### Backend (.env)
```
OPENAI_API_KEY=your_openai_key
MONGODB_URI=mongodb+srv://...
GOOGLE_CLIENT_ID=your_google_client_id
JWT_SECRET=your_random_secret
JWT_EXPIRE_HOURS=168
FRONTEND_URL=https://your-frontend.vercel.app
MIN_FIT_SCORE=60
```

### Frontend (frontend/.env)
```
VITE_API_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

## Deployment

- Backend: Railway (auto-deploys from GitHub main branch)
- Frontend: Vercel (auto-deploys from GitHub main branch)
- Database: MongoDB Atlas (free tier)

## Known Limitations

- LinkedIn scraper selectors may break if LinkedIn updates their DOM
- Scraped jobs reflect LinkedIn's public search algorithm — may show 
  older listings
- Playwright runs headless Chromium which may be detected and blocked
  by some job boards over time

## Built With

- [Model Context Protocol](https://modelcontextprotocol.io) — agentic tool framework
- [FastAPI](https://fastapi.tiangolo.com) — Python web framework  
- [Playwright](https://playwright.dev) — browser automation
- [MongoDB Atlas](https://mongodb.com/atlas) — cloud database
- [Railway](https://railway.app) — backend deployment
- [Vercel](https://vercel.com) — frontend deployment
