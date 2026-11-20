// vehicles.js — the Vehicle class and every way a car moves: parked, flowing
// traffic that follows the road grid and stops for trouble, police pursuit
// driving, and the player's own driving with drift and damage.

import { WORLD_W, WORLD_H, WATER_X } from './config.js';
import { clamp, rand, pick, turnToward, angleDelta, dist } from './rng.js';
import { world, vLaneX, hLaneY, solids } from './world.js';
import { pushOutOfRect } from './rng.js';

export const CAR_MODELS = [
  { name: 'Sedan', w: 46, h: 22, top: 372, accel: 250, colors: ['#c94a4a', '#4a7ac9', '#e8e3d8', '#3a3f47', '#7ac94a', '#c9a44a'] },
  { name: 'Taxi', w: 46, h: 22, top: 360, accel: 245, colors: ['#f2b705'] },
  { name: 'Sport', w: 44, h: 20, top: 452, accel: 330, colors: ['#ff5e3a', '#b44ae0', '#22c3aa', '#ffd33d'] },
  { name: 'Van', w: 54, h: 26, top: 318, accel: 210, colors: ['#d8d8d8', '#5b7a8c', '#8c5b6e'] },
];

let nextId = 1;

export class Vehicle {
  constructor(model, x, y, angle, color) {
    this.id = nextId++;
    this.model = model;
    this.x = x; this.y = y;
    this.angle = angle;
    this.speed = 0;
    this.w = model.w; this.h = model.h;
    this.color = color;
    this.health = 100;
    this.mode = 'parked';        // parked | traffic | player | police | wreck
    this.driver = null;          // 'traffic' | 'police' | 'player' | null
    this.road = null;            // traffic state {axis,index,dir,nextY,nextX}
    this.steerVis = 0;           // front-wheel visual
    this.smoke = 0;
    this.honkAt = 0;
    this.stuckAt = 0;
    this.passenger = false;      // taxi mission passenger aboard
    this.missionCar = false;     // marked by a mission
    this.hitCooldown = 0;
  }
  get radius() { return this.w * 0.46; }
  get wrecked() { return this.health <= 0; }
  pos() { return { x: this.x, y: this.y }; }
}

/** Every car currently in the world. main.js owns this list. */
export const cars = [];

export function makeCar(kind, x, y, angle) {
  let model;
  if (kind === 'taxi') model = CAR_MODELS[1];
  else if (kind === 'police') model = CAR_MODELS[0];
  else model = pick(CAR_MODELS);
  const color = kind === 'police' ? '#e8ecf2' : pick(model.colors);
  const car = new Vehicle(model, x, y, angle, color);
  if (kind === 'police') { car.mode = 'police'; car.driver = 'police'; car.isPolice = true; }
  cars.push(car);
  return car;
}

export function removeCar(car) {
  const i = cars.indexOf(car);
  if (i >= 0) cars.splice(i, 1);
}

/** Parked cars in the lots and along the beach road. */
export function spawnParkedCars() {
  for (const lot of world.lots) {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const x = lot.x + 30 + Math.random() * (lot.w - 60);
      const y = lot.y + 30 + Math.random() * (lot.h - 60);
      const car = makeCar('car', x, y, pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]));
      car.mode = 'parked';
    }
  }
  for (let i = 0; i < 6; i++) {
    const car = makeCar('car', 3000 + Math.random() * 60, 300 + i * 340 + rand(-40, 40), -Math.PI / 2);
    car.mode = 'parked';
  }
  // One taxi waits by the motel: the player's first ride is never far away.
  const taxi = makeCar('taxi', 330, 470, Math.PI / 2);
  taxi.mode = 'parked';
}

