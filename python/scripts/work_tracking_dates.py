"""
Utilitaires dates / jours de sortie pour le suivi d'œuvres.
Logger : [work_tracking]
"""

from __future__ import annotations

import datetime
import re
from typing import List, Optional


def parse_days_offset(raw: str) -> Optional[int]:
    trimmed = (raw or "").strip()
    if not trimmed:
        return None
    m = re.match(r"^\+?(\d+)\s*(?:j|jours?)?$", trimmed, re.I)
    if not m:
        return None
    days = int(m.group(1))
    return days if days >= 0 else None


def resolve_stored_date_value(value: str) -> str:
    trimmed = (value or "").strip()
    if not trimmed:
        return ""
    days = parse_days_offset(trimmed)
    if days is not None:
        d = datetime.date.today() + datetime.timedelta(days=days)
        return d.isoformat()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", trimmed):
        return trimmed
    return trimmed


def parse_release_weekdays(raw) -> List[int]:
    if raw is None:
        return []
    if isinstance(raw, list):
        nums = [int(x) for x in raw if isinstance(x, (int, float))]
    else:
        nums = []
        for part in str(raw).split(","):
            part = part.strip()
            if part.isdigit():
                nums.append(int(part))
    return sorted({n for n in nums if 0 <= n <= 6})


def compute_next_monthly_release_date(from_iso: str, weekdays: List[int]) -> Optional[str]:
    if not from_iso or not weekdays:
        return None
    try:
        start = datetime.date.fromisoformat(from_iso)
    except ValueError:
        return None
    sorted_days = sorted(set(weekdays))
    year = start.year
    month = start.month + 1
    if month > 12:
        month = 1
        year += 1
    for day in range(1, 32):
        try:
            candidate = datetime.date(year, month, day)
        except ValueError:
            break
        if candidate.month != month:
            break
        wd = candidate.weekday()
        if wd in sorted_days:
            return candidate.isoformat()
    return None


def compute_next_release_date_by_mode(
    from_iso: str, weekdays: List[int], monthly: bool = False
) -> Optional[str]:
    if monthly:
        return compute_next_monthly_release_date(from_iso, weekdays)
    return compute_next_release_date(from_iso, weekdays)


def project_release_date_at_chapter(
    anchor_date_iso: str,
    anchor_chapter: int,
    target_chapter: int,
    weekdays: List[int],
    monthly: bool = False,
) -> Optional[str]:
    if not anchor_date_iso or target_chapter <= anchor_chapter:
        return anchor_date_iso or None
    if not weekdays:
        return None
    current = anchor_date_iso
    steps = target_chapter - anchor_chapter
    for _ in range(steps):
        nxt = compute_next_release_date_by_mode(current, weekdays, monthly)
        if not nxt:
            return None
        current = nxt
    return current


def compute_next_release_date(from_iso: str, weekdays: List[int]) -> Optional[str]:
    if not from_iso or not weekdays:
        return None
    try:
        start = datetime.date.fromisoformat(from_iso)
    except ValueError:
        return None
    sorted_days = sorted(set(weekdays))
    candidate = start + datetime.timedelta(days=1)
    for _ in range(14):
        wd = candidate.weekday()  # Lun=0 … Dim=6
        if wd in sorted_days:
            return candidate.isoformat()
        candidate += datetime.timedelta(days=1)
    return None


def is_release_date_passed(date_iso: str) -> bool:
    resolved = resolve_stored_date_value(date_iso)
    try:
        target = datetime.date.fromisoformat(resolved)
    except ValueError:
        return False
    return datetime.date.today() >= target


def iso_to_discord_timestamp(iso_date: str) -> str:
    resolved = resolve_stored_date_value(iso_date)
    try:
        d = datetime.date.fromisoformat(resolved)
    except ValueError:
        return ""
    dt = datetime.datetime(d.year, d.month, d.day, 0, 0, 0)
    unix = int(dt.timestamp())
    return f"<t:{unix}:D> (<t:{unix}:R>)"


def iso_to_discord_date(iso_date: str) -> str:
    """Timestamp Discord date seule (:D), sans relatif."""
    resolved = resolve_stored_date_value(iso_date)
    try:
        d = datetime.date.fromisoformat(resolved)
    except ValueError:
        return ""
    dt = datetime.datetime(d.year, d.month, d.day, 0, 0, 0)
    unix = int(dt.timestamp())
    return f"<t:{unix}:D>"


def increment_chapter(value: str) -> str:
    trimmed = (value or "").strip()
    if not trimmed:
        return ""
    if re.match(r"^\d+$", trimmed):
        return str(int(trimmed) + 1)
    return trimmed
