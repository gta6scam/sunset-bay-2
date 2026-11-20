// world.js — generates Sunset Bay from a fixed seed: the road grid, city blocks
// with buildings, the beach, palms, shops and spawn points. Everything the other
// modules need to know about the city's shape is answered here.

import {
  WORLD_W, WORLD_H, BEACH_X, WATER_X, BLOCK, ROAD_W, PITCH, ROAD_OFF,
  COLS, ROWS, COLORS,
} from './config.js';
import { mulberry32 } from './rng.js';

export const world = {
  buildings: [],     // {x,y,w,h,color,floors} — also the collision solids
  palms: [],         // {x,y,s} decorative
  crates: [],        // {x,y,hp,alive} shootable props down by the beach lot
  shops: [],         // {kind,x,y,w,h,door:{x,y},label}
  lots: [],          // parking lots {x,y,w,h} where parked cars sit
  vRoads: [],        // x of each vertical road strip's west edge
  hRoads: [],        // y of each horizontal road strip's north edge
  playerStart: { x: 240, y: 300 },
  hospital: { x: 300, y: 2260 },
  missionSpot: { x: 300, y: 380 },   // the payphone where jobs are handed out
};

export function vLaneX(roadIndex, dir) {
  // dir -1 = northbound (east lane), +1 = southbound (west lane): right-hand traffic.
  const rx = world.vRoads[roadIndex];
  return rx + (dir < 0 ? ROAD_W * 0.74 : ROAD_W * 0.26);
}
export function hLaneY(roadIndex, dir) {
  // dir +1 = eastbound (south lane), -1 = westbound (north lane).
  const ry = world.hRoads[roadIndex];
  return ry + (dir > 0 ? ROAD_W * 0.74 : ROAD_W * 0.26);
}

export function onRoad(x, y) {
  for (const rx of world.vRoads) if (x >= rx - 6 && x <= rx + ROAD_W + 6) return true;
  for (const ry of world.hRoads) if (y >= ry - 6 && y <= ry + ROAD_W + 6) return true;
  return false;
}

export function randomRoadPoint(rng) {
  if (rng() < 0.5) {
    const i = Math.floor(rng() * world.vRoads.length);
    const dir = rng() < 0.5 ? -1 : 1;
    return { x: vLaneX(i, dir), y: 100 + rng() * (WORLD_H - 200), axis: 'v', index: i, dir };
  }
  const j = Math.floor(rng() * world.hRoads.length);
  const dir = rng() < 0.5 ? -1 : 1;
  return { x: 100 + rng() * (BEACH_X - 200), y: hLaneY(j, dir), axis: 'h', index: j, dir };
}

const SHOP_SPOTS = [
  { kind: 'gun', label: 'LOCK & LOAD — GUNS', col: 2, row: 1 },
  { kind: 'spray', label: 'SUNSET SPRAY — REPAIRS', col: 4, row: 3 },
  { kind: 'food', label: 'BURGER BAY — FOOD', col: 1, row: 4 },
  { kind: 'food', label: 'PALMS CAFE — FOOD', col: 5, row: 0 },
  { kind: 'gun', label: 'BAY ARMOURY — GUNS', col: 5, row: 5 },
];

export function buildWorld() {
  const rng = mulberry32(20261120);
  world.buildings.length = 0;
  world.palms.length = 0;
  world.crates.length = 0;
  world.shops.length = 0;
  world.lots.length = 0;
  world.vRoads = [];
  world.hRoads = [];

  for (let i = 0; i <= COLS; i++) world.vRoads.push(ROAD_OFF + i * PITCH);
  for (let j = 0; j <= ROWS; j++) world.hRoads.push(ROAD_OFF + j * PITCH);

  const shopAt = new Map(SHOP_SPOTS.map((s) => [`${s.col},${s.row}`, s]));

  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const bx = ROAD_OFF + col * PITCH + ROAD_W;
      const by = ROAD_OFF + row * PITCH + ROAD_W;
      const key = `${col},${row}`;
      const shop = shopAt.get(key);
      const roll = rng();

      if (shop) {
        // A low, wide shop building on the block's north edge, door on its south face.
        const w = 190, h = 92, x = bx + (BLOCK - w) / 2, y = by + 8;
        world.buildings.push({ x, y, w, h, color: '#7a4a3a', floors: 1, shop: shop.kind });
        world.shops.push({
          kind: shop.kind, label: shop.label,
          x, y, w, h,
          door: { x: x + w / 2, y: y + h + 26 },
          bay: shop.kind === 'spray' ? { x: x - 30, y: y + h + 8, w: w + 60, h: 74 } : null,
        });
        continue;
      }
      if (roll < 0.14) {
        // Park block: palms and grass, no buildings.
        for (let k = 0; k < 9; k++) {
          world.palms.push({ x: bx + 30 + rng() * (BLOCK - 60), y: by + 30 + rng() * (BLOCK - 60), s: 0.8 + rng() * 0.5 });
        }
        continue;
      }
      if (roll < 0.26) {
        // Parking lot block.
        world.lots.push({ x: bx + 10, y: by + 10, w: BLOCK - 20, h: BLOCK - 20 });
        continue;
      }
      // Buildings: split the block into a 2x2 of plots, most filled.
      const plot = BLOCK / 2;
      for (let px = 0; px < 2; px++) {
        for (let py = 0; py < 2; py++) {
          if (rng() < 0.18) continue;
          const m = 16 + rng() * 14;
          const w = plot - m * 2;
          const h = plot - m * 2;
          world.buildings.push({
            x: bx + px * plot + m,
            y: by + py * plot + m,
            w, h,
            color: COLORS.buildingRoof[Math.floor(rng() * COLORS.buildingRoof.length)],
            floors: 1 + Math.floor(rng() * 6),
          });
        }
      }
      // A palm or two on the sidewalk corners.
      if (rng() < 0.6) world.palms.push({ x: bx + 8, y: by + 8, s: 0.9 });
      if (rng() < 0.6) world.palms.push({ x: bx + BLOCK - 8, y: by + BLOCK - 8, s: 0.9 });
    }
  }

  // Beach palms along the sand and the shore road.
  for (let y = 120; y < WORLD_H - 80; y += 90 + rng() * 90) {
    world.palms.push({ x: BEACH_X + 40 + rng() * 120, y, s: 1 + rng() * 0.6 });
  }

  // Shooting-range crates stacked on the beach lot, south-east corner.
  for (let i = 0; i < 10; i++) {
    world.crates.push({
      x: 2960 + (i % 5) * 34,
      y: 2180 + Math.floor(i / 5) * 36,
      hp: 3, alive: true,
    });
  }

  return world;
}

/** All solid rectangles a body can collide with. */
export function solids() {
  return world.buildings;
}
