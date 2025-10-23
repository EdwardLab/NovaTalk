"""Datetime mod for NovaTalk."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional


def to_utc_iso(value: Optional[datetime]) -> Optional[str]:
    """Return an ISO 8601 string in UTC with trailing ``Z``.

    ``None`` values are passed through unchanged. Naive datetimes are assumed to
    be in UTC already so they are annotated with :class:`datetime.timezone.utc`.
    Aware datetimes are converted to UTC before serialization.
    """

    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace("+00:00", "Z")