/** A fresh traffic car entering on a random lane, away from (px,py). */
export function spawnTrafficCar(px, py) {
  for (let tries = 0; tries < 8; tries++) {
    const vertical = Math.random() < 0.5;
    let car;
    if (vertical) {
      const index = Math.floor(Math.random() * world.vRoads.length);
      const dir = Math.random() < 0.5 ? -1 : 1;
      const y = dir < 0 ? WORLD_H - 80 : 80;
      car = makeCar(Math.random() < 0.14 ? 'taxi' : 'car', vLaneX(index, dir), y, dir < 0 ? -Math.PI / 2 : Math.PI / 2);
      car.road = { axis: 'v', index, dir, decision: 0 };
      car.road.decision = nextDecisionV(car);
    } else {
      const index = Math.floor(Math.random() * world.hRoads.length);
      const dir = Math.random() < 0.5 ? -1 : 1;
      const x = dir > 0 ? 80 : 2760;
      car = makeCar(Math.random() < 0.14 ? 'taxi' : 'car', x, hLaneY(index, dir), dir > 0 ? 0 : Math.PI);
      car.road = { axis: 'h', index, dir, decision: 0 };
      car.road.decision = nextDecisionH(car);
    }
    if (dist(car.x, car.y, px, py) < 500) { removeCar(car); continue; }
    car.mode = 'traffic';
    car.driver = 'traffic';
    car.speed = 120;
    return car;
  }
  return null;
}

function nextDecisionV(car) {
  // The y of the next intersection centre ahead of the car on its vertical road.
  let best = car.road.dir > 0 ? Infinity : -Infinity;
  for (const ry of world.hRoads) {
    const cy = ry + 42;
    if (car.road.dir > 0 && cy > car.y + 30 && cy < best) best = cy;
    if (car.road.dir < 0 && cy < car.y - 30 && cy > best) best = cy;
  }
  return best;
}
function nextDecisionH(car) {
  let best = car.road.dir > 0 ? Infinity : -Infinity;
  for (const rx of world.vRoads) {
    const cx = rx + 42;
    if (car.road.dir > 0 && cx > car.x + 30 && cx < best) best = cx;
    if (car.road.dir < 0 && cx < car.x - 30 && cx > best) best = cx;
  }
  return best;
}

/** Something solid or alive is just ahead of this car: brake lights on. */
function blockedAhead(car, lookDist) {
  const fx = car.x + Math.cos(car.angle) * lookDist;
  const fy = car.y + Math.sin(car.angle) * lookDist;
  for (const other of cars) {
    if (other === car || other.mode === 'wreck') continue;
    if (Math.abs(other.x - fx) < 30 && Math.abs(other.y - fy) < 30) return true;
  }
  return false;
}

export function stepTraffic(car, dt, events) {
  const r = car.road;
  if (!r) return;
  // Target: a point far down the current lane.
  let tx, ty;
  if (r.axis === 'v') { tx = vLaneX(r.index, r.dir); ty = car.y + r.dir * 420; }
  else { tx = car.x + r.dir * 420; ty = hLaneY(r.index, r.dir); }

  const want = Math.atan2(ty - car.y, tx - car.x);
  car.angle = turnToward(car.angle, want, 1.9 * dt);
  car.steerVis = clamp(angleDelta(car.angle, want) * 2, -0.5, 0.5);

  const cruise = 165;
  let target = cruise;
  if (blockedAhead(car, 74)) target = 0;
  else if (blockedAhead(car, 120)) target = cruise * 0.45;
  car.speed = approach(car.speed, target, (target > car.speed ? 130 : 340) * dt);

  moveCar(car, dt);

  // At an intersection, maybe turn onto the crossing road.
  const passed = r.axis === 'v'
    ? (r.dir > 0 ? car.y >= r.decision : car.y <= r.decision)
    : (r.dir > 0 ? car.x >= r.decision : car.x <= r.decision);
  if (passed && Number.isFinite(r.decision)) {
    const roll = Math.random();
    if (r.axis === 'v') {
      const j = world.hRoads.findIndex((ry) => Math.abs(ry + 42 - r.decision) < 4);
      if (roll < 0.42 && j >= 0) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        car.road = { axis: 'h', index: j, dir, decision: 0 };
        car.road.decision = nextDecisionH(car);
      } else {
        r.decision = nextDecisionV(car);
      }
    } else {
      const i = world.vRoads.findIndex((rx) => Math.abs(rx + 42 - r.decision) < 4);
      if (roll < 0.42 && i >= 0) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        car.road = { axis: 'v', index: i, dir, decision: 0 };
        car.road.decision = nextDecisionV(car);
      } else {
        r.decision = nextDecisionH(car);
      }
    }
  }

  // Despawn at the world edges so fresh traffic can flow in.
  if (car.x < -80 || car.x > WATER_X + 60 || car.y < -80 || car.y > WORLD_H + 80) {
    removeCar(car);
    events.trafficLeft = true;
  }
}

