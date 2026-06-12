"""
MCP Server: Indeed job scraper
Transport: stdio
"""
import asyncio
import json
import re
import sys
import traceback
import urllib.parse
from datetime import datetime
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

server = Server("indeed-server")

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

_EXP_LEVEL_MAP = {
    0: "entry_level",
    2: "mid_level",
    5: "senior_level",
}


def _exp_level(years: int) -> str:
    for threshold in sorted(_EXP_LEVEL_MAP.keys(), reverse=True):
        if years >= threshold:
            return _EXP_LEVEL_MAP[threshold]
    return "entry_level"


async def _scrape_indeed(query: str, location: str, experience: int, limit: int) -> list[dict]:
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
                viewport={"width": 1280, "height": 800},
                locale="en-IN",
            )
            page = await context.new_page()
            await page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )

            params = {
                "q": query,
                "l": location,
                "explvl": _exp_level(experience),
            }
            url = "https://in.indeed.com/jobs?" + urllib.parse.urlencode(params)

            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
                await page.wait_for_timeout(2500)

                cards = await page.query_selector_all(
                    "div.job_seen_beacon, li[class*='css-5lfssm'], [data-jk]"
                )

                for card in cards[:limit]:
                    try:
                        title_el = await card.query_selector(
                            "h2.jobTitle span[title], h2.jobTitle a span, [class*='jobTitle'] span"
                        )
                        company_el = await card.query_selector(
                            "[data-testid='company-name'], span[class*='companyName']"
                        )
                        loc_el = await card.query_selector(
                            "[data-testid='text-location'], div[class*='companyLocation']"
                        )
                        desc_el = await card.query_selector(
                            "div[class*='job-snippet'], ul[class*='jobSnippet']"
                        )
                        link_el = await card.query_selector("h2.jobTitle a, a[id^='job_']")

                        date_el = await card.query_selector(
                            "span.date, [class*='date'], "
                            "[data-testid='myJobsStateDate'], span[class*='posting-date']"
                        )
                        href = await link_el.get_attribute("href") if link_el else ""
                        if href and not href.startswith("http"):
                            href = "https://in.indeed.com" + href

                        time_text = (await date_el.inner_text()).strip() if date_el else ""
                        posted_at = parse_relative_time(time_text)

                        jobs.append({
                            "title": (await title_el.inner_text()).strip() if title_el else "N/A",
                            "company": (await company_el.inner_text()).strip() if company_el else "N/A",
                            "location": (await loc_el.inner_text()).strip() if loc_el else location,
                            "description": (await desc_el.inner_text()).strip() if desc_el else "",
                            "url": href or url,
                            "platform": "indeed",
                            "scraped_at": datetime.utcnow().isoformat(),
                            "posted_at": posted_at.isoformat() if posted_at else None,
                        })
                    except Exception:
                        continue
            except Exception as exc:
                sys.stderr.write(f"[indeed-server] scrape error: {exc}\n")
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
            description="Search for jobs on Indeed India by query, location, and experience level.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Job title or keywords, e.g. 'Data Analyst'",
                    },
                    "location": {
                        "type": "string",
                        "description": "City or region, e.g. 'Hyderabad'",
                        "default": "India",
                    },
                    "experience": {
                        "type": "integer",
                        "description": "Years of experience: 0=entry, 2=mid, 5=senior",
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

    jobs = await _scrape_indeed(query, location, experience, limit)
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
