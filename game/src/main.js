// main.js — Sunset Bay's conductor: owns the game state (start / playing /
// paused / busted-wasted), the frame loop, traffic flow, collisions and crime
// bookkeeping, shops, radio, saving, and the debug hooks the screenshots and
// smoke tests drive through window.SB.

import {
  SAVE_KEY, START_HOUR, DAY_SECONDS, RESPAWN_FEE,
  HEAT_HIT_CAR, HEAT_HIT_PED, HEAT_KILL_PED,
} from './config.js';
import { clamp, dist } from './rng.js';
import { initInput, key, moveVector, onPress } from './input.js';
import { buildWorld, world } from './world.js';
import {
  cars, makeCar, removeCar, spawnParkedCars, spawnTrafficCar,
  stepTraffic, drivePlayerCar, collideCarWorld, collideCarPair,
} from './vehicles.js';
import { peds, spawnPeds, stepPeds, knockDown, scarePeds, Ped } from './peds.js';
import { police, addHeat, clearHeat, stepPolice } from './police.js';
import {
  player, resetPlayer, hurtPlayer, stepPlayerOnFoot, tryEnterExitCar,
  stepShooting, swapWeapon, startReload, WEAPONS,
} from './player.js';
import { findShopFor, catalogFor, buyItem } from './shops.js';
import {
  initMissions, missionState, MISSION_DEFS, offerAtPayphone, startMission,
  updateMissions, missionEvent, failActiveMission,
} from './missions.js';
import {
  initHud, toast, setObjective, clearObjective, updateHud, drawMinimap,
  showShop, hideShop, flashDamage, getMarker,
} from './hud.js';
import { camera, updateCamera, drawWorld, fx } from './render.js';
import {
  ensureAudio, toggleMute, sfx, engineStart, engineSet, engineStop,
  radioStart, radioStop, STATIONS,
} from './audio.js';
import { shotName, applyShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const state = {
  mode: 'start',           // start | playing | paused | over
  hour: START_HOUR,
  radio: -1,
  shop: null,              // {shop, items, sel}
  trafficTimer: 0,
  autosaveTimer: 0,
  hintSet: false,
};

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- save / load
function saveGame() {
  const data = {
    money: player.money,
    missionsDone: player.missionsDone,
    weapons: player.weapons,
    weapon: player.weapon,
    armor: player.armor,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- game context
const gameCtx = {
  toast,
  cash(n) { player.money += n; },
  setObjective,
  clearObjective,
  save: saveGame,
};
initMissions(gameCtx);

function spawnPedAt(x, y) {
  const ped = new Ped(x, y);
  ped.state = 'flee';
  ped.fleeFrom = { x: player.x, y: player.y };
  ped.fleeTimer = 3;
  peds.push(ped);
  return ped;
}

// ---------------------------------------------------------------- run control
function beginGame(save) {
  ensureAudio();
  resetPlayer(save);
  missionState.index = player.missionsDone;
  missionState.active = null;
  state.mode = 'playing';
  document.getElementById('startScreen').style.display = 'none';
  if (save) toast(`Welcome back. ${player.missionsDone}/15 jobs done, $${player.money} in pocket.`);
  else toast('Rosa\'s payphone is up the street — the yellow marker. Go make money.');
}

function endRun(kind) {
  state.mode = 'over';
  exitCarAudio();
  const endScreen = document.getElementById('endScreen');
  const title = document.getElementById('endTitle');
  const text = document.getElementById('endText');
  const fee = Math.min(player.money, kind === 'busted' ? 200 : RESPAWN_FEE);
  player.money -= fee;
  title.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  title.style.color = kind === 'busted' ? '#79c0ff' : '#e5534b';
  text.textContent = kind === 'busted'
    ? `The Sunset Bay PD take $${fee} and your dignity. You wake at the hospital.`
    : `The bay spits you out at the hospital. Bill: $${fee}.`;
  endScreen.style.display = 'flex';
  if (kind === 'busted') sfx.busted(); else sfx.wasted();
  failActiveMission(kind === 'busted' ? 'You got busted.' : 'You got wasted.');
  setTimeout(() => {
    endScreen.style.display = 'none';
    respawn();
  }, 2500);
}

function respawn() {
  if (player.car) {
    player.car.mode = 'parked';
    player.car.driver = null;
    player.car = null;
  }
  player.x = world.hospital.x;
  player.y = world.hospital.y;
  player.health = 100;
  player.armor = 0;
  player.dead = false;
  clearHeat();
  for (const cop of cars.filter((c) => c.isPolice)) removeCar(cop);
  police.heli = null;
  state.mode = 'playing';
  saveGame();
}

// ---------------------------------------------------------------- audio hooks
function enterCarAudio() {
  engineStart();
  if (state.radio < 0) state.radio = 0;
  radioStart(state.radio);
  document.getElementById('radioBox').style.display = 'block';
  document.getElementById('radioName').textContent = STATIONS[state.radio].name;
}
function exitCarAudio() {
  engineStop();
  radioStop();
  document.getElementById('radioBox').style.display = 'none';
}
function cycleRadio() {
  state.radio++;
  if (state.radio >= STATIONS.length) {
    state.radio = -1;
    radioStop();
    document.getElementById('radioBox').style.display = 'none';
    return;
  }
  radioStart(state.radio);
  document.getElementById('radioBox').style.display = 'block';
  document.getElementById('radioName').textContent = STATIONS[state.radio].name;
}

// ---------------------------------------------------------------- collisions
function handleCollisions(dt) {
  // Car vs world and car vs car, with crime and mission bookkeeping.
  for (const car of cars) {
    if (car.hitCooldown > 0) car.hitCooldown -= dt;
    if (car.mode === 'wreck') continue;
    const moving = Math.abs(car.speed) > 12 || car.mode === 'traffic' || car.mode === 'police';
    if (!moving) continue;
    const impact = collideCarWorld(car);
    if (impact > 0) {
      sfx.crash(Math.min(1, impact / 320));
      fx.hitSpark(car.x, car.y);
      if (car === player.car) {
        flashDamage();
        hurtPlayer((impact - 150) * 0.012);
      }
    }
  }
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (a.mode === 'wreck' || b.mode === 'wreck') continue;
      const impact = collideCarPair(a, b);
      if (impact > 0) {
        sfx.crash(Math.min(1, impact / 300));
        fx.hitSpark((a.x + b.x) / 2, (a.y + b.y) / 2);
        const playerInvolved = a === player.car || b === player.car;
        const other = a === player.car ? b : a;
        if (playerInvolved) {
          flashDamage();
          hurtPlayer((impact - 130) * 0.01);
          missionEvent('hitCar');
          // Trading paint with the public brings heat; being rammed by the
          // police does not — that is their job, not a new crime of yours.
          if (!other.isPolice && other.hitCooldown <= 0) {
            addHeat(HEAT_HIT_CAR);
            other.hitCooldown = 1.6;
          }
        }
      }
    }
  }
  // Cars vs people.
  for (const car of cars) {
    if (car.mode === 'wreck' || Math.abs(car.speed) < 55) continue;
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      if (dist(car.x, car.y, ped.x, ped.y) < car.radius + 8) {
        if (knockDown(ped, 8)) {
          sfx.crash(0.4);
          fx.ring(ped.x, ped.y);
          scarePeds(ped.x, ped.y, 200);
          if (car === player.car) {
            addHeat(HEAT_HIT_PED + (Math.abs(car.speed) > 200 ? HEAT_KILL_PED * 0.5 : 0));
            missionEvent('pedDown');
            flashDamage();
          }
          car.speed *= 0.82;
        }
      }
    }
  }
  // Wrecks: a car at zero health dies, and throws the player out.
  for (const car of [...cars]) {
    if (car.health <= 0 && car.mode !== 'wreck') {
      car.mode = 'wreck';
      car.speed = 0;
      fx.puff(car.x, car.y, true);
      missionEvent('wreck');
      if (car === player.car) {
        player.car = null;
        car.driver = null;
        player.x = car.x + 34;
        player.y = car.y + 10;
        hurtPlayer(18);
        exitCarAudio();
        toast('Your ride is wrecked!');
      }
      if (car.driver === 'traffic') car.driver = null;
    }
  }
}

