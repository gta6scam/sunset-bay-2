// rng.js — a small seeded random generator (mulberry32) plus the handful of
// helpers every module reaches for. The city is generated from a fixed seed so
// Sunset Bay is the same city on every visit; gameplay randomness uses Math.random.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (min, max) => min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(rand(min, max + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Shortest signed turn from angle a to angle b, in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turn `angle` toward `target` by at most `maxStep` radians. */
export function turnToward(angle, target, maxStep) {
  const d = angleDelta(angle, target);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

export const dist2 = (ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

/** Circle vs axis-aligned rectangle overlap test (rect given as x, y, w, h). */
export function circleRectHit(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  return dist2(cx, cy, nx, ny) < r * r;
}

/** Push a circle out of a rectangle along the smallest axis; returns the corrected centre. */
export function pushOutOfRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  let dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return { x: cx, y: cy, hit: false };
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: nx + (dx / d) * r, y: ny + (dy / d) * r, hit: true };
  }
  // Centre is inside the rect: leave by the nearest face.
  const left = cx - rect.x, right = rect.x + rect.w - cx;
  const top = cy - rect.y, bottom = rect.y + rect.h - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: rect.x - r, y: cy, hit: true };
  if (m === right) return { x: rect.x + rect.w + r, y: cy, hit: true };
  if (m === top) return { x: cx, y: rect.y - r, hit: true };
  return { x: cx, y: rect.y + rect.h + r, hit: true };
}
