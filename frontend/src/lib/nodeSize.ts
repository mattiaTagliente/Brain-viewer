/** Shared node sizing constants used by both NodeMesh (render) and layoutWorker (collision). */

export const GEOM_RADIUS = 3;
export const SIZE_BUCKETS = [0.8, 1.2, 1.8, 2.5] as const;

export function getNodeSize(obsCount: number): number {
  if (obsCount <= 1) return SIZE_BUCKETS[0];
  if (obsCount <= 5) return SIZE_BUCKETS[1];
  if (obsCount <= 15) return SIZE_BUCKETS[2];
  return SIZE_BUCKETS[3];
}
