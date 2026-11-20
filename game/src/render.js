// render.js — draws the whole world each frame: the bay and the beach, roads
// and sidewalks, rooftops with their shadows, palms, cars with liveries and
// light bars, people, the helicopter and its searchlight, and over everything
// the day–night cycle with streetlights and headlights after dark. Also owns
// the little particle effects: tracers, sparks, smoke and skid marks.

import {
  WORLD_W, WORLD_H, BEACH_X, WATER_X, ROAD_W, COLORS,
} from './config.js';
import { clamp } from './rng.js';
import { world } from './world.js';
import { cars } from './vehicles.js';
import { peds } from './peds.js';
import { player } from './player.js';
import { police } from './police.js';

export const camera = { x: 0, y: 0, w: 960, h: 720 };

export function updateCamera(tx, ty, viewW, viewH) {
  camera.w = viewW; camera.h = viewH;
  camera.x = clamp(tx - viewW / 2, 0, Math.max(0, WORLD_W - viewW));
  camera.y = clamp(ty - viewH / 2, 0, Math.max(0, WORLD_H - viewH));
}

/** 0 at noon, 1 at deep night: the darkness the whole scene is graded by. */
export function darknessAt(hour) {
  if (hour >= 6 && hour <= 17) return 0;
  if (hour > 17 && hour < 19.5) return (hour - 17) / 2.5 * 0.82;
  if (hour >= 19.5 || hour <= 4.5) return 0.82;
  return (1 - (hour - 4.5) / 1.5) * 0.82;
}
/** Warm wash in the golden hour before the dark. */
function sunsetAt(hour) {
  if (hour > 16.5 && hour < 19.5) return Math.sin((hour - 16.5) / 3 * Math.PI) * 0.16;
  return 0;
}

// ---- effects -----------------------------------------------------------------
export const fx = {
  tracers: [], sparks: [], smoke: [], rings: [],
  tracer(x1, y1, x2, y2) { this.tracers.push({ x1, y1, x2, y2, life: 0.07 }); },
  hitSpark(x, y) { for (let i = 0; i < 5; i++) this.sparks.push({ x, y, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260, life: 0.3 }); },
  puff(x, y, big = false) { this.smoke.push({ x, y, r: big ? 16 : 8, life: big ? 1.4 : 0.8, dark: true }); },
  ring(x, y) { this.rings.push({ x, y, r: 8, life: 0.5 }); },
  step(dt) {
    for (const list of [this.tracers, this.sparks, this.smoke, this.rings]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) { list.splice(i, 1); continue; }
        if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; }
        if (p.r !== undefined && list === this.smoke) p.r += dt * 14;
        if (p.r !== undefined && list === this.rings) p.r += dt * 130;
      }
    }
  },
};

function inView(x, y, m = 90) {
  return x > camera.x - m && x < camera.x + camera.w + m && y > camera.y - m && y < camera.y + camera.h + m;
}

function drawGround(ctx) {
  // Water everywhere first, then the landmass, then the sand.
  ctx.fillStyle = COLORS.waterDeep;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  const grd = ctx.createLinearGradient(WATER_X, 0, WORLD_W, 0);
  grd.addColorStop(0, COLORS.water);
  grd.addColorStop(1, COLORS.waterDeep);
  ctx.fillStyle = grd;
  ctx.fillRect(WATER_X, 0, WORLD_W - WATER_X, WORLD_H);
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, BEACH_X, WORLD_H);
  // Mown stripes on the grass.
  ctx.fillStyle = COLORS.grassDark;
  for (let x = 0; x < BEACH_X; x += 240) ctx.fillRect(x, 0, 120, WORLD_H);
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(BEACH_X, 0, WATER_X - BEACH_X, WORLD_H);
  // Wet sand sheen at the waterline.
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.fillRect(WATER_X - 12, 0, 10, WORLD_H);
}

