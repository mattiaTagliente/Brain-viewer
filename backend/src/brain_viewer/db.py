"""Read-only access to the Knowledge Graph SQLite database."""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any


def _default_kg_path() -> Path:
    """Resolve the KG database path from environment or platform default."""
    override = os.environ.get("KNOWLEDGE_GLOBAL_DB")
    if override:
        return Path(override)
    try:
        import platformdirs
        return Path(platformdirs.user_data_dir("llm_harness", appauthor=False)) / "knowledge.db"
    except ImportError:
        return Path.home() / ".llm_harness" / "knowledge.db"


class KGReader:
    """Read-only connection to the KG SQLite database."""

    def __init__(self, db_path: str | Path | None = None):
        self.db_path = Path(db_path) if db_path else _default_kg_path()
        if not self.db_path.exists():
            raise FileNotFoundError(f"KG database not found: {self.db_path}")
        self._conn = sqlite3.connect(
            f"file:{self.db_path}?mode=ro",
            uri=True,
            check_same_thread=False,
            timeout=5.0,
        )
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode")  # just read, don't set

    def close(self):
        self._conn.close()

    def get_data_version(self) -> int:
        """Get SQLite data version for change detection."""
        row = self._conn.execute("PRAGMA data_version").fetchone()
        return row[0] if row else 0

    def get_entities(self, scope: str | None = None) -> list[dict[str, Any]]:
        """Fetch all non-merged entities."""
        sql = """
            SELECT id, name, entity_type, date_added, date_modified, scope,
                   metadata_json
            FROM entities
            WHERE merged_into IS NULL
        """
        params: list[Any] = []
        if scope:
            sql += " AND scope = ?"
            params.append(scope)
        rows = self._conn.execute(sql, params).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["metadata"] = json.loads(d.pop("metadata_json", "{}") or "{}")
            result.append(d)
        return result

    def get_observations(self, scope: str | None = None) -> list[dict[str, Any]]:
        """Fetch all non-deprecated observations."""
        sql = """
            SELECT id, entity_id, text, severity, source_type, source_ref,
                   verification_status, date_added, tags_json, scope
            FROM observations
            WHERE deprecated = 0
        """
        params: list[Any] = []
        if scope:
            sql += " AND scope = ?"
            params.append(scope)
        rows = self._conn.execute(sql, params).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["tags"] = json.loads(d.pop("tags_json", "[]") or "[]")
            result.append(d)
        return result

    def get_relations(self, scope: str | None = None) -> list[dict[str, Any]]:
        """Fetch all relations."""
        sql = """
            SELECT id, subject_id, predicate, object_id,
                   source_type, source_ref, date_added, scope
            FROM relations
        """
        params: list[Any] = []
        if scope:
            sql += " WHERE scope = ?"
            params.append(scope)
        rows = self._conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def get_communities(self, scope: str | None = None) -> list[dict[str, Any]]:
        """Fetch community data."""
        sql = "SELECT id, level, member_entity_ids, summary, date_computed, scope FROM communities"
        params: list[Any] = []
        if scope:
            sql += " WHERE scope = ?"
            params.append(scope)
        rows = self._conn.execute(sql, params).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["member_entity_ids"] = json.loads(d["member_entity_ids"] or "[]")
            result.append(d)
        return result

    def get_aliases(self) -> list[dict[str, Any]]:
        """Fetch all aliases."""
        rows = self._conn.execute("SELECT entity_id, alias, scope FROM aliases").fetchall()
        return [dict(r) for r in rows]

    def get_entity_detail(self, entity_id: str) -> dict[str, Any] | None:
        """Get full entity detail with observations, relations, and aliases."""
        row = self._conn.execute(
            "SELECT id, name, entity_type, date_added, date_modified, scope, metadata_json "
            "FROM entities WHERE id = ?",
            (entity_id,),
        ).fetchone()
        if not row:
            return None
        entity = dict(row)
        entity["metadata"] = json.loads(entity.pop("metadata_json", "{}") or "{}")

        obs_rows = self._conn.execute(
            "SELECT id, text, severity, source_type, source_ref, verification_status, "
            "date_added, tags_json, scope FROM observations "
            "WHERE entity_id = ? AND deprecated = 0 ORDER BY date_added DESC",
            (entity_id,),
        ).fetchall()
        entity["observations"] = []
        for o in obs_rows:
            od = dict(o)
            od["tags"] = json.loads(od.pop("tags_json", "[]") or "[]")
            entity["observations"].append(od)

        rel_rows = self._conn.execute(
            "SELECT id, subject_id, predicate, object_id, source_type, source_ref, date_added, scope "
            "FROM relations WHERE subject_id = ? OR object_id = ?",
            (entity_id, entity_id),
        ).fetchall()
        entity["relations"] = [dict(r) for r in rel_rows]

        alias_rows = self._conn.execute(
            "SELECT alias, scope FROM aliases WHERE entity_id = ?",
            (entity_id,),
        ).fetchall()
        entity["aliases"] = [dict(a) for a in alias_rows]

        return entity

    def get_observation_counts(self, scope: str | None = None) -> dict[str, int]:
        """Get observation count per entity (for node sizing)."""
        sql = "SELECT entity_id, COUNT(*) as cnt FROM observations WHERE deprecated = 0"
        params: list[Any] = []
        if scope:
            sql += " AND scope = ?"
            params.append(scope)
        sql += " GROUP BY entity_id"
        rows = self._conn.execute(sql, params).fetchall()
        return {r["entity_id"]: r["cnt"] for r in rows}

    def get_embeddings(self, entity_ids: list[str]) -> dict[str, bytes]:
        """Get raw embedding blobs for given entity IDs."""
        if not entity_ids:
            return {}
        placeholders = ",".join("?" * len(entity_ids))
        rows = self._conn.execute(
            f"SELECT id, embedding FROM entities WHERE id IN ({placeholders}) AND embedding IS NOT NULL",
            entity_ids,
        ).fetchall()
        return {r["id"]: r["embedding"] for r in rows}

    def get_max_rowids(self) -> dict[str, int]:
        """Get current max rowid for each table (for polling watermark)."""
        result = {}
        for table in ("entities", "observations", "relations"):
            row = self._conn.execute(f"SELECT MAX(rowid) as m FROM {table}").fetchone()
            result[table] = row["m"] or 0 if row else 0
        return result

    def get_new_rows_since(self, watermarks: dict[str, int]) -> dict[str, list[dict[str, Any]]]:
        """Fetch rows added since the given rowid watermarks."""
        result: dict[str, list[dict[str, Any]]] = {}

        for table, cols in [
            ("entities", "id, name, entity_type, date_added, scope"),
            ("observations", "id, entity_id, text, severity, date_added, scope"),
            ("relations", "id, subject_id, predicate, object_id, date_added, scope"),
        ]:
            wm = watermarks.get(table, 0)
            rows = self._conn.execute(
                f"SELECT rowid, {cols} FROM {table} WHERE rowid > ? ORDER BY rowid",
                (wm,),
            ).fetchall()
            result[table] = [dict(r) for r in rows]

        return result

    def get_stats(self) -> dict[str, Any]:
        """Get KG statistics."""
        stats: dict[str, Any] = {}
        for table in ("entities", "observations", "relations", "communities"):
            row = self._conn.execute(f"SELECT COUNT(*) as cnt FROM {table}").fetchone()
            stats[f"{table}_count"] = row["cnt"] if row else 0
        stats["db_size_bytes"] = self.db_path.stat().st_size
        row = self._conn.execute(
            "SELECT MAX(date_modified) as last FROM entities"
        ).fetchone()
        stats["last_modified"] = row["last"] if row else None
        return stats
