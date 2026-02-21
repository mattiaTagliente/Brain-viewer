/**
 * Layout Web Worker — runs d3-force-3d simulation off the main thread.
 *
 * Receives graph data via postMessage, runs force simulation to convergence,
 * posts back intermediate and final positions.
 */

import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
} from "d3-force-3d";
import seedrandom from "seedrandom";

import type { LayoutWorkerInput, LayoutWorkerOutput, NodePosition } from "../lib/types";
import { GEOM_RADIUS, getNodeSize } from "../lib/nodeSize";

interface SimNode {
  id: string;
  x: number;
  y: number;
  z: number;
  fx?: number | null;
  fy?: number | null;
  fz?: number | null;
  communityId: string | null;
  observationCount: number;
  index?: number;
}

interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
}

/** Fibonacci sphere: deterministic, evenly-spaced points on a sphere. */
function fibonacciSphere(n: number, radius: number): { x: number; y: number; z: number }[] {
  const points: { x: number; y: number; z: number }[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1 || 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;
    points.push({
      x: Math.cos(theta) * r * radius,
      y: y * radius,
      z: Math.sin(theta) * r * radius,
    });
  }
  return points;
}

self.onmessage = (event: MessageEvent<LayoutWorkerInput>) => {
  const { entities, relations, communities, existingPositions, isIncremental } = event.data;

  // Seeded PRNG for deterministic simulation
  const rng = seedrandom("brain-viewer-layout-seed-v1");

  // Build community centroid map
  const communityIds = [...new Set(communities.map((c) => c.id))].sort();
  const commCentroids: Record<string, { x: number; y: number; z: number }> = {};
  const spherePoints = fibonacciSphere(Math.max(communityIds.length, 1), 600);
  communityIds.forEach((cid, i) => {
    commCentroids[cid] = spherePoints[i] || { x: 0, y: 0, z: 0 };
  });

  // Build entity→community map and member counts
  const entityCommunity: Record<string, string> = {};
  const commMemberCounts: Record<string, number> = {};
  for (const comm of communities) {
    commMemberCounts[comm.id] = comm.member_entity_ids.length;
    for (const eid of comm.member_entity_ids) {
      entityCommunity[eid] = comm.id;
    }
  }

  // Build nodes
  const nodes: SimNode[] = entities.map((e) => {
    const commId = e.community_id || entityCommunity[e.id] || null;
    const existing = existingPositions[e.id];
    const centroid = commId ? commCentroids[commId] : { x: 0, y: 0, z: 0 };

    // Use existing position, or place near community centroid with jitter
    const x = existing?.x ?? centroid.x + (rng() - 0.5) * 120;
    const y = existing?.y ?? centroid.y + (rng() - 0.5) * 120;
    const z = existing?.z ?? centroid.z + (rng() - 0.5) * 120;

    return { id: e.id, x, y, z, communityId: commId, observationCount: e.observation_count };
  });

  // For incremental updates: freeze distant nodes
  if (isIncremental && Object.keys(existingPositions).length > 0) {
    const newNodeIds = new Set(
      entities.filter((e) => !existingPositions[e.id]).map((e) => e.id)
    );

    // Find changed relation endpoints
    const changedNodeIds = new Set<string>(newNodeIds);
    // Also include neighbors of new nodes (1-hop)
    const adjacency: Record<string, Set<string>> = {};
    for (const r of relations) {
      const sid = typeof r.subject_id === "string" ? r.subject_id : r.subject_id;
      const oid = typeof r.object_id === "string" ? r.object_id : r.object_id;
      if (!adjacency[sid]) adjacency[sid] = new Set();
      if (!adjacency[oid]) adjacency[oid] = new Set();
      adjacency[sid].add(oid);
      adjacency[oid].add(sid);
    }

    // BFS to 3 hops from changed nodes
    const unfrozen = new Set<string>(changedNodeIds);
    let frontier = new Set<string>(changedNodeIds);
    for (let hop = 0; hop < 3; hop++) {
      const nextFrontier = new Set<string>();
      for (const nid of frontier) {
        for (const neighbor of adjacency[nid] || []) {
          if (!unfrozen.has(neighbor)) {
            unfrozen.add(neighbor);
            nextFrontier.add(neighbor);
          }
        }
      }
      frontier = nextFrontier;
    }

    // Pin all nodes outside the unfrozen set
    for (const node of nodes) {
      if (!unfrozen.has(node.id) && existingPositions[node.id]) {
        node.fx = node.x;
        node.fy = node.y;
        node.fz = node.z;
      }
    }
  }

  // Build links
  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const links: SimLink[] = relations
    .filter((r) => nodeIdSet.has(r.subject_id) && nodeIdSet.has(r.object_id))
    .map((r) => ({ source: r.subject_id, target: r.object_id }));

  // Community attractive force: pull nodes toward their community centroid.
  // Strength scales inversely with sqrt(community size) to prevent
  // large communities from collapsing into an overlapping blob.
  function communityForce(alpha: number) {
    for (const node of nodes) {
      if (node.fx != null) continue; // skip pinned nodes
      const centroid = node.communityId ? commCentroids[node.communityId] : null;
      if (centroid) {
        const memberCount = node.communityId ? (commMemberCounts[node.communityId] || 1) : 1;
        const strength = 0.03 * alpha / Math.max(1, Math.sqrt(memberCount));
        node.x += (centroid.x - node.x) * strength;
        node.y += (centroid.y - node.y) * strength;
        node.z += (centroid.z - node.z) * strength;
      }
    }
  }

  // Create simulation
  const simulation = forceSimulation(nodes, 3)
    .randomSource(rng)
    .force("charge", forceManyBody().strength(-400).distanceMax(800))
    .force(
      "link",
      forceLink(links)
        .id((d: any) => d.id)
        .distance(120)
        .strength(0.2)
    )
    .force("center", forceCenter(0, 0, 0).strength(0.03))
    .force("collide", forceCollide((d: SimNode) => 6 * GEOM_RADIUS * getNodeSize(d.observationCount)).iterations(10))
    .force("community", communityForce as any)
    .alpha(isIncremental ? 0.1 : 1.0)
    .alphaMin(0.001)
    .alphaDecay(0.02)
    .stop();

  // Run simulation manually and report progress
  const totalTicks = Math.ceil(
    Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay())
  );
  let tick = 0;

  function runBatch() {
    const batchSize = 20;
    for (let i = 0; i < batchSize && simulation.alpha() > simulation.alphaMin(); i++) {
      simulation.tick();
      tick++;
    }

    const progress = Math.min(tick / totalTicks, 1);

    if (simulation.alpha() <= simulation.alphaMin() || progress >= 1) {
      // Done — send final positions
      const positions: Record<string, NodePosition> = {};
      for (const node of nodes) {
        positions[node.id] = { x: node.x, y: node.y, z: node.z };
      }
      const output: LayoutWorkerOutput = { type: "positions", positions };
      self.postMessage(output);
    } else {
      // Send progress update with intermediate positions
      const positions: Record<string, NodePosition> = {};
      for (const node of nodes) {
        positions[node.id] = { x: node.x, y: node.y, z: node.z };
      }
      const output: LayoutWorkerOutput = { type: "progress", positions, progress };
      self.postMessage(output);
      setTimeout(runBatch, 0);
    }
  }

  runBatch();
};
