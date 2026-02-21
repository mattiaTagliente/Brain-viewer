"""Structural hash computation for layout cache invalidation."""

from __future__ import annotations

import hashlib
from typing import Any

# Bump this when layout algorithm parameters change to invalidate cached positions.
LAYOUT_VERSION = "v2"


def compute_structural_hash(
    entities: list[dict[str, Any]],
    relations: list[dict[str, Any]],
    communities: list[dict[str, Any]],
    observation_counts: dict[str, int],
) -> str:
    """Compute a deterministic SHA-256 hash of the graph structure.

    Inputs are sorted to ensure identical output for identical data regardless
    of query order. Includes observation counts so node size changes trigger
    relayout.
    """
    # Build community membership map
    entity_community: dict[str, str] = {}
    for comm in communities:
        for eid in comm.get("member_entity_ids", []):
            entity_community[eid] = comm["id"]

    # Entity tuples: (id, scope, community_id)
    entity_tuples = sorted(
        (e["id"], e.get("scope", "global"), entity_community.get(e["id"], ""))
        for e in entities
    )

    # Relation triples: (subject_id, predicate, object_id)
    relation_triples = sorted(
        (r["subject_id"], r["predicate"], r["object_id"])
        for r in relations
    )

    # Observation counts: (entity_id, count)
    obs_tuples = sorted(observation_counts.items())

    # Combine all into a single hashable string
    parts = []
    parts.append(f"layout_version:{LAYOUT_VERSION}")
    parts.append("entities:" + "|".join(f"{a},{b},{c}" for a, b, c in entity_tuples))
    parts.append("relations:" + "|".join(f"{a},{b},{c}" for a, b, c in relation_triples))
    parts.append("obs_counts:" + "|".join(f"{a},{b}" for a, b in obs_tuples))

    content = "\n".join(parts)
    return hashlib.sha256(content.encode()).hexdigest()
