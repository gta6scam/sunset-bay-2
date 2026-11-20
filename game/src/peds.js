// peds.js — the people of Sunset Bay. They stroll the sidewalks around their
// block, and they run when the day turns violent near them: gunfire, a car on
// the pavement, a chase coming through.

import { WORLD_H, BEACH_X } from './config.js';
import { rand, pick, turnToward, dist } from './rng.js';
import { world } from './world.js';

const SHIRTS = ['#e8e3d8', '#c94a4a', '#4a7ac9', '#7ac94a', '#e07ac9', '#4ad0c9', '#f2b705', '#8c6ee0'];
const SKINS = ['#f2c79b', '#c98d5e', '#8a5a34', '#6e4525', '#ffd9b3'];

export class Ped {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.angle = rand(0, Math.PI * 2);
    this.speed = 0;
    this.state = 'walk';        // walk | flee | down
    this.target = null;
    this.shirt = pick(SHIRTS);
    this.skin = pick(SKINS);
    this.downTimer = 0;
    this.fleeFrom = null;
    this.fleeTimer = 0;
    this.walkPhase = rand(0, 6);
  }
  get radius() { return 10; }
}

export const peds = [];

function sidewalkTarget(ped) {
  // Wander: pick a point along a random block's pavement edge or the promenade.
  if (Math.random() < 0.2) {
    return { x: 2860 + rand(-16, 16), y: rand(80, WORLD_H - 80) };
  }
  const b = pick(world.buildings);
  if (!b) return { x: rand(100, 2700), y: rand(100, WORLD_H - 100) };
  const side = Math.floor(rand(0, 4));
  const m = 14;
  if (side === 0) return { x: b.x + rand(0, b.w), y: b.y - m };
  if (side === 1) return { x: b.x + rand(0, b.w), y: b.y + b.h + m };
  if (side === 2) return { x: b.x - m, y: b.y + rand(0, b.h) };
  return { x: b.x + b.w + m, y: b.y + rand(0, b.h) };
}

export function spawnPeds(count) {
  peds.length = 0;
  for (let i = 0; i < count; i++) {
    const t = sidewalkTarget(null);
    const ped = new Ped(t.x, t.y);
    ped.target = sidewalkTarget(ped);
    peds.push(ped);
  }
}

export function scarePeds(x, y, radius) {
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    if (dist(ped.x, ped.y, x, y) < radius) {
      ped.state = 'flee';
      ped.fleeFrom = { x, y };
      ped.fleeTimer = rand(2, 3.6);
    }
  }
}

export function stepPeds(dt) {
  for (const ped of peds) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        // The ambulance is quick in Sunset Bay: they get up and limp off.
        ped.state = 'walk';
        ped.target = sidewalkTarget(ped);
      }
      continue;
    }
    let speed = 62;
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const away = Math.atan2(ped.y - ped.fleeFrom.y, ped.x - ped.fleeFrom.x);
      ped.angle = turnToward(ped.angle, away, 6 * dt);
      speed = 178;
      if (ped.fleeTimer <= 0) { ped.state = 'walk'; ped.target = sidewalkTarget(ped); }
    } else {
      if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 12) {
        ped.target = sidewalkTarget(ped);
      }
      const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
      ped.angle = turnToward(ped.angle, want, 4 * dt);
    }
    ped.walkPhase += dt * (speed / 22);
    ped.x += Math.cos(ped.angle) * speed * dt;
    ped.y += Math.sin(ped.angle) * speed * dt;
    ped.x = Math.max(16, Math.min(BEACH_X + 160, ped.x));
    ped.y = Math.max(16, Math.min(WORLD_H - 16, ped.y));
  }
}

/** A car or a bullet found this pedestrian. Returns true if it was a fresh knockdown. */
export function knockDown(ped, seconds = 7) {
  if (ped.state === 'down') return false;
  ped.state = 'down';
  ped.downTimer = seconds;
  return true;
}

export function nearestPed(x, y, maxD) {
  let best = null, bestD = maxD;
  for (const ped of peds) {
    const d = dist(x, y, ped.x, ped.y);
    if (d < bestD) { bestD = d; best = ped; }
  }
  return best;
}
