"""REST API endpoints."""

from __future__ import annotations

import json
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from .db import KGReader
from .hashing import compute_structural_hash
from .sidecar import SidecarDB
from .timeline import build_event_stream, compress_timeline, timeline_params_hash

router = APIRouter(prefix="/api")

# These are set during app startup (see main.py)
kg: KGReader | None = None
sidecar: SidecarDB | None = None


def _kg() -> KGReader:
    if kg is None:
        raise HTTPException(500, "KG reader not initialized")
    return kg


def _sidecar() -> SidecarDB:
    if sidecar is None:
        raise HTTPException(500, "Sidecar DB not initialized")
    return sidecar


@router.get("/status")
async def status():
    stats = _kg().get_stats()
    return {"data": stats, "error": None}


@router.get("/graph")
async def get_graph(scope: str | None = None):
    """Full graph data: entities, observations, relations, communities, positions."""
    reader = _kg()
    entities = reader.get_entities(scope)
    observations = reader.get_observations(scope)
    relations = reader.get_relations(scope)
    communities = reader.get_communities(scope)
    obs_counts = reader.get_observation_counts(scope)

    # Compute structural hash
    current_hash = compute_structural_hash(entities, relations, communities, obs_counts)

    # Get persisted positions (scoped)
    effective_scope = scope or "global"
    db = _sidecar()
    stored_hash = db.get_layout_hash(effective_scope)
    positions = db.get_positions(effective_scope) if stored_hash == current_hash else {}

    # Build community membership map for frontend
    entity_community: dict[str, str] = {}
    for comm in communities:
        for eid in comm.get("member_entity_ids", []):
            entity_community[eid] = comm["id"]

    # Enrich entities with observation count and community
    for e in entities:
        e["observation_count"] = obs_counts.get(e["id"], 0)
        e["community_id"] = entity_community.get(e["id"])
        pos = positions.get(e["id"])
        if pos:
            e["position"] = pos

    return {
        "data": {
            "entities": entities,
            "observations": observations,
            "relations": relations,
            "communities": communities,
            "layout_hash": current_hash,
            "positions_valid": stored_hash == current_hash,
        },
        "error": None,
    }


@router.get("/entity/{entity_id}")
async def get_entity(entity_id: str):
    reader = _kg()
    detail = reader.get_entity_detail(entity_id)
    if not detail:
        raise HTTPException(404, f"Entity not found: {entity_id}")
    # Add observation_count and community_id for EntityDetail compatibility
    detail["observation_count"] = len(detail.get("observations", []))
    communities = reader.get_communities()
    detail["community_id"] = None
    for comm in communities:
        if entity_id in comm.get("member_entity_ids", []):
            detail["community_id"] = comm["id"]
            break
    return {"data": detail, "error": None}


@router.get("/timeline")
async def get_timeline(
    scope: str | None = None,
    compress: bool = True,
    gap_threshold: float = 60.0,
    since: str | None = None,
    limit: int = Query(default=5000, le=50000),
    offset: int = 0,
):
    """Chronological event stream with optional idle time compression."""
    reader = _kg()
    db = _sidecar()

    # Check cache
    params_hash = timeline_params_hash(scope, gap_threshold, compress)
    cached = db.get_timeline_cache(scope or "all", params_hash)
    if cached:
        events = json.loads(cached)
    else:
        entities = reader.get_entities(scope)
        observations = reader.get_observations(scope)
        relations = reader.get_relations(scope)
        events = build_event_stream(entities, observations, relations)
        if compress:
            events = compress_timeline(events, gap_threshold)
        # Cache the result
        db.set_timeline_cache(scope or "all", params_hash, json.dumps(events))

    # Apply since filter
    if since:
        events = [e for e in events if (e.get("timestamp") or "") >= since]

    # Paginate
    total = len(events)
    events = events[offset : offset + limit]

    return {
        "data": events,
        "meta": {"total": total, "offset": offset, "limit": limit},
        "error": None,
    }


@router.get("/layout/positions")
async def get_positions(scope: str = "global"):
    """Get current persisted positions and layout hash."""
    db = _sidecar()
    return {
        "data": {
            "positions": db.get_positions(scope),
            "layout_hash": db.get_layout_hash(scope),
        },
        "error": None,
    }


class PositionData(BaseModel):
    positions: dict[str, dict[str, float]]
    layout_hash: str
    scope: str = "global"


@router.post("/layout/positions")
async def save_positions(data: PositionData):
    """Save positions from the frontend Web Worker."""
    db = _sidecar()
    db.save_positions(data.positions, data.layout_hash, data.scope)
    # Invalidate timeline cache since positions changed
    return {"data": {"saved": len(data.positions)}, "error": None}


@router.post("/layout/recompute")
async def recompute_layout():
    """Invalidate cached positions, forcing relayout on next load."""
    db = _sidecar()
    db.clear_positions()
    db.clear_timeline_cache()
    return {"data": {"status": "cleared"}, "error": None}


class SimilarityRequest(BaseModel):
    entity_ids: list[str]


@router.post("/embeddings/similarity")
async def compute_similarity(req: SimilarityRequest):
    """Compute pairwise cosine similarity matrix for entities."""
    reader = _kg()
    embeddings = reader.get_embeddings(req.entity_ids)

    if len(embeddings) < 2:
        return {"data": {"matrix": {}, "ids": list(embeddings.keys())}, "error": None}

    # Parse embedding blobs to numpy arrays
    ids = list(embeddings.keys())
    vectors = []
    for eid in ids:
        blob = embeddings[eid]
        if len(blob) % 4 != 0:
            continue  # skip malformed blobs
        try:
            vec = np.frombuffer(blob, dtype=np.float32)
            vectors.append(vec)
        except ValueError:
            continue

    mat = np.array(vectors)
    # Normalize
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    mat_norm = mat / norms
    # Cosine similarity matrix
    sim = (mat_norm @ mat_norm.T).tolist()

    # Return as dict of dicts
    matrix = {}
    for i, id_a in enumerate(ids):
        matrix[id_a] = {}
        for j, id_b in enumerate(ids):
            matrix[id_a][id_b] = round(sim[i][j], 4)

    return {"data": {"matrix": matrix, "ids": ids}, "error": None}