// ---------------------------------------------------------------- the frame
let lastTime = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  if (state.mode === 'paused' || state.mode === 'start') dt = 0;

  if (state.mode === 'playing' && !state.shop) {
    state.hour = (state.hour + dt * 24 / DAY_SECONDS) % 24;

    // Traffic flow: keep the city breathing.
    state.trafficTimer -= dt;
    const trafficCount = cars.filter((c) => c.mode === 'traffic').length;
    if (trafficCount < 13 && state.trafficTimer <= 0) {
      spawnTrafficCar(player.x, player.y);
      state.trafficTimer = 0.7;
    }
    const events = {};
    for (const car of [...cars]) {
      if (car.mode === 'traffic' && car.driver === 'traffic') stepTraffic(car, dt, events);
    }

    // The player.
    if (player.car) {
      const ctl = {
        throttle: (key('KeyW') || key('ArrowUp') ? 1 : 0) - (key('KeyS') || key('ArrowDown') ? 1 : 0),
        steer: (key('KeyD') || key('ArrowRight') ? 1 : 0) - (key('KeyA') || key('ArrowLeft') ? 1 : 0),
        handbrake: key('Space'),
      };
      const ratio = drivePlayerCar(player.car, dt, ctl);
      engineSet(ratio);
      player.x = player.car.x;
      player.y = player.car.y;
      player.angle = player.car.angle;
      if (Math.abs(player.car.speed) > 250) scarePeds(player.x, player.y, 110);
    } else {
      stepPlayerOnFoot(dt, moveVector(), camera);
      stepShooting(dt, {
        tracer: (a, b, c, d) => fx.tracer(a, b, c, d),
        hitSpark: (x, y) => fx.hitSpark(x, y),
        onPedDown: () => { addHeat(HEAT_KILL_PED); missionEvent('pedDown'); },
        onCarHit: (car) => { if (car.hitCooldown <= 0) { addHeat(10); car.hitCooldown = 1; } },
        onCrateHit: () => { /* missions count the crates themselves */ },
      });
    }

    handleCollisions(dt);
    stepPeds(dt);

    // Police and consequences.
    const pEvents = stepPolice(dt, {
      px: player.x, py: player.y,
      playerSpeed: player.car ? player.car.speed : 0,
      onFoot: !player.car,
    });
    if (pEvents.busted) { endRun('busted'); }
    if (player.dead) { endRun('wasted'); }

    updateMissions(dt);

    // Payphone hint.
    const offer = offerAtPayphone();
    const nearPhone = dist(player.x, player.y, world.missionSpot.x, world.missionSpot.y) < 78;
    if (offer && nearPhone && !player.car) {
      setObjective('📞 ROSA\'S PAYPHONE', `${offer.title} — press E · ${offer.brief}`, world.missionSpot);
      state.hintSet = true;
    } else if (state.hintSet && !missionState.active) {
      clearObjective();
      state.hintSet = false;
    }

    state.autosaveTimer -= dt;
    if (state.autosaveTimer <= 0) { saveGame(); state.autosaveTimer = 25; }
  }

  fx.step(dt);
  const focus = player.car || player;
  const lookX = focus.x + (player.car ? Math.cos(player.car.angle) * clamp(player.car.speed * 0.22, -70, 70) : 0);
  const lookY = focus.y + (player.car ? Math.sin(player.car.angle) * clamp(player.car.speed * 0.22, -70, 70) : 0);
  updateCamera(lookX, lookY, canvas.width, canvas.height);
  drawWorld(ctx, {
    hour: state.hour,
    marker: getMarker(),
    offerSpot: !missionState.active && offerAtPayphone() ? world.missionSpot : null,
  });
  if (state.mode !== 'start') {
    updateHud(state.hour);
    drawMinimap(state.hour);
  }
}