function drawRoads(ctx) {
  ctx.fillStyle = COLORS.sidewalk;
  for (const rx of world.vRoads) ctx.fillRect(rx - 9, 0, ROAD_W + 18, WORLD_H);
  for (const ry of world.hRoads) ctx.fillRect(0, ry - 9, BEACH_X + 40, ROAD_W + 18);
  ctx.fillStyle = COLORS.road;
  for (const rx of world.vRoads) ctx.fillRect(rx, 0, ROAD_W, WORLD_H);
  for (const ry of world.hRoads) ctx.fillRect(0, ry, BEACH_X + 40, ROAD_W);
  ctx.strokeStyle = COLORS.roadLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  for (const rx of world.vRoads) {
    ctx.beginPath(); ctx.moveTo(rx + ROAD_W / 2, 0); ctx.lineTo(rx + ROAD_W / 2, WORLD_H); ctx.stroke();
  }
  for (const ry of world.hRoads) {
    ctx.beginPath(); ctx.moveTo(0, ry + ROAD_W / 2); ctx.lineTo(BEACH_X + 40, ry + ROAD_W / 2); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Parking lots.
  for (const lot of world.lots) {
    ctx.fillStyle = '#3c4046';
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 2;
    for (let x = lot.x + 26; x < lot.x + lot.w - 10; x += 52) {
      ctx.strokeRect(x, lot.y + 14, 40, lot.h - 28);
    }
  }
  // Spray bay pad.
  for (const shop of world.shops) {
    if (shop.bay) {
      ctx.fillStyle = '#46525e';
      ctx.fillRect(shop.bay.x, shop.bay.y, shop.bay.w, shop.bay.h);
      ctx.strokeStyle = '#48dbfb';
      ctx.lineWidth = 3;
      ctx.strokeRect(shop.bay.x, shop.bay.y, shop.bay.w, shop.bay.h);
    }
  }
}

function drawBuildings(ctx, dark) {
  for (const b of world.buildings) {
    if (!inView(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
    // Shadow, then a darker wall lip for height, then the roof.
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.fillRect(b.x + 9, b.y + 11, b.w, b.h);
    ctx.fillStyle = '#5d4632';
    ctx.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // Rooftop clutter: AC units and a parapet line.
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.fillRect(b.x + b.w * 0.2, b.y + b.h * 0.2, 16, 12);
    ctx.fillRect(b.x + b.w * 0.62, b.y + b.h * 0.58, 13, 10);
    if (dark > 0.25) {
      // Lit windows: a warm grid whose density follows the floors.
      ctx.fillStyle = `rgba(255,196,86,${0.35 + dark * 0.5})`;
      const step = 17;
      for (let x = b.x + 9; x < b.x + b.w - 8; x += step) {
        for (let y = b.y + 9; y < b.y + b.h - 8; y += step) {
          if (((x * 7 + y * 13) % 10) < b.floors) ctx.fillRect(x, y, 6, 4);
        }
      }
    }
  }
  // Shop signs.
  for (const shop of world.shops) {
    ctx.fillStyle = shop.kind === 'gun' ? '#ff9f43' : shop.kind === 'spray' ? '#48dbfb' : '#7ee787';
    ctx.fillRect(shop.x, shop.y + shop.h - 4, shop.w, 12);
    ctx.fillStyle = '#10131a';
    ctx.font = 'bold 11px Verdana';
    ctx.textAlign = 'center';
    ctx.fillText(shop.label, shop.x + shop.w / 2, shop.y + shop.h + 5);
  }
}

function drawPalms(ctx) {
  for (const p of world.palms) {
    if (!inView(p.x, p.y, 60)) continue;
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.beginPath(); ctx.ellipse(p.x + 6, p.y + 7, 13 * p.s, 6 * p.s, 0.6, 0, 7); ctx.fill();
    ctx.strokeStyle = COLORS.trunk;
    ctx.lineWidth = 4 * p.s;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + 4, p.y - 8, p.x + 7, p.y - 13 * p.s); ctx.stroke();
    ctx.strokeStyle = COLORS.palm;
    ctx.lineWidth = 3 * p.s;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + p.x * 0.01;
      ctx.beginPath();
      ctx.moveTo(p.x + 7, p.y - 13 * p.s);
      ctx.quadraticCurveTo(
        p.x + 7 + Math.cos(a) * 13 * p.s, p.y - 13 * p.s + Math.sin(a) * 6 * p.s - 3,
        p.x + 7 + Math.cos(a) * 21 * p.s, p.y - 13 * p.s + Math.sin(a) * 10 * p.s + 5,
      );
      ctx.stroke();
    }
  }
}

function drawCrates(ctx) {
  for (const c of world.crates) {
    if (!c.alive || !inView(c.x, c.y, 40)) continue;
    ctx.fillStyle = '#a8763e';
    ctx.fillRect(c.x - 14, c.y - 14, 28, 28);
    ctx.strokeStyle = '#6e4a22';
    ctx.lineWidth = 3;
    ctx.strokeRect(c.x - 14, c.y - 14, 28, 28);
    ctx.beginPath();
    ctx.moveTo(c.x - 14, c.y - 14); ctx.lineTo(c.x + 14, c.y + 14);
    ctx.moveTo(c.x + 14, c.y - 14); ctx.lineTo(c.x - 14, c.y + 14);
    ctx.stroke();
  }
}

export function drawCar(ctx, car, dark) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const w = car.w, h = car.h;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.fillRect(-w / 2 + 4, -h / 2 + 5, w, h);
  // Body.
  ctx.fillStyle = car.mode === 'wreck' ? '#2c2c30' : car.color;
  roundRect(ctx, -w / 2, -h / 2, w, h, 6);
  ctx.fill();
  if (car.isPolice) {
    ctx.fillStyle = '#14181f';
    ctx.fillRect(-w * 0.18, -h / 2, w * 0.36, h);   // black centre band
    ctx.fillStyle = '#e8ecf2';
    ctx.fillRect(-w / 2, -h / 2, w * 0.2, h);
    ctx.fillRect(w * 0.3, -h / 2, w * 0.2, h);
  }
  // Cabin and glass.
  ctx.fillStyle = 'rgba(16,24,38,.9)';
  roundRect(ctx, -w * 0.16, -h * 0.36, w * 0.34, h * 0.72, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,180,230,.5)';
  ctx.fillRect(w * 0.13, -h * 0.32, 4, h * 0.64);
  // Wheels.
  ctx.fillStyle = '#101114';
  const ww = 9, wh = 5;
  ctx.fillRect(-w / 2 + 4, -h / 2 - 2, ww, wh);
  ctx.fillRect(-w / 2 + 4, h / 2 - 3, ww, wh);
  ctx.fillRect(w / 2 - ww - 4, -h / 2 - 2, ww, wh);
  ctx.fillRect(w / 2 - ww - 4, h / 2 - 3, ww, wh);
  // Taxi sign.
  if (car.model.name === 'Taxi') {
    ctx.fillStyle = '#221a00';
    ctx.fillRect(-6, -4, 12, 8);
    ctx.fillStyle = '#ffd33d';
    ctx.font = 'bold 6px Verdana'; ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 2);
  }
  // Police light bar: red/blue strobe.
  if (car.isPolice && car.mode === 'police') {
    const phase = Math.floor(performance.now() / 160) % 2;
    ctx.fillStyle = phase ? '#ef4444' : '#3b82f6';
    ctx.fillRect(-7, -h / 2 + 2, 6, h - 4);
    ctx.fillStyle = phase ? '#3b82f6' : '#ef4444';
    ctx.fillRect(1, -h / 2 + 2, 6, h - 4);
  }
  // Headlights after dark.
  if (dark > 0.2 && car.mode !== 'wreck') {
    ctx.fillStyle = 'rgba(255,240,180,.9)';
    ctx.fillRect(w / 2 - 2, -h / 2 + 3, 3, 4);
    ctx.fillRect(w / 2 - 2, h / 2 - 7, 3, 4);
    ctx.fillStyle = 'rgba(255,60,60,.85)';
    ctx.fillRect(-w / 2 - 1, -h / 2 + 3, 3, 4);
    ctx.fillRect(-w / 2 - 1, h / 2 - 7, 3, 4);
  }
  ctx.restore();
  // Damage smoke.
  if (car.health < 45 && car.mode !== 'wreck' && Math.random() < 0.3) {
    fx.puff(car.x + Math.cos(car.angle) * w * 0.4, car.y + Math.sin(car.angle) * w * 0.4);
  }
  if (car.mode === 'wreck' && Math.random() < 0.12) fx.puff(car.x, car.y, true);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.shirt;
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(15, 0, 5, 0, 7); ctx.fill();
  } else {
    const bob = Math.sin(ped.walkPhase * 6) * 1.6;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(1, 3, 8, 4, 0, 0, 7); ctx.fill();
    ctx.rotate(ped.angle);
    ctx.fillStyle = '#2b3444';
    ctx.fillRect(-4 + bob * 0.4, -6, 6, 4);
    ctx.fillRect(-4 - bob * 0.4, 2, 6, 4);
    ctx.fillStyle = ped.shirt;
    ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, 7); ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(2.5, 0, 4.6, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function drawPlayer(ctx) {
  if (player.car) return;
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(1, 4, 9, 4.5, 0, 0, 7); ctx.fill();
  ctx.rotate(player.angle);
  ctx.fillStyle = '#20242e';
  ctx.fillRect(-4, -7, 7, 5);
  ctx.fillRect(-4, 2, 7, 5);
  ctx.fillStyle = '#ffd33d';                     // the yellow jacket: the bay knows him
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
  ctx.fillStyle = '#f2c79b';
  ctx.beginPath(); ctx.arc(3, 0, 5.2, 0, 7); ctx.fill();
  if (player.weapon !== 'fists') {
    ctx.strokeStyle = '#14161c';
    ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(6, 3); ctx.lineTo(player.weapon === 'smg' ? 24 : 19, 3); ctx.stroke();
  }
  ctx.restore();
}

function drawMarker(ctx, marker, hour) {
  if (!marker) return;
  const bob = Math.sin(performance.now() / 300) * 8;
  const grd = ctx.createLinearGradient(0, marker.y - 190, 0, marker.y);
  grd.addColorStop(0, 'rgba(255,211,61,0)');
  grd.addColorStop(1, 'rgba(255,211,61,.4)');
  ctx.fillStyle = grd;
  ctx.fillRect(marker.x - 13, marker.y - 190, 26, 190);
  ctx.fillStyle = '#ffd33d';
  ctx.save();
  ctx.translate(marker.x, marker.y - 42 + bob);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-11, -11, 22, 22);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,211,61,.8)';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(marker.x, marker.y, 30 + Math.sin(performance.now() / 260) * 5, 0, 7); ctx.stroke();
  void hour;
}

