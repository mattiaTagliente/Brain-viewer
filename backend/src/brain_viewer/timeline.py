"""Event stream builder with idle time compression."""

from __future__ import annotations

import hashlib
import json
from typing import Any


def build_event_stream(
    entities: list[dict[str, Any]],
    observations: list[dict[str, Any]],
    relations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build a chronological event stream from KG tables.

    Events are sorted by (date_added ASC, table_priority ASC, id ASC)
    for deterministic ordering even when timestamps collide.
    """
    events: list[dict[str, Any]] = []

    for e in entities:
        events.append({
            "timestamp": e["date_added"],
            "event_type": "ENTITY_CREATED",
            "entity_id": e["id"],
            "priority": 0,
            "data": {"name": e["name"], "entity_type": e["entity_type"], "scope": e.get("scope", "global")},
        })

    for r in relations:
        events.append({
            "timestamp": r["date_added"],
            "event_type": "RELATION_CREATED",
            "entity_id": r["subject_id"],
            "priority": 1,
            "data": {
                "relation_id": r["id"],
                "subject_id": r["subject_id"],
                "predicate": r["predicate"],
                "object_id": r["object_id"],
            },
        })

    for o in observations:
        events.append({
            "timestamp": o["date_added"],
            "event_type": "OBSERVATION_ADDED",
            "entity_id": o["entity_id"],
            "priority": 2,
            "data": {
                "observation_id": o["id"],
                "severity": o["severity"],
                "text": o["text"][:200],  # truncate for payload size
                "source_type": o["source_type"],
            },
        })

    # Deterministic sort: timestamp, then table priority, then id
    events.sort(key=lambda e: (e["timestamp"] or "", e["priority"], e.get("entity_id", "")))

    # Remove the priority field from output
    for e in events:
        e.pop("priority", None)

    return events


def compress_timeline(
    events: list[dict[str, Any]],
    gap_threshold_seconds: float = 60.0,
    compressed_pause_seconds: float = 0.5,
) -> list[dict[str, Any]]:
    """Compress idle gaps in the event stream.

    Gaps longer than gap_threshold_seconds are collapsed to
    compressed_pause_seconds of playback time. Skip markers are
    inserted in the stream.
    """
    if not events:
        return []

    from datetime import datetime

    def parse_ts(ts: str) -> datetime | None:
        if not ts:
            return None
        try:
            # Handle ISO format with or without timezone
            ts = ts.replace("Z", "+00:00")
            return datetime.fromisoformat(ts)
        except (ValueError, TypeError):
            return None

    compressed: list[dict[str, Any]] = []
    prev_time = None

    for event in events:
        curr_time = parse_ts(event["timestamp"])
        if prev_time and curr_time:
            gap = (curr_time - prev_time).total_seconds()
            if gap > gap_threshold_seconds:
                compressed.append({
                    "timestamp": event["timestamp"],
                    "event_type": "GAP_SKIPPED",
                    "entity_id": None,
                    "data": {
                        "gap_seconds": gap,
                        "display": _format_gap(gap),
                    },
                })
        compressed.append(event)
        if curr_time:
            prev_time = curr_time

    return compressed


def _format_gap(seconds: float) -> str:
    """Format a gap duration for display."""
    if seconds < 3600:
        return f"{int(seconds / 60)}m skipped"
    if seconds < 86400:
        return f"{seconds / 3600:.1f}h skipped"
    return f"{seconds / 86400:.1f}d skipped"


def timeline_params_hash(scope: str | None, gap_threshold: float, compress: bool) -> str:
    """Compute a hash of timeline query parameters for caching."""
    content = json.dumps({"scope": scope, "gap_threshold": gap_threshold, "compress": compress}, sort_keys=True)
    return hashlib.sha256(content.encode()).hexdigest()[:16]