// ---------------------------------------------------------------- keys
function tryInteract() {
  if (state.mode !== 'playing') return;
  // Payphone first: it is the campaign's spine.
  const offer = offerAtPayphone();
  if (offer && !player.car && dist(player.x, player.y, world.missionSpot.x, world.missionSpot.y) < 78) {
    startMission(offer);
    state.hintSet = false;
    return;
  }
  const shop = findShopFor(player);
  if (shop) {
    state.shop = { shop, items: catalogFor(shop), sel: 0 };
    showShop(shop, state.shop.items, 0);
  }
}

onPress('KeyF', () => {
  if (state.mode !== 'playing' || state.shop) return;
  const wasInCar = !!player.car;
  const result = tryEnterExitCar({ spawnPedAt });
  if (result && result.entered) {
    enterCarAudio();
    if (result.jacked) toast('Jacked! The bay provides.');
  } else if (result && result.exited) {
    exitCarAudio();
  } else if (!wasInCar) {
    // No car in reach: nothing to do.
  }
});
onPress('KeyE', tryInteract);
onPress('KeyQ', () => { if (state.mode === 'playing' && !player.car) swapWeapon(); });
onPress('KeyR', () => {
  if (state.mode !== 'playing') return;
  if (player.car) cycleRadio();
  else startReload();
});
onPress('Digit1', () => { if (!player.car) player.weapon = 'fists'; });
onPress('Digit2', () => { if (!player.car && player.weapons.pistol.owned) player.weapon = 'pistol'; });
onPress('Digit3', () => { if (!player.car && player.weapons.smg.owned) player.weapon = 'smg'; });
onPress('KeyM', () => { ensureAudio(); toast(toggleMute() ? 'Sound off.' : 'Sound on.'); });
onPress('KeyP', togglePause);
onPress('Escape', () => {
  if (state.shop) { closeShop(); return; }
  togglePause();
});
onPress('ArrowUp', () => shopMove(-1));
onPress('ArrowDown', () => shopMove(1));
onPress('KeyW', () => shopMove(-1));
onPress('KeyS', () => shopMove(1));
onPress('Enter', () => {
  if (state.shop) {
    const item = state.shop.items[state.shop.sel];
    if (item) toast(buyItem(item));
    state.shop.items = catalogFor(state.shop.shop);
    showShop(state.shop.shop, state.shop.items, Math.min(state.shop.sel, state.shop.items.length - 1));
    saveGame();
  }
});

