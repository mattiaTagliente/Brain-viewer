"""WebSocket realtime handler with SQLite polling."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .db import KGReader

router = APIRouter()
logger = logging.getLogger(__name__)

# Set during app startup
kg: KGReader | None = None

# Polling interval in seconds
POLL_INTERVAL = 2.0


@router.websocket("/ws/realtime")
async def realtime_ws(websocket: WebSocket):
    """WebSocket endpoint for realtime KG change events.

    Uses data_version + rowid watermarks for efficient change detection.
    Client can send {"last_seen_rowids": {...}} on reconnect to resume.
    """
    await websocket.accept()

    if kg is None:
        await websocket.send_json({"error": "KG reader not initialized"})
        await websocket.close()
        return

    # Initialize watermarks
    watermarks = kg.get_max_rowids()
    last_data_version = kg.get_data_version()
    seq = 0

    # Check if client sent resume data
    try:
        initial = await asyncio.wait_for(websocket.receive_json(), timeout=0.5)
        if isinstance(initial, dict) and "last_seen_rowids" in initial:
            client_wm = initial["last_seen_rowids"]
            if isinstance(client_wm, dict):
                # Merge onto defaults — only accept known keys with numeric values
                for key in ("entities", "observations", "relations"):
                    val = client_wm.get(key)
                    if isinstance(val, (int, float)) and val >= 0:
                        watermarks[key] = int(val)
    except WebSocketDisconnect:
        return
    except (asyncio.TimeoutError, json.JSONDecodeError, Exception):
        pass

    try:
        while True:
            await asyncio.sleep(POLL_INTERVAL)

            try:
                # Quick check: did anything change?
                current_version = kg.get_data_version()
                if current_version == last_data_version:
                    # Send heartbeat
                    seq += 1
                    await websocket.send_json({"type": "heartbeat", "seq": seq})
                    continue

                last_data_version = current_version

                # Something changed — fetch new rows
                new_rows = kg.get_new_rows_since(watermarks)

                events: list[dict[str, Any]] = []

                for row in new_rows.get("entities", []):
                    events.append({
                        "event_type": "ENTITY_CREATED",
                        "timestamp": row["date_added"],
                        "entity_id": row["id"],
                        "data": {
                            "name": row["name"],
                            "entity_type": row["entity_type"],
                            "scope": row.get("scope", "global"),
                        },
                    })
                    watermarks["entities"] = max(watermarks["entities"], row["rowid"])

                for row in new_rows.get("relations", []):
                    events.append({
                        "event_type": "RELATION_CREATED",
                        "timestamp": row["date_added"],
                        "entity_id": row["subject_id"],
                        "data": {
                            "relation_id": row["id"],
                            "subject_id": row["subject_id"],
                            "predicate": row["predicate"],
                            "object_id": row["object_id"],
                        },
                    })
                    watermarks["relations"] = max(watermarks["relations"], row["rowid"])

                for row in new_rows.get("observations", []):
                    events.append({
                        "event_type": "OBSERVATION_ADDED",
                        "timestamp": row["date_added"],
                        "entity_id": row["entity_id"],
                        "data": {
                            "observation_id": row["id"],
                            "severity": row["severity"],
                            "text": row.get("text", "")[:200],
                        },
                    })
                    watermarks["observations"] = max(watermarks["observations"], row["rowid"])

                if events:
                    seq += 1
                    await websocket.send_json({
                        "type": "events",
                        "seq": seq,
                        "events": events,
                        "watermarks": watermarks,
                    })

            except Exception as e:
                logger.error("Polling error: %s", e)
                seq += 1
                await websocket.send_json({"type": "error", "seq": seq, "error": str(e)})

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error("WebSocket error: %s", e)
