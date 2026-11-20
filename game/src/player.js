// player.js — the player on foot: walking and sprinting with building collision,
// stealing cars (peacefully parked, or the fun way, out from under a driver),
// and the gunplay: two buyable weapons with magazines, reserves and reloads.

import {
  PLAYER_RADIUS, WALK_SPEED, SPRINT_SPEED, PLAYER_MAX_HEALTH, PLAYER_MAX_ARMOR,
  HEAT_JACK, HEAT_JACK_OCCUPIED, HEAT_SHOT, WATER_X, WORLD_H,
} from './config.js';
import { clamp, dist, pushOutOfRect, circleRectHit } from './rng.js';
import { solids, world } from './world.js';
import { cars, nearestCar } from './vehicles.js';
import { peds, knockDown, scarePeds } from './peds.js';
import { addHeat } from './police.js';
import { mouse, key } from './input.js';
import { sfx } from './audio.js';

export const WEAPONS = {
  fists: { name: 'FISTS', damage: 0, rate: 0.4, range: 30, mag: Infinity, auto: false },
  pistol: { name: 'PISTOL', damage: 34, rate: 0.3, range: 580, mag: 12, auto: false, price: 250, ammoPrice: 40, ammoPack: 48 },
  smg: { name: 'SMG', damage: 21, rate: 0.095, range: 540, mag: 30, auto: true, price: 900, ammoPrice: 90, ammoPack: 120 },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg'];

export const player = {
  x: 240, y: 300, angle: 0,
  health: PLAYER_MAX_HEALTH, armor: 0,
  money: 120,
  car: null,
  weapons: { pistol: { owned: false, mag: 0, reserve: 0 }, smg: { owned: false, mag: 0, reserve: 0 } },
  weapon: 'fists',
  fireTimer: 0, reloadTimer: 0,
  missionsDone: 0,
  dead: false,
};

export function resetPlayer(save) {
  player.x = world.playerStart.x;
  player.y = world.playerStart.y;
  player.health = PLAYER_MAX_HEALTH;
  player.armor = 0;
  player.money = 120;
  player.car = null;
  player.weapon = 'fists';
  player.weapons = { pistol: { owned: false, mag: 0, reserve: 0 }, smg: { owned: false, mag: 0, reserve: 0 } };
  player.missionsDone = 0;
  player.dead = false;
  if (save) {
    player.money = save.money ?? player.money;
    player.missionsDone = save.missionsDone ?? 0;
    if (save.weapons) {
      for (const k of ['pistol', 'smg']) {
        if (save.weapons[k]) player.weapons[k] = { ...save.weapons[k] };
      }
    }
    if (save.weapon && (save.weapon === 'fists' || player.weapons[save.weapon]?.owned)) player.weapon = save.weapon;
    player.armor = save.armor ?? 0;
  }
}

export function hurtPlayer(amount) {
  if (player.dead) return;
  let left = amount;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, left * 0.7);
    player.armor -= absorbed;
    left -= absorbed;
  }
  player.health -= left;
  if (player.health <= 0) { player.health = 0; player.dead = true; }
}

export function healPlayer(amount) {
  player.health = Math.min(PLAYER_MAX_HEALTH, player.health + amount);
}

/** On-foot movement + collisions. aimAngle faces the mouse (screen space via camera). */
export function stepPlayerOnFoot(dt, move, camera) {
  const sprint = key('ShiftLeft') || key('ShiftRight');
  const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
  player.x += move.x * speed * dt;
  player.y += move.y * speed * dt;
  if (move.x !== 0 || move.y !== 0) player.angle = Math.atan2(move.y, move.x);
  // Face the mouse when a gun is out, else face the walk direction.
  if (player.weapon !== 'fists') {
    const sx = player.x - camera.x, sy = player.y - camera.y;
    player.angle = Math.atan2(mouse.y - sy, mouse.x - sx);
  }
  for (const b of solids()) {
    const out = pushOutOfRect(player.x, player.y, PLAYER_RADIUS, b);
    if (out.hit) { player.x = out.x; player.y = out.y; }
  }
  for (const car of cars) {
    if (car.mode === 'wreck') continue;
    const d = dist(player.x, player.y, car.x, car.y);
    const rr = PLAYER_RADIUS + car.radius * 0.8;
    if (d < rr && d > 0.01) {
      const push = rr - d;
      player.x += ((player.x - car.x) / d) * push;
      player.y += ((player.y - car.y) / d) * push;
    }
  }
  player.x = clamp(player.x, 16, WATER_X - 10);
  player.y = clamp(player.y, 16, WORLD_H - 16);
}

