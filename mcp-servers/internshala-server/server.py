"""
MCP Server: Internshala job scraper
Transport: stdio
"""
import asyncio
import json
import re
import sys
import traceback
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

server = Server("internshala-server")

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def _slugify(text: str) -> str:
    return re.sub(r"\s+", "-", text.strip().lower())


async def _scrape_internshala(query: str, location: str, experience: int, limit: int) -> list[dict]:
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
            )
            page = await context.new_page()
            await page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )

            q_slug = _slugify(query)
            l_slug = _slugify(location)

            if experience == 0:
                url = f"https://internshala.com/internships/{q_slug}-internship-in-{l_slug}/"
            else:
                url = f"https://internshala.com/jobs/{q_slug}-jobs-in-{l_slug}/"

            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=15_000)
                await page.wait_for_timeout(2000)

                cards = await page.query_selector_all(
                    ".individual_internship, .internship-container, [id^='internship_']"
                )

                for card in cards[:limit]:
                    try:
                        title_el = await card.query_selector(
                            "h3.job-internship-name a, .profile a, h3 a"
                        )
                        company_el = await card.query_selector(
                            "p.company-name a, .company_name, [class*='company']"
                        )
                        loc_el = await card.query_selector(
                            "div.location_link a, span[class*='location'], .location_names"
                        )
                        stipend_el = await card.query_selector(
                            "span.stipend, [class*='stipend']"
                        )
                        link_el = await card.query_selector(
                            "a[href*='/internship/'], a[href*='/jobs/']"
                        )

                        time_el = await card.query_selector(
                            "[class*='status-info'], [class*='posted'], "
                            "div.status-info, span[class*='post-date']"
                        )
                        href = await link_el.get_attribute("href") if link_el else ""
                        if href and not href.startswith("http"):
                            href = "https://internshala.com" + href

                        time_text = (await time_el.inner_text()).strip() if time_el else ""
                        posted_at = parse_relative_time(time_text)

                        jobs.append({
                            "title": (await title_el.inner_text()).strip() if title_el else "N/A",
                            "company": (await company_el.inner_text()).strip() if company_el else "N/A",
                            "location": (await loc_el.inner_text()).strip() if loc_el else location,
                            "stipend": (await stipend_el.inner_text()).strip() if stipend_el else "",
                            "description": "",
                            "url": href or url,
                            "platform": "internshala",
                            "scraped_at": datetime.utcnow().isoformat(),
                            "posted_at": posted_at.isoformat() if posted_at else None,
                        })
                    except Exception:
                        continue
            except Exception as exc:
                sys.stderr.write(f"[internshala-server] scrape error: {exc}\n")
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
            description=(
                "Search for internships and entry-level jobs on Internshala. "
                "When experience=0 it searches internships; otherwise jobs."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Role or skill, e.g. 'Web Development'",
                    },
                    "location": {
                        "type": "string",
                        "description": "City, e.g. 'Delhi'",
                        "default": "India",
                    },
                    "experience": {
                        "type": "integer",
                        "description": "0 = internships, 1+ = fresher jobs",
                        "default": 0,
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum listings to return (1–50)",
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

    jobs = await _scrape_internshala(query, location, experience, limit)
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
