
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