function drawHeli(ctx, dark) {
  const heli = police.heli;
  if (!heli) return;
  // Searchlight first (under the body), a pool of light on the street.
  if (dark > 0.1) {
    const grd = ctx.createRadialGradient(heli.lightX, heli.lightY, 8, heli.lightX, heli.lightY, 95);
    grd.addColorStop(0, `rgba(255,246,190,${0.5 * dark + 0.18})`);
    grd.addColorStop(1, 'rgba(255,246,190,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(heli.lightX, heli.lightY, 95, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,246,190,.25)';
    ctx.beginPath(); ctx.moveTo(heli.x, heli.y); ctx.lineTo(heli.lightX, heli.lightY); ctx.stroke();
  }
  ctx.save();
  ctx.translate(heli.x, heli.y);
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(26, 34, 30, 10, 0.3, 0, 7); ctx.fill();
  ctx.rotate(Math.sin(heli.angle) * 0.14);
  ctx.fillStyle = '#1d2735';
  ctx.beginPath(); ctx.ellipse(0, 0, 27, 13, 0, 0, 7); ctx.fill();
  ctx.fillRect(-44, -3.4, 24, 6.8);
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(-6, -13, 15, 26);
  ctx.fillStyle = 'rgba(150,210,255,.85)';
  ctx.beginPath(); ctx.ellipse(9, 0, 8, 7, 0, 0, 7); ctx.fill();
  // Rotor blur.
  ctx.strokeStyle = 'rgba(220,230,240,.5)';
  ctx.lineWidth = 3;
  const sweep = (performance.now() / 22) % (Math.PI * 2);
  ctx.beginPath();
  ctx.moveTo(Math.cos(sweep) * -40, Math.sin(sweep) * -6);
  ctx.lineTo(Math.cos(sweep) * 40, Math.sin(sweep) * 6);
  ctx.stroke();
  ctx.restore();
}

function drawEffects(ctx) {
  for (const t of fx.tracers) {
    ctx.strokeStyle = 'rgba(255,230,130,.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
  }
  for (const s of fx.sparks) {
    ctx.fillStyle = 'rgba(255,180,60,.9)';
    ctx.fillRect(s.x - 1.6, s.y - 1.6, 3.2, 3.2);
  }
  for (const s of fx.smoke) {
    ctx.fillStyle = 'rgba(40,40,46,.34)';
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
  }
  for (const r of fx.rings) {
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7); ctx.stroke();
  }
}

