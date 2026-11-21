"""In-memory chat session store with sliding idle timeout (default 10 minutes).

Uses last_active timestamps for forget-behavior so Gradio history is still
trusted on the first message of a session (TTLCache key absence alone must
NOT wipe UI history). TTLCache max age is a longer GC safety net.
"""
from __future__ import annotations

import time

from cachetools import TTLCache

import config

_TIMEOUT = max(60, int(config.SESSION_TIMEOUT_SECONDS))
# Keep entries around longer than the idle timeout so we can detect expiry
# via last_active (instead of treating "missing key" as brand-new).
_sessions: TTLCache = TTLCache(
    maxsize=1000,
    ttl=max(3600, _TIMEOUT * 12),
)


def is_alive(session_id: str) -> bool:
    return bool(session_id) and session_id in _sessions


def get(session_id: str) -> dict:
    if not session_id:
        return {}
    data = _sessions.get(session_id)
    return dict(data) if data else {}


def idle_expired(session_id: str) -> bool:
    """True only when we had a session and it sat idle past the timeout."""
    data = get(session_id)
    if not data:
        return False
    last = data.get("last_active")
    if last is None:
        return False
    return (time.time() - float(last)) > _TIMEOUT


def touch(
    session_id: str,
    *,
    product_focus: dict | None = None,
    customer_profile: dict | None = None,
    history: list | None = None,
) -> dict:
    """Save session data and reset the idle timer."""
    if not session_id:
        return {}
    data = get(session_id)
    if product_focus is not None:
        # Store a JSON-friendly copy (category terms as list)
        focus = dict(product_focus)
        cat = focus.get("category")
        if isinstance(cat, tuple):
            focus["category"] = [cat[0], cat[1], list(cat[2])]
        data["product_focus"] = focus
    if customer_profile is not None:
        profile = dict(customer_profile)
        cat = profile.get("category")
        if isinstance(cat, tuple):
            profile["category"] = [cat[0], cat[1], list(cat[2])]
        data["customer_profile"] = profile
    if history is not None:
        trimmed = history[-config.MAX_HISTORY_TURNS :] if history else []
        data["history"] = trimmed
    data["last_active"] = time.time()
    _sessions[session_id] = data
    return data


def clear(session_id: str) -> None:
    if session_id and session_id in _sessions:
        del _sessions[session_id]
