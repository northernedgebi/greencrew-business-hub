export type Point = { lat: number; lng: number };
export type Stop = { id: string; lat: number | null; lng: number | null };

/** Great-circle distance in km. */
export function distanceKm(a: Point, b: Point) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pathLength(start: Point | null, pts: Point[]) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += distanceKm(pts[i - 1]!, pts[i]!);
  if (start && pts.length) d += distanceKm(start, pts[0]!) + distanceKm(pts[pts.length - 1]!, start);
  return d;
}

/**
 * Orders stops for the shortest straight-line trip. With a start point the
 * trip begins and ends there. Stops without coordinates go last, in input order.
 */
export function optimizeRoute(start: Point | null, stops: Stop[]): string[] {
  const located = stops.filter((s): s is Stop & Point => s.lat != null && s.lng != null);
  const missing = stops.filter((s) => s.lat == null || s.lng == null).map((s) => s.id);
  if (located.length < 2) return [...located.map((s) => s.id), ...missing];

  // Nearest neighbour seed.
  const left = [...located];
  const order: (Stop & Point)[] = [];
  let cur: Point = start ?? left.shift()!;
  if (!start) order.push(cur as Stop & Point);
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (distanceKm(cur, left[i]!) < distanceKm(cur, left[best]!)) best = i;
    cur = left.splice(best, 1)[0]!;
    order.push(cur as Stop & Point);
  }

  // 2-opt improvement.
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const next = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (pathLength(start, next) + 1e-9 < pathLength(start, order)) { order.splice(0, order.length, ...next); improved = true; }
      }
    }
  }
  return [...order.map((s) => s.id), ...missing];
}

export function routeDistanceKm(start: Point | null, pts: Point[]) {
  return pathLength(start, pts);
}