/** Enter the nearest car, or climb out of the current one. Returns a message for the HUD. */
export function tryEnterExitCar(effects) {
  if (player.car) {
    const car = player.car;
    player.car = null;
    car.mode = car.driver === 'player' ? 'parked' : car.mode;
    car.driver = null;
    car.speed = 0;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
    sfx.door();
    return { exited: true };
  }
  const car = nearestCar(player.x, player.y, 58, (c) => c.mode !== 'wreck');
  if (!car) return null;
  const occupied = car.mode === 'traffic' && car.driver === 'traffic';
  if (occupied) {
    // Yank the driver out: a new pedestrian appears, furious and terrified.
    const { spawnPedAt } = effects;
    spawnPedAt(car.x, car.y);
    addHeat(HEAT_JACK_OCCUPIED);
    scarePeds(car.x, car.y, 150);
    sfx.jack();
  } else if (car.mode === 'parked') {
    addHeat(0); // nobody saw a thing... this time
    sfx.door();
  }
  if (car.mode === 'parked' && Math.random() < 0.3) addHeat(HEAT_JACK * 0.4); // a witness, sometimes
  car.mode = 'player';
  car.driver = 'player';
  car.road = null;
  player.car = car;
  player.x = car.x; player.y = car.y;
  return { entered: car, jacked: occupied };
}

export function currentWeapon() {
  return WEAPONS[player.weapon];
}

export function swapWeapon() {
  const owned = WEAPON_ORDER.filter((w) => w === 'fists' || player.weapons[w].owned);
  const i = owned.indexOf(player.weapon);
  player.weapon = owned[(i + 1) % owned.length];
  player.reloadTimer = 0;
  sfx.reload();
}

export function startReload() {
  const w = currentWeapon();
  const slot = player.weapons[player.weapon];
  if (!slot || slot.reserve <= 0 || slot.mag >= w.mag || player.reloadTimer > 0) return;
  player.reloadTimer = 1.1;
  sfx.reload();
}

function finishReload() {
  const w = currentWeapon();
  const slot = player.weapons[player.weapon];
  const need = w.mag - slot.mag;
  const take = Math.min(need, slot.reserve);
  slot.mag += take;
  slot.reserve -= take;
}

/**
 * Gunfire. effects: {tracer(x1,y1,x2,y2), hitSpark(x,y), onPedDown(ped, fatal), onCarHit(car), onCrateHit(crate)}
 * Returns true if a shot was fired.
 */
export function stepShooting(dt, effects) {
  player.fireTimer -= dt;
  if (player.reloadTimer > 0) {
    player.reloadTimer -= dt;
    if (player.reloadTimer <= 0) finishReload();
    return false;
  }
  if (player.car || player.weapon === 'fists') return false;
  const w = currentWeapon();
  const slot = player.weapons[player.weapon];
  const wantFire = w.auto ? mouse.down : mouse.down && player.fireTimer <= 0;
  if (!wantFire || player.fireTimer > 0) return false;
  if (slot.mag <= 0) {
    if (mouse.down && player.fireTimer <= 0) { sfx.dryFire(); player.fireTimer = 0.3; startReload(); }
    return false;
  }
  slot.mag--;
  player.fireTimer = w.rate;
  sfx.shot(player.weapon);
  addHeat(HEAT_SHOT);
  scarePeds(player.x, player.y, 260);

  const spread = (Math.random() - 0.5) * (player.weapon === 'smg' ? 0.07 : 0.025);
  const a = player.angle + spread;
  const step = 9;
  let hx = player.x + Math.cos(a) * w.range;
  let hy = player.y + Math.sin(a) * w.range;
  let hitSomething = false;
  for (let d = step; d < w.range; d += step) {
    const x = player.x + Math.cos(a) * d;
    const y = player.y + Math.sin(a) * d;
    let blocked = false;
    for (const b of solids()) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { blocked = true; break; }
    }
    if (blocked) { hx = x; hy = y; hitSomething = true; effects.hitSpark(x, y); break; }
    for (const ped of peds) {
      if (ped.state !== 'down' && dist(x, y, ped.x, ped.y) < 12) {
        hx = x; hy = y; hitSomething = true;
        const wasUp = ped.state !== 'down';
        if (knockDown(ped, 9)) effects.onPedDown(ped, wasUp);
        effects.hitSpark(x, y);
        break;
      }
    }
    if (hitSomething) break;
    for (const car of cars) {
      if (dist(x, y, car.x, car.y) < car.radius) {
        hx = x; hy = y; hitSomething = true;
        car.health = Math.max(0, car.health - w.damage * 0.6);
        effects.onCarHit(car);
        effects.hitSpark(x, y);
        break;
      }
    }
    if (hitSomething) break;
    for (const crate of world.crates) {
      if (crate.alive && Math.abs(x - crate.x) < 15 && Math.abs(y - crate.y) < 15) {
        hx = x; hy = y; hitSomething = true;
        crate.hp -= w.damage >= 30 ? 2 : 1;
        if (crate.hp <= 0) crate.alive = false;
        effects.onCrateHit(crate);
        effects.hitSpark(x, y);
        break;
      }
    }
    if (hitSomething) break;
  }
  effects.tracer(player.x + Math.cos(a) * 20, player.y + Math.sin(a) * 20, hx, hy);
  if (slot.mag === 0) startReload();
  return true;
}

/** Crime bookkeeping the missions and police share. */
export function crimeHeat(kind) {
  return kind;
}

export function playerSpeed() {
  return player.car ? player.car.speed : 0;
}

export { circleRectHit };
