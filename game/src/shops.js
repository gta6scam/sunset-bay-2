// shops.js — the three ways to spend money in Sunset Bay: guns at Lock & Load,
// a respray that makes the police forget your car, and a burger that puts you
// back on your feet. Menus are data; main.js and hud.js handle the keys and ink.

import { SPRAY_COST, MEAL_COST } from './config.js';
import { dist } from './rng.js';
import { world } from './world.js';
import { player, WEAPONS, healPlayer } from './player.js';
import { clearHeat } from './police.js';
import { sfx } from './audio.js';

/** The shop the player can use right now, or null. Cars use the spray bay; feet use doors. */
export function findShopFor(p) {
  for (const shop of world.shops) {
    if (shop.kind === 'spray') {
      if (p.car && shop.bay &&
        p.car.x >= shop.bay.x && p.car.x <= shop.bay.x + shop.bay.w &&
        p.car.y >= shop.bay.y && p.car.y <= shop.bay.y + shop.bay.h) return shop;
    } else if (!p.car && dist(p.x, p.y, shop.door.x, shop.door.y) < 48) {
      return shop;
    }
  }
  return null;
}

export function catalogFor(shop) {
  if (shop.kind === 'gun') {
    const items = [];
    for (const key of ['pistol', 'smg']) {
      const w = WEAPONS[key];
      const slot = player.weapons[key];
      if (!slot.owned) {
        items.push({
          id: `buy-${key}`, label: w.name, price: w.price,
          can: () => player.money >= w.price,
          apply: () => {
            slot.owned = true; slot.mag = w.mag; slot.reserve = w.ammoPack;
            player.weapon = key;
          },
        });
      } else {
        items.push({
          id: `ammo-${key}`, label: `${w.name} AMMO ×${w.ammoPack}`, price: w.ammoPrice,
          can: () => player.money >= w.ammoPrice,
          apply: () => { slot.reserve += w.ammoPack; },
        });
      }
    }
    items.push({
      id: 'armor', label: 'BODY ARMOR', price: 300,
      can: () => player.money >= 300 && player.armor < 100,
      apply: () => { player.armor = 100; },
    });
    return items;
  }
  if (shop.kind === 'food') {
    return [{
      id: 'meal', label: 'BURGER BAY MEAL — FULL HEALTH', price: MEAL_COST,
      can: () => player.money >= MEAL_COST && player.health < 100,
      apply: () => healPlayer(100),
    }];
  }
  if (shop.kind === 'spray') {
    return [{
      id: 'spray', label: 'RESPRAY + REPAIR — LOSE THE HEAT', price: SPRAY_COST,
      can: () => player.money >= SPRAY_COST && !!player.car,
      apply: () => {
        if (player.car) player.car.health = 100;
        clearHeat();
      },
    }];
  }
  return [];
}

/** Try to buy; returns a HUD message either way. */
export function buyItem(item) {
  if (!item.can()) { sfx.denied(); return 'Not enough cash.'; }
  player.money -= item.price;
  item.apply();
  sfx.buy();
  return `Bought ${item.label}.`;
}
