"""
Shared utility: parse relative time strings scraped from job boards into UTC datetimes.

Handles:
  "Just now", "Just posted", "Active today", "Today"
  "30 seconds ago", "5 minutes ago"
  "1 hour ago",  "3 hours ago",  "an hour ago"
  "1 day ago",   "2 days ago",   "a day ago"
  "1 week ago",  "2 weeks ago",  "a week ago"
  "1 month ago", "2 months ago", "a month ago"
  "1 year ago",  "2 years ago"
  "30+ days ago"
  Naukri-style capitalised:  "3 Days Ago", "2 Hours Ago"
  Indeed-style prefix:       "Posted 2 days ago", "PostedJust posted"
"""
import re
from datetime import datetime, timedelta, timezone


def parse_relative_time(text: str) -> datetime | None:
    if not text:
        return None

    now = datetime.now(timezone.utc)
    t = text.strip().lower()

    # Strip common prefixes
    t = re.sub(r"^posted\s*", "", t)

    # Instant / today aliases
    if t in {"just now", "just posted", "active today", "today", "moments ago", "new"}:
        return now

    # "N+ days ago"  e.g. "30+ days ago"
    m = re.match(r"(\d+)\+\s+days?\s+ago", t)
    if m:
        return now - timedelta(days=int(m.group(1)))

    # General pattern: "N unit ago" or "a/an unit ago"
    m = re.match(
        r"(a|an|\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago",
        t,
    )
    if m:
        raw, unit = m.group(1), m.group(2)
        n = 1 if raw in ("a", "an") else int(raw)
        delta = {
            "second": timedelta(seconds=n),
            "minute": timedelta(minutes=n),
            "hour":   timedelta(hours=n),
            "day":    timedelta(days=n),
            "week":   timedelta(weeks=n),
            "month":  timedelta(days=n * 30),
            "year":   timedelta(days=n * 365),
        }[unit]
        return now - delta

    return None