function drawLights(ctx, dark) {
  if (dark <= 0.05) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Streetlight pools at intersections.
  ctx.fillStyle = `rgba(255,190,90,${0.10 * dark})`;
  for (const rx of world.vRoads) {
    for (const ry of world.hRoads) {
      const x = rx + 42, y = ry + 42;
      if (!inView(x, y, 130)) continue;
      ctx.beginPath(); ctx.arc(x, y, 56, 0, 7); ctx.fill();
    }
  }
  // Headlight beams — only from cars with someone at the wheel.
  for (const car of cars) {
    if (car.mode === 'wreck' || car.mode === 'parked' || !inView(car.x, car.y, 260)) continue;
    const fx2 = car.x + Math.cos(car.angle) * 120;
    const fy2 = car.y + Math.sin(car.angle) * 120;
    const grd = ctx.createRadialGradient(car.x, car.y, 6, fx2, fy2, 130);
    grd.addColorStop(0, `rgba(255,240,180,${0.16 * dark})`);
    grd.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(fx2, fy2, 120, 0, 7); ctx.fill();
  }
  ctx.restore();
}

/** The whole frame. state: {hour, marker, offerSpot} */
export function drawWorld(ctx, state) {
  const dark = darknessAt(state.hour);
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, camera.w, camera.h);
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  drawGround(ctx);
  drawRoads(ctx);
  drawBuildings(ctx, dark);
  drawPalms(ctx);
  drawCrates(ctx);
  drawMarker(ctx, state.offerSpot, state.hour);
  drawMarker(ctx, state.marker, state.hour);
  for (const ped of peds) if (inView(ped.x, ped.y, 40)) drawPed(ctx, ped);
  for (const car of cars) if (inView(car.x, car.y, 90)) drawCar(ctx, car, dark);
  drawPlayer(ctx);
  drawHeli(ctx, dark);
  drawEffects(ctx);
  // Night grading: a blue wash, then the lights punched back through.
  if (dark > 0.03) {
    ctx.fillStyle = `rgba(10,14,44,${dark * 0.55})`;
    ctx.fillRect(camera.x, camera.y, camera.w, camera.h);
    drawLights(ctx, dark);
    if (police.heli && dark > 0.1) drawHeli(ctx, dark);
  }
  const sunset = sunsetAt(state.hour);
  if (sunset > 0) {
    ctx.fillStyle = `rgba(255,110,60,${sunset})`;
    ctx.fillRect(camera.x, camera.y, camera.w, camera.h);
  }
  ctx.restore();
}