function shopMove(d) {
  if (!state.shop || state.shop.items.length === 0) return;
  state.shop.sel = (state.shop.sel + d + state.shop.items.length) % state.shop.items.length;
  showShop(state.shop.shop, state.shop.items, state.shop.sel);
}
function closeShop() {
  state.shop = null;
  hideShop();
}
function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
    document.getElementById('pauseStats').textContent =
      `Jobs done: ${player.missionsDone}/15 · Cash: $${player.money} · Wanted: ${police.stars}★`;
    document.getElementById('pauseScreen').style.display = 'flex';
  } else if (state.mode === 'paused') {
    state.mode = 'playing';
    document.getElementById('pauseScreen').style.display = 'none';
  }
}

document.getElementById('newGameBtn').addEventListener('click', () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  beginGame(null);
});
document.getElementById('continueBtn').addEventListener('click', () => beginGame(loadSave()));
document.getElementById('resumeBtn').addEventListener('click', togglePause);

// ---------------------------------------------------------------- boot
buildWorld();
spawnParkedCars();
spawnPeds(42);
initHud();
initInput(canvas);
if (!loadSave()) document.getElementById('continueBtn').style.opacity = '0.45';

const shot = shotName();
if (shot) {
  beginGame(null);
  applyShot(shot, {
    player,
    cars,
    makeCar,
    setHour: (h) => { state.hour = h; },
    enterCar(car) {
      car.mode = 'player'; car.driver = 'player'; car.road = null;
      player.car = car; player.x = car.x; player.y = car.y;
    },
    startMissionAt(i) {
      missionState.index = i;
      startMission(MISSION_DEFS[i]);
    },
  });
}

// Debug hooks: the screenshots and the smoke test drive the game through here.
window.SB = {
  state, player, cars, peds, police, missionState, world,
  teleport(x, y) { player.x = x; player.y = y; if (player.car) { player.car.x = x; player.car.y = y; } },
  setWanted(stars) { police.heat = stars * 100 + 10; },
  setHour(h) { state.hour = h; },
  giveGun() {
    player.weapons.pistol.owned = true;
    player.weapons.pistol.mag = 12;
    player.weapons.pistol.reserve = 96;
    player.weapon = 'pistol';
  },
  startMissionAt(i) { missionState.index = i; startMission(MISSION_DEFS[i]); },
  begin: beginGame,
};

requestAnimationFrame(frame);
