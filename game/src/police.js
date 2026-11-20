// police.js — the Sunset Bay PD: the wanted system (heat that only cools while
// nobody in uniform is watching), patrol spawns that arrive from off-screen,
// pursuit driving, the bust clock, and the helicopter that joins at four stars.

import {
  HEAT_PER_STAR, MAX_STARS, HEAT_DECAY_PER_SEC, POLICE_BASE_SPEED,
  BUST_RADIUS, BUST_TIME, HELI_MIN_STARS, WORLD_H,
} from './config.js';
import { clamp, dist, rand } from './rng.js';
import { cars, makeCar, removeCar, stepPoliceCar } from './vehicles.js';
import { world, vLaneX, hLaneY } from './world.js';
import { sirenSet } from './audio.js';

export const police = {
  heat: 0,
  seenTimer: 0,       // time since a unit last had eyes on the player
  bustTimer: 0,
  spawnCooldown: 0,
  heli: null,         // {x,y,angle,on}
  get stars() { return Math.min(MAX_STARS, Math.floor(this.heat / HEAT_PER_STAR)); },
  get seen() { return this.seenTimer < 0.4; },
};

export function addHeat(amount) {
  if (amount <= 0) return;
  police.heat = clamp(police.heat + amount, 0, MAX_STARS * HEAT_PER_STAR + 40);
}

export function clearHeat() {
  police.heat = 0;
  police.bustTimer = 0;
}

export function policeCars() {
  return cars.filter((c) => c.isPolice && c.mode === 'police');
}

function desiredUnits(stars) {
  return [0, 1, 2, 3, 4, 5][stars] || 0;
}

function spawnCop(px, py) {
  // Arrive on a road, off-screen but close: the bay answers fast.
  for (let tries = 0; tries < 6; tries++) {
    const vertical = Math.random() < 0.5;
    let x, y, angle;
    if (vertical) {
      const i = Math.floor(rand(0, world.vRoads.length));
      const dir = Math.random() < 0.5 ? -1 : 1;
      x = vLaneX(i, dir); y = py + (dir > 0 ? -560 : 560); angle = dir < 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      const j = Math.floor(rand(0, world.hRoads.length));
      const dir = Math.random() < 0.5 ? -1 : 1;
      x = px + (dir > 0 ? -560 : 560); y = hLaneY(j, dir); angle = dir > 0 ? 0 : Math.PI;
    }
    y = clamp(y, 60, WORLD_H - 60);
    x = clamp(x, 60, 2800);
    if (dist(x, y, px, py) < 380) continue;
    const cop = makeCar('police', x, y, angle);
    cop.speed = 140;
    return cop;
  }
  return null;
}

function stepHeli(dt, px, py) {
  const heli = police.heli;
  // The helicopter shadows the player from a offset, close enough to light them.
  const tx = px - 130, ty = py - 150;
  heli.x += (tx - heli.x) * Math.min(1, dt * 1.4);
  heli.y += (ty - heli.y) * Math.min(1, dt * 1.4);
  heli.angle += dt * 0.8;
  heli.lightX = px + Math.sin(heli.angle * 0.7) * 24;
  heli.lightY = py + Math.cos(heli.angle * 0.9) * 24;
}

/**
 * Advance the whole police response one frame.
 * ctx: {px, py, playerSpeed, onFoot}
 * Returns events: {busted:boolean, nearest:number}
 */
export function stepPolice(dt, ctx) {
  const stars = police.stars;
  const events = { busted: false, nearest: Infinity };
  const units = policeCars();

  // Eyes on the player?
  let seen = false;
  for (const cop of units) {
    const d = dist(cop.x, cop.y, ctx.px, ctx.py);
    events.nearest = Math.min(events.nearest, d);
    if (d < 460) seen = true;
  }
  if (police.heli && dist(police.heli.x, police.heli.y, ctx.px, ctx.py) < 520) seen = true;
  if (seen) police.seenTimer = 0; else police.seenTimer += dt;

  // Heat cools only while unwatched, and faster at low stars.
  if (!seen && stars > 0) {
    police.heat = Math.max(0, police.heat - HEAT_DECAY_PER_SEC * dt * (stars <= 2 ? 1.5 : 1));
  }
  if (police.heat <= 0.5 && stars === 0) {
    // All quiet: units peel away and despawn off-screen.
    for (const cop of units) if (dist(cop.x, cop.y, ctx.px, ctx.py) > 700) removeCar(cop);
  }

  // Reinforcements.
  police.spawnCooldown -= dt;
  if (units.length < desiredUnits(stars) && police.spawnCooldown <= 0) {
    if (spawnCop(ctx.px, ctx.py)) police.spawnCooldown = 2.2;
    else police.spawnCooldown = 0.8;
  }
  // Too many units for the current heat: the extras give up at distance.
  if (units.length > desiredUnits(stars)) {
    const extra = units[units.length - 1];
    if (dist(extra.x, extra.y, ctx.px, ctx.py) > 320) removeCar(extra);
  }

  // Pursuit.
  const topSpeed = POLICE_BASE_SPEED + stars * 14;
  for (const cop of policeCars()) {
    stepPoliceCar(cop, dt, ctx.px, ctx.py, topSpeed);
  }

  // Helicopter at four stars and up.
  if (stars >= HELI_MIN_STARS) {
    if (!police.heli) police.heli = { x: ctx.px - 500, y: ctx.py - 500, angle: 0, lightX: ctx.px, lightY: ctx.py };
    stepHeli(dt, ctx.px, ctx.py);
  } else if (police.heli) {
    police.heli.x -= dt * 300; police.heli.y -= dt * 300;
    if (dist(police.heli.x, police.heli.y, ctx.px, ctx.py) > 900) police.heli = null;
  }

  // The bust clock: close, and the player slow or on foot, and it fills.
  const closeCop = events.nearest < BUST_RADIUS;
  const slow = ctx.onFoot || Math.abs(ctx.playerSpeed) < 42;
  if (stars > 0 && closeCop && slow) {
    police.bustTimer += dt;
    if (police.bustTimer >= BUST_TIME) {
      events.busted = true;
      police.bustTimer = 0;
    }
  } else {
    police.bustTimer = Math.max(0, police.bustTimer - dt * 1.6);
  }

  // Siren volume follows the nearest unit.
  const closeness = events.nearest === Infinity ? 0 : clamp(1 - events.nearest / 700, 0, 1);
  sirenSet(stars > 0 && units.length > 0, closeness);

  return events;
}

/** Mission helper: is the player currently out of police sight? */
export function isHidden() {
  return !police.seen && police.stars <= 1;
}
