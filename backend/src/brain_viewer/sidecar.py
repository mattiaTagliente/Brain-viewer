"""Sidecar SQLite database for Brain Viewer state persistence."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS node_positions (
    entity_id TEXT PRIMARY KEY,
    x REAL NOT NULL,
    y REAL NOT NULL,
    z REAL NOT NULL,
    scope TEXT NOT NULL DEFAULT 'global',
    layout_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timeline_cache (
    scope TEXT NOT NULL,
    params_hash TEXT NOT NULL,
    compressed_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (scope, params_hash)
);

CREATE TABLE IF NOT EXISTS schema_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SidecarDB:
    """Manages the brain_viewer.db sidecar database."""

    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA_SQL)
        # Ensure schema version
        existing = self._conn.execute(
            "SELECT value FROM schema_metadata WHERE key = 'version'"
        ).fetchone()
        if not existing:
            self._conn.execute(
                "INSERT INTO schema_metadata VALUES ('version', '1')"
            )
            self._conn.commit()

    def close(self):
        self._conn.close()

    # ── Positions ──

    def get_positions(self, scope: str = "global") -> dict[str, dict[str, float]]:
        """Get all persisted node positions for a given scope."""
        rows = self._conn.execute(
            "SELECT entity_id, x, y, z FROM node_positions WHERE scope = ?",
            (scope,),
        ).fetchall()
        return {r["entity_id"]: {"x": r["x"], "y": r["y"], "z": r["z"]} for r in rows}

    def get_layout_hash(self, scope: str = "global") -> str | None:
        """Get the layout hash for a given scope."""
        row = self._conn.execute(
            "SELECT layout_hash FROM node_positions WHERE scope = ? LIMIT 1",
            (scope,),
        ).fetchone()
        return row["layout_hash"] if row else None

    def save_positions(
        self, positions: dict[str, dict[str, float]], layout_hash: str, scope: str = "global"
    ):
        """Save node positions (replace all for given scope)."""
        now = _now_iso()
        self._conn.execute("DELETE FROM node_positions WHERE scope = ?", (scope,))
        for entity_id, pos in positions.items():
            self._conn.execute(
                "INSERT INTO node_positions (entity_id, x, y, z, scope, layout_hash, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (entity_id, pos["x"], pos["y"], pos["z"], scope, layout_hash, now, now),
            )
        self._conn.commit()

    def clear_positions(self):
        """Clear all positions (forces relayout)."""
        self._conn.execute("DELETE FROM node_positions")
        self._conn.commit()

    # ── Preferences ──

    def get_preference(self, key: str, default: str = "") -> str:
        """Get a user preference value."""
        row = self._conn.execute(
            "SELECT value FROM user_preferences WHERE key = ?", (key,)
        ).fetchone()
        return row["value"] if row else default

    def set_preference(self, key: str, value: str):
        """Set a user preference value."""
        now = _now_iso()
        self._conn.execute(
            "INSERT OR REPLACE INTO user_preferences (key, value, updated_at) VALUES (?, ?, ?)",
            (key, value, now),
        )
        self._conn.commit()

    # ── Timeline Cache ──

    def get_timeline_cache(self, scope: str, params_hash: str) -> str | None:
        """Get cached compressed timeline JSON."""
        row = self._conn.execute(
            "SELECT compressed_json FROM timeline_cache WHERE scope = ? AND params_hash = ?",
            (scope, params_hash),
        ).fetchone()
        return row["compressed_json"] if row else None

    def set_timeline_cache(self, scope: str, params_hash: str, data: str):
        """Cache compressed timeline JSON."""
        now = _now_iso()
        self._conn.execute(
            "INSERT OR REPLACE INTO timeline_cache (scope, params_hash, compressed_json, created_at, schema_version) "
            "VALUES (?, ?, ?, ?, 1)",
            (scope, params_hash, data, now),
        )
        self._conn.commit()

    def clear_timeline_cache(self):
        """Clear all timeline caches."""
        self._conn.execute("DELETE FROM timeline_cache")
        self._conn.commit()
