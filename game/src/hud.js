// hud.js — everything drawn outside the world canvas: the vitals bars, money,
// wanted stars, weapon readout, objective banner, toasts, the shop menu, and
// the minimap with its blips for the player, the police and the job at hand.

import { WORLD_W, WORLD_H, BEACH_X, WATER_X } from './config.js';
import { world } from './world.js';
import { cars } from './vehicles.js';
import { player, WEAPONS } from './player.js';
import { police } from './police.js';

const el = {};
let toastTimer = null;

export function initHud() {
  for (const id of ['healthFill', 'armorFill', 'money', 'stars', 'clock', 'weaponName', 'ammo',
    'objectiveTitle', 'objectiveSub', 'radioBox', 'radioName', 'toast', 'shopMenu',
    'shopTitle', 'shopItems', 'minimap', 'damageFlash']) {
    el[id] = document.getElementById(id);
  }
}

export function toast(msg, ms = 4200) {
  el.toast.textContent = msg;
  el.toast.style.opacity = '1';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.style.opacity = '0'; }, ms);
}

export function setObjective(title, sub, marker) {
  el.objectiveTitle.style.display = 'inline-block';
  el.objectiveTitle.textContent = title;
  el.objectiveSub.textContent = sub || '';
  currentMarker = marker;
}
export function clearObjective() {
  el.objectiveTitle.style.display = 'none';
  el.objectiveSub.textContent = '';
  currentMarker = null;
}
let currentMarker = null;
export const getMarker = () => currentMarker;

export function flashDamage() {
  el.damageFlash.style.opacity = '1';
  setTimeout(() => { el.damageFlash.style.opacity = '0'; }, 130);
}

export function updateHud(hour) {
  el.healthFill.style.width = `${Math.max(0, player.health)}%`;
  el.armorFill.style.width = `${Math.max(0, player.armor)}%`;
  el.money.textContent = `$${player.money}`;
  const stars = police.stars;
  let starHtml = '';
  for (let i = 0; i < 5; i++) starHtml += i < stars ? '<span class="lit">★</span>' : '★';
  if (el.stars.innerHTML !== starHtml) el.stars.innerHTML = starHtml;
  const hh = Math.floor(hour);
  const mm = Math.floor((hour - hh) * 60);
  el.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const w = WEAPONS[player.weapon];
  el.weaponName.textContent = player.car ? '— DRIVING —' : w.name;
  if (!player.car && player.weapon !== 'fists') {
    const slot = player.weapons[player.weapon];
    el.ammo.textContent = player.reloadTimer > 0 ? 'RELOADING…' : `${slot.mag} / ${slot.reserve}`;
  } else {
    el.ammo.textContent = '';
  }
}

// ---- shop menu ---------------------------------------------------------------
export function showShop(shop, items, selected) {
  el.shopMenu.style.display = 'block';
  el.shopTitle.textContent = shop.label;
  el.shopItems.innerHTML = items.map((item, i) =>
    `<div class="shopItem ${i === selected ? 'sel' : ''}"><span>${item.label}</span><span class="price">$${item.price}</span></div>`,
  ).join('') || '<div class="shopItem"><span>Nothing for sale.</span></div>';
}
export function hideShop() {
  el.shopMenu.style.display = 'none';
}

// ---- minimap -----------------------------------------------------------------
export function drawMinimap(gameHour) {
  const canvas = el.minimap;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const sx = W / WORLD_W, sy = H / WORLD_H;
  ctx.fillStyle = '#2c5d8a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#3f7d3a';
  ctx.fillRect(0, 0, BEACH_X * sx, H);
  ctx.fillStyle = '#ecd28a';
  ctx.fillRect(BEACH_X * sx, 0, (WATER_X - BEACH_X) * sx, H);
  ctx.strokeStyle = 'rgba(230,230,230,.5)';
  ctx.lineWidth = 2;
  for (const rx of world.vRoads) { ctx.beginPath(); ctx.moveTo((rx + 42) * sx, 0); ctx.lineTo((rx + 42) * sx, H); ctx.stroke(); }
  for (const ry of world.hRoads) { ctx.beginPath(); ctx.moveTo(0, (ry + 42) * sy); ctx.lineTo(BEACH_X * sx, (ry + 42) * sy); ctx.stroke(); }
  // Shops: gun = orange, spray = cyan, food = green.
  for (const shop of world.shops) {
    ctx.fillStyle = shop.kind === 'gun' ? '#ff9f43' : shop.kind === 'spray' ? '#48dbfb' : '#7ee787';
    ctx.fillRect((shop.x + shop.w / 2) * sx - 2, (shop.y + shop.h / 2) * sy - 2, 4, 4);
  }
  // Traffic as faint dots, police as flashing blue.
  for (const car of cars) {
    if (car.isPolice) {
      ctx.fillStyle = Math.floor(performance.now() / 300) % 2 ? '#3b82f6' : '#ef4444';
      ctx.fillRect(car.x * sx - 2.5, car.y * sy - 2.5, 5, 5);
    } else if (car.missionCar) {
      ctx.fillStyle = '#ff5e3a';
      ctx.fillRect(car.x * sx - 2.5, car.y * sy - 2.5, 5, 5);
    }
  }
  if (police.heli) {
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(police.heli.x * sx - 2, police.heli.y * sy - 2, 4, 4);
  }
  // Mission marker: a pulsing yellow diamond.
  if (currentMarker) {
    const p = 3 + Math.sin(performance.now() / 220) * 1.2;
    ctx.fillStyle = '#ffd33d';
    ctx.save();
    ctx.translate(currentMarker.x * sx, currentMarker.y * sy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-p, -p, p * 2, p * 2);
    ctx.restore();
  }
  // The player: a white arrow in facing direction.
  const px = (player.car ? player.car.x : player.x) * sx;
  const py = (player.car ? player.car.y : player.y) * sy;
  const ang = player.car ? player.car.angle : player.angle;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(ang);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-4, -3.6); ctx.lineTo(-4, 3.6);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  void gameHour;
}
