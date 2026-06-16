import asyncio
import json
import re
import sys
import traceback
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv
from mcp.server import Server
from mcp.server.stdio import stdio_server
import mcp.types as types
from playwright.async_api import async_playwright
from utils.time_parser import parse_relative_time

load_dotenv()
print(f"[scraper] server starting: {__file__}", flush=True, file=sys.stderr)

server = Server("linkedin-server")

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

_EXP_MAP = {
    0: "1",   # internship / entry
    1: "2",   # entry level
    2: "3",   # associate
    3: "4",   # mid-senior
    5: "5",   # director
}


def _experience_filter(years: int) -> str:
    for threshold in sorted(_EXP_MAP.keys(), reverse=True):
        if years >= threshold:
            return _EXP_MAP[threshold]
    return "1"


async def _scrape_linkedin(query: str, location: str, experience: int, limit: int) -> list[dict]:
    jobs = []
    try:
        async with async_playwright() as p:
            try:
                browser = await p.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-gpu",
                        "--single-process",
                        "--no-zygote",
                        "--disable-setuid-sandbox",
                        "--memory-pressure-off",
                        "--max_old_space_size=256",
                    ],
                )
                print("[scraper] browser launched OK", flush=True, file=sys.stderr)
            except Exception as e:
                print(f"[scraper] browser launch FAILED: {e}", flush=True, file=sys.stderr)
                print(traceback.format_exc(), file=sys.stderr, flush=True)
                return []
            context = await browser.new_context(
                user_agent=_USER_AGENT,
                viewport={"width": 1366, "height": 768},
            )
            page = await context.new_page()
            await page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )

            params = {
                "keywords": query,
                "location": location,
                "f_TPR": "r604800",  # last 7 days
            }
            url = "https://www.linkedin.com/jobs/search/?" + urllib.parse.urlencode(params)
            print(f"[linkedin] url: {url}", flush=True, file=sys.stderr)

            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=15_000)
                await page.wait_for_timeout(3000)

                cards = await page.query_selector_all(
                    "ul.jobs-search__results-list li"
                )

                for card in cards[:limit]:
                    try:
                        title_el = await card.query_selector("h3")
                        company_el = await card.query_selector("h4")
                        loc_el = await card.query_selector(
                            "span.job-search-card__location, [class*='location']"
                        )
                        link_el = await card.query_selector("a.base-card__full-link")
                        time_el = await card.query_selector("time.job-search-card__listdate")
                        href = await link_el.get_attribute("href") if link_el else None

                        posted_at = None
                        if time_el:
                            dt_attr = await time_el.get_attribute("datetime")
                            if dt_attr:
                                try:
                                    if "T" in dt_attr:
                                        posted_at = datetime.fromisoformat(
                                            dt_attr.replace("Z", "+00:00")
                                        )
                                    else:
                                        from datetime import date
                                        d = date.fromisoformat(dt_attr)
                                        posted_at = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
                                except ValueError:
                                    pass
                            if posted_at is None:
                                posted_at = parse_relative_time(
                                    (await time_el.inner_text()).strip()
                                )

                        jobs.append({
                            "title": (await title_el.inner_text()).strip() if title_el else "N/A",
                            "company": (await company_el.inner_text()).strip() if company_el else "N/A",
                            "location": (await loc_el.inner_text()).strip() if loc_el else location,
                            "description": "",
                            "url": (href or "").split("?")[0],
                            "platform": "linkedin",
                            "scraped_at": datetime.utcnow().isoformat(),
                            "posted_at": posted_at.isoformat() if posted_at else None,
                        })
                    except Exception:
                        continue
            except Exception as exc:
                sys.stderr.write(f"[linkedin-server] scrape error: {exc}\n")
            finally:
                await browser.close()
    except Exception as e:
        print(f"[scraper] playwright error: {e}", flush=True, file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr, flush=True)
    return jobs


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="search_jobs",
            description="Search for jobs on LinkedIn by query, location, and experience level.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Job title or skills, e.g. 'Software Engineer React'",
                    },
                    "location": {
                        "type": "string",
                        "description": "City or country, e.g. 'Mumbai, India'",
                        "default": "India",
                    },
                    "experience": {
                        "type": "integer",
                        "description": "Years of experience (0=entry, 3=mid, 5=senior)",
                        "default": 0,
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum jobs to return (1–50)",
                        "default": 20,
                    },
                },
                "required": ["query"],
            },
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    if name != "search_jobs":
        raise ValueError(f"Unknown tool: {name}")

    query = arguments.get("query", "")
    location = arguments.get("location", "India")
    experience = int(arguments.get("experience", 0))
    limit = min(int(arguments.get("limit", 20)), 50)

    jobs = await _scrape_linkedin(query, location, experience, limit)
    return [types.TextContent(type="text", text=json.dumps(jobs, ensure_ascii=False))]


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


if __name__ == "__main__":
    asyncio.run(main())