export function stepPoliceCar(car, dt, tx, ty, topSpeed) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  const gap = dist(car.x, car.y, tx, ty);
  car.angle = turnToward(car.angle, want, 2.5 * dt);
  car.steerVis = clamp(angleDelta(car.angle, want) * 2, -0.5, 0.5);
  let target = topSpeed;
  if (gap < 60) target = topSpeed * 0.55;         // pull alongside, don't orbit
  if (gap < 26) target = 60;
  car.speed = approach(car.speed, target, 300 * dt);
  moveCar(car, dt);
}

/** ctl: {throttle -1..1, steer -1..1, handbrake bool}. Returns speed ratio for audio. */
export function drivePlayerCar(car, dt, ctl) {
  const m = car.model;
  if (ctl.throttle > 0) car.speed += m.accel * ctl.throttle * dt * (car.speed < 0 ? 2.2 : 1);
  else if (ctl.throttle < 0) car.speed += m.accel * 0.62 * ctl.throttle * dt * (car.speed > 0 ? 2.4 : 1);
  const drag = ctl.handbrake ? 2.6 : 0.55;
  car.speed -= car.speed * drag * dt;
  if (!ctl.throttle) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = clamp(car.speed, -m.top * 0.42, m.top);
  const steerPower = clamp(Math.abs(car.speed) / 120, 0, 1) * (ctl.handbrake ? 1.65 : 1);
  car.angle += ctl.steer * steerPower * 1.85 * dt * (car.speed < 0 ? -1 : 1);
  car.steerVis = lerpSteer(car.steerVis, ctl.steer * 0.5);
  moveCar(car, dt);
  return Math.abs(car.speed) / m.top;
}

function lerpSteer(a, b) { return a + (b - a) * 0.3; }

function approach(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  return Math.max(target, v - step);
}

function moveCar(car, dt) {
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 24, WATER_X - 6);
  car.y = clamp(car.y, 24, WORLD_H - 24);
}

/** Push a car out of buildings; a hard arrival costs health. Returns impact speed. */
export function collideCarWorld(car) {
  let impact = 0;
  for (const b of solids()) {
    const before = Math.abs(car.speed);
    const out = pushOutOfRect(car.x, car.y, car.radius, b);
    if (out.hit) {
      car.x = out.x; car.y = out.y;
      if (before > 150) {
        impact = Math.max(impact, before);
        car.health -= (before - 140) * 0.055;
        car.speed *= -0.22;
      } else {
        car.speed *= 0.4;
      }
    }
  }
  if (car.health < 0) car.health = 0;
  return impact;
}

/** Circle collision between two cars; returns impact (relative speed) or 0. */
export function collideCarPair(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const rr = a.radius + b.radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 === 0) return 0;
  const d = Math.sqrt(d2);
  const push = (rr - d) / 2;
  const nx = dx / d, ny = dy / d;
  if (a.mode !== 'parked') { a.x -= nx * push; a.y -= ny * push; }
  if (b.mode !== 'parked') { b.x += nx * push; b.y += ny * push; }
  const rel = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.3;
  if (rel > 130) {
    const dmg = (rel - 120) * 0.045;
    a.health = Math.max(0, a.health - dmg);
    b.health = Math.max(0, b.health - dmg);
    a.speed *= 0.55; b.speed *= 0.55;
    return rel;
  }
  return 0;
}

export function nearestCar(x, y, maxD, filter = () => true) {
  let best = null, bestD = maxD;
  for (const car of cars) {
    if (!filter(car)) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}
