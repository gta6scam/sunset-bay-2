// missions.js — the fifteen-job story campaign. Rosa at the Sunset Motel has
// work for anyone with a car and no questions: deliveries, races, thefts,
// rampages, escapes, and one long sunset run at the end. Missions chain: finish
// one and the payphone rings with the next. Progress is the save game's spine.

import { dist, rand } from './rng.js';
import { world } from './world.js';
import { cars, makeCar, removeCar } from './vehicles.js';
import { player } from './player.js';
import { police, addHeat, clearHeat } from './police.js';
import { sfx } from './audio.js';

export const SPOTS = {
  beach: { x: 3005, y: 1250 },
  beachLot: { x: 3010, y: 2200 },
  downtown: { x: 1450, y: 1260 },
  north: { x: 1440, y: 260 },
  south: { x: 520, y: 2280 },
  park: { x: 2210, y: 640 },
  motel: { x: 300, y: 380 },
};

let G = null;   // game context from main.js: {toast, cash, setObjective, clearObjective}
export function initMissions(gameCtx) { G = gameCtx; }

export const missionState = {
  active: null,       // live mission instance
  index: 0,           // next mission to offer (== player.missionsDone)
  offered: null,      // definition currently on offer at the payphone
};

function reach(x, y, r = 64) {
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;
  return dist(px, py, x, y) < r;
}
function playerPos() {
  return player.car ? { x: player.car.x, y: player.car.y } : { x: player.x, y: player.y };
}
function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

class Mission {
  constructor(def) {
    this.def = def;
    this.title = def.title;
    this.pay = def.pay;
    this.step = 0;
    this.timer = null;
    this.data = {};
  }
  objective(sub, marker) { G.setObjective(this.title, sub, marker); }
  fail(reason) { return { fail: reason }; }
  done() { return { done: true }; }
  tick(dt) {
    if (this.timer !== null) {
      this.timer -= dt;
      if (this.timer <= 0) return this.fail('Out of time.');
    }
    return null;
  }
  timeText() { return this.timer !== null ? ` · ${fmtTime(this.timer)}` : ''; }
}

// ---------------------------------------------------------------- the fifteen
export const MISSION_DEFS = [
  {
    title: '1 · FIRST WHEELS', pay: 150,
    brief: 'Rosa: "You walk everywhere? This is Sunset Bay. Get a car, then meet me at the beach."',
    create() {
      const m = new Mission(this);
      m.update = (dt) => {
        const t = m.tick(dt); if (t) return t;
        if (m.step === 0) {
          m.objective('Get in a car — press F beside one', null);
          if (player.car) { m.step = 1; sfx.checkpoint(); }
        } else {
          m.objective('Drive to the beach marker', SPOTS.beach);
          if (player.car && reach(SPOTS.beach.x, SPOTS.beach.y, 80)) return m.done();
        }
        return null;
      };
      return m;
    },
  },
  {
    title: '2 · BEACH RUN', pay: 200,
    brief: 'Rosa: "Three flags along the shore road. Hit them all before the clock eats you."',
    create() {
      const m = new Mission(this);
      m.data.flags = [{ x: 2980, y: 420 }, { x: 3005, y: 1250 }, { x: 2980, y: 2080 }];
      m.timer = 80;
      m.update = (dt) => {
        const t = m.tick(dt); if (t) return t;
        const flag = m.data.flags[m.step];
        m.objective(`Hit flag ${m.step + 1} of 3${m.timeText()}`, flag);
        if (reach(flag.x, flag.y, 78)) {
          m.step++; sfx.checkpoint();
          if (m.step >= 3) return m.done();
        }
        return null;
      };
      return m;
    },
  },
  {
    title: '3 · BURGER RUN', pay: 220,
    brief: 'Rosa: "Burger Bay on 5th. Pick up the order, take it downtown. Still warm, or no tip."',
    create() {
      const m = new Mission(this);
      const shop = world.shops.find((s) => s.kind === 'food');
      m.data.pickup = shop ? { x: shop.door.x, y: shop.door.y + 10 } : SPOTS.downtown;
      m.timer = 95;
      m.update = (dt) => {
        const t = m.tick(dt); if (t) return t;
        if (m.step === 0) {
          m.objective(`Pick up the order at Burger Bay${m.timeText()}`, m.data.pickup);
          if (reach(m.data.pickup.x, m.data.pickup.y, 62)) { m.step = 1; sfx.pickup(); }
        } else {
          m.objective(`Deliver it downtown, still warm${m.timeText()}`, SPOTS.downtown);
          if (reach(SPOTS.downtown.x, SPOTS.downtown.y, 78)) return m.done();
        }
        return null;
      };
      return m;
    },
  },
  {
    title: '4 · CHECKPOINT RUN', pay: 300,
    brief: 'Rosa: "The street kids marked a course. Five gates, ninety seconds, bragging rights."',
    create() {
      const m = new Mission(this);
      m.data.gates = [
        { x: 720, y: 260 }, { x: 1450, y: 880 }, { x: 2210, y: 260 },
        { x: 2620, y: 1260 }, { x: 1450, y: 1900 },
      ];
      m.timer = 95;
      m.update = (dt) => {
        const t = m.tick(dt); if (t) return t;
        const gate = m.data.gates[m.step];
        m.objective(`Gate ${m.step + 1} of 5${m.timeText()}`, gate);
        if (reach(gate.x, gate.y, 80)) {
          m.step++; sfx.checkpoint();
          if (m.step >= 5) return m.done();
        }
        return null;
      };
      return m;
    },
  },
  {
    title: '5 · HOT PROPERTY', pay: 400,
    brief: 'Rosa: "A sport coupe sits in the north lot with the keys in it. Bring it to Sunset Spray."',
    create() {
      const m = new Mission(this);
      const lot = world.lots[0] || { x: 700, y: 700 };
      const car = makeCar('car', lot.x + lot.w / 2, lot.y + lot.h / 2, 0);
      car.model = { name: 'Sport', w: 44, h: 20, top: 452, accel: 330, colors: [car.color] };
      car.color = '#ff5e3a'; car.w = 44; car.h = 20;
      car.mode = 'parked'; car.missionCar = true;
      m.data.car = car;
      m.data.spray = world.shops.find((s) => s.kind === 'spray');
      m.update = (dt) => {
        const t = m.tick(dt); if (t) return t;
        const spray = m.data.spray;
        if (m.step === 0) {
          m.objective('Steal the orange sport coupe', { x: car.x, y: car.y });
          if (player.car === car) {
            m.step = 1; addHeat(210); G.toast('HOT CAR — the bay is watching!');
          }
        } else {
          m.objective('Deliver it to the Sunset Spray bay', { x: spray.bay.x + spray.bay.w / 2, y: spray.bay.y + spray.bay.h / 2 });
          if (player.car === car && reach(spray.bay.x + spray.bay.w / 2, spray.bay.y + spray.bay.h / 2, 74)) return m.done();
          if (car.mode === 'wreck') return m.fail('The coupe is wrecked.');
        }
        return null;
      };
      m.cleanup = () => { car.missionCar = false; };
      return m;
    },
  },
  {
    title: '6 · WRECKING CREW', pay: 450,
    brief: 'Rosa: "The insurance men raised my rates. Wreck six of the city\'s cars. Any six."',
    create() {
      const m = new Mission(this);
      m.timer = 130;
      m.data.counted = new Set();
      m.data.count = 0;
      m.update = (dt) => {
        const t = m.tick(dt); if (t) return t;
        for (const car of cars) {
          if (car.isPolice || m.data.counted.has(car.id)) continue;
          if (car.health <= 18) { m.data.counted.add(car.id); m.data.count++; sfx.cash(); }
        }
        m.objective(`Wreck cars: ${m.data.count} / 6${m.timeText()}`, null);
        if (m.data.count >= 6) return m.done();
        return null;
      };
      return m;
    },
  },
  {
    title: '7 · TAXI!', pay: 350,
    brief: 'Rosa: "A fare waits downtown and his flight does not. Any cab will do. Hurry."',
    create() {
      const m = new Mission(this);
      m.timer = 110;
      m.data.pickup = { x: 1080, y: 1290 };
      m.data.drop = { x: 520, y: 2280 };
      m.update = (dt) => {
        const t = m.tick(dt); if (t) return t;
        if (m.step === 0) {
          m.objective(`Find a taxi and pick up the fare downtown${m.timeText()}`, m.data.pickup);
          if (player.car && player.car.model.name === 'Taxi' && reach(m.data.pickup.x, m.data.pickup.y, 66)) {
            m.step = 1; player.car.passenger = true; sfx.pickup(); G.toast('Fare aboard!');
          }
        } else {
          m.objective(`Take him south, fast${m.timeText()}`, m.data.drop);
          if (player.car && reach(m.data.drop.x, m.data.drop.y, 78)) return m.done();
        }
        return null;
      };
      return m;
    },
  },
  {
    title: '8 · ESCAPE ARTIST', pay: 500,
    brief: 'Rosa: "I may have told the police where you live. Lose them, then come home quiet."',
    create() {
      const m = new Mission(this);
      addHeat(320);
      m.update = (dt) => {
        const t = m.tick(dt); if (t) return t;
        if (police.stars > 0) {
          m.objective(`Lose the police — break their line of sight (${police.stars}★)`, null);
        } else {
          m.objective('Clean. Now reach the park, quiet', SPOTS.park);
          if (reach(SPOTS.park.x, SPOTS.park.y, 84)) return m.done();
        }
        return null;
      };
      return m;
    },
  },
  {
    title: '9 · COURIER', pay: 550,
    brief: 'Rosa: "A package waits up north. It goes south. Do not open it, do not stop."',
    create() {
      const m = new Mission(this);
      m.timer = 105;
      m.update = (dt) => {
        const t = m.tick(dt); if (t) return t;
        if (m.step === 0) {
          m.objective(`Collect the package up north${m.timeText()}`, SPOTS.north);
          if (reach(SPOTS.north.x, SPOTS.north.y, 72)) {
            m.step = 1; addHeat(130); sfx.pickup(); G.toast('Package aboard — and so is the heat.');
          }
        } else {
          m.objective(`Deliver it south${m.timeText()}`, SPOTS.south);
          if (reach(SPOTS.south.x, SPOTS.south.y, 80)) return m.done();
        }
        return null;
      };
      return m;
    },
  },
  {
    title: '10 · STREET RACE', pay: 700,
    brief: 'Rosa: "Kiko says his coupe is faster than anything you can steal. Six gates. Prove him wrong."',
    create() {
      const m = new Mission(this);
      m.data.gates = [
        { x: 720, y: 880 }, { x: 1450, y: 260 }, { x: 2210, y: 880 },
        { x: 2620, y: 1640 }, { x: 1450, y: 1900 }, { x: 720, y: 1260 },
      ];
      const rival = makeCar('car', 380, 460, Math.PI / 2);
      rival.color = '#b44ae0'; rival.mode = 'traffic'; rival.driver = 'traffic';
      rival.road = null; rival.speed = 60;
      m.data.rival = rival;
      m.data.rivalGate = 0;
      m.update = (dt) => {
        const t = m.tick(dt); if (t) return t;
        // Kiko drives his own race, gate to gate.
        const rg = m.data.gates[m.data.rivalGate];
        if (rg) {
          const want = Math.atan2(rg.y - rival.y, rg.x - rival.x);
          rival.angle += Math.max(-2.2 * dt, Math.min(2.2 * dt, ((want - rival.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
          rival.speed = Math.min(330, rival.speed + 120 * dt);
          rival.x += Math.cos(rival.angle) * rival.speed * dt;
          rival.y += Math.sin(rival.angle) * rival.speed * dt;
          if (dist(rival.x, rival.y, rg.x, rg.y) < 84) m.data.rivalGate++;
        } else if (!m.data.rivalDone) {
          m.data.rivalDone = true;
          return m.fail('Kiko finished first. He is insufferable now.');
        }
        const gate = m.data.gates[m.step];
        m.objective(`Gate ${m.step + 1} of 6 — Kiko is on ${Math.min(6, m.data.rivalGate + 1)}`, gate);
        if (player.car && reach(gate.x, gate.y, 82)) {
          m.step++; sfx.checkpoint();
          if (m.step >= 6) return m.done();
        }
        return null;
      };
      m.cleanup = () => { if (rival.mode !== 'wreck') { rival.mode = 'parked'; rival.driver = null; } };
      return m;
    },
  },
  {
    title: '11 · MAYHEM', pay: 650,
    brief: 'Rosa: "The mayor called my motel a blight. Show the city some real mayhem. Two minutes."',
    create() {
      const m = new Mission(this);
      m.timer = 120;
      m.data.points = 0;
      m.notify = (kind) => {
        if (kind === 'hitCar') m.data.points += 1;
        if (kind === 'pedDown') m.data.points += 2;
        if (kind === 'wreck') m.data.points += 3;
      };
      m.update = (dt) => {
        const t = m.tick(dt); if (t) return t;
        m.objective(`Mayhem: ${m.data.points} / 14 points — hits 1, knockdowns 2, wrecks 3${m.timeText()}`, null);
        if (m.data.points >= 14) return m.done();
        return null;
      };
      return m;
    },
  },
  {
    title: '12 · TARGET PRACTICE', pay: 600,
    brief: 'Rosa: "Crates on the beach lot. Six of them. Consider it… quality assurance for your aim."',
    create() {
      const m = new Mission(this);
      for (const crate of world.crates) { crate.alive = true; crate.hp = 3; }
      m.data.total = world.crates.length;
      m.update = (dt) => {
        const t = m.tick(dt); if (t) return t;
        const left = world.crates.filter((c) => c.alive).length;
        const shot = m.data.total - left;
        m.objective(`Shoot the beach-lot crates: ${shot} / 6`, SPOTS.beachLot);
        if (shot >= 6) return m.done();
        return null;
      };
      return m;
    },
  },
  {
    title: '13 · THE CHASE', pay: 800,
    brief: 'Rosa: "A courier of mine ran off with the takings. Stop his car. The money is mine; the fun is yours."',
    create() {
      const m = new Mission(this);
      m.timer = 160;
      const runner = makeCar('car', 2300, 500, Math.PI);
      runner.color = '#22c3aa'; runner.mode = 'traffic'; runner.driver = 'traffic'; runner.road = null;
      m.data.runner = runner;
      m.update = (dt) => {
        const t = m.tick(dt); if (t) return t;
        const p = playerPos();
        const away = Math.atan2(runner.y - p.y, runner.x - p.x);
        runner.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, ((away - runner.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
        runner.speed = Math.min(338, runner.speed + 190 * dt);
        runner.x += Math.cos(runner.angle) * runner.speed * dt;
        runner.y += Math.sin(runner.angle) * runner.speed * dt;
        runner.x = Math.max(40, Math.min(3060, runner.x));
        runner.y = Math.max(40, Math.min(2480, runner.y));
        if (runner.health <= 22) { runner.mode = 'wreck'; return m.done(); }
        m.objective(`Stop the courier's car — ram it! (${Math.max(0, Math.ceil(runner.health))}%)${m.timeText()}`, { x: runner.x, y: runner.y });
        return null;
      };
      m.cleanup = () => { if (runner.mode !== 'wreck') { runner.mode = 'parked'; runner.driver = null; } };
      return m;
    },
  },
  {
    title: '14 · HEAT WAVE', pay: 900,
    brief: 'Rosa: "Every unit in the bay is rolling. Survive seventy-five seconds. That is all. Survive."',
    create() {
      const m = new Mission(this);
      m.timer = 75;
      addHeat(460);
      m.update = (dt) => {
        const t = m.tick(dt);
        if (t && m.timer <= 0) return m.done();   // the clock running out IS the win here
        if (t) return t;
        m.objective(`SURVIVE${m.timeText()}`, null);
        return null;
      };
      return m;
    },
  },
  {
    title: '15 · THE SUNSET RUN', pay: 2000,
    brief: 'Rosa: "One last job, and the bay is yours. The package, the gates, the beach — then disappear."',
    create() {
      const m = new Mission(this);
      m.data.gates = [{ x: 1080, y: 640 }, { x: 2210, y: 260 }, { x: 2620, y: 1260 }, { x: 1450, y: 1900 }];
      m.update = (dt) => {
        const t = m.tick(dt); if (t) return t;
        if (m.step === 0) {
          m.objective('Collect the package at the motel', SPOTS.motel);
          if (reach(SPOTS.motel.x, SPOTS.motel.y, 72)) { m.step = 1; sfx.pickup(); }
        } else if (m.step <= 4) {
          const gate = m.data.gates[m.step - 1];
          m.objective(`Gate ${m.step} of 4`, gate);
          if (reach(gate.x, gate.y, 82)) { m.step++; sfx.checkpoint(); }
        } else if (m.step === 5) {
          m.objective('Deliver it to the beach', SPOTS.beach);
          if (reach(SPOTS.beach.x, SPOTS.beach.y, 84)) {
            m.step = 6; addHeat(330); G.toast('Delivered! Now disappear.');
          }
        } else {
          if (police.stars > 0) m.objective(`Lose the police (${police.stars}★)`, null);
          else return m.done();
        }
        return null;
      };
      return m;
    },
  },
];

// ---------------------------------------------------------------- the engine
export function offerAtPayphone() {
  if (missionState.active) return null;
  if (missionState.index >= MISSION_DEFS.length) return null;
  return MISSION_DEFS[missionState.index];
}

export function startMission(def) {
  const m = def.create();
  missionState.active = m;
  G.toast(def.brief);
  return m;
}

export function updateMissions(dt) {
  const m = missionState.active;
  if (!m) return;
  const result = m.update(dt);
  if (!result) return;
  if (m.cleanup) m.cleanup();
  missionState.active = null;
  G.clearObjective();
  if (result.done) {
    missionState.index++;
    player.missionsDone = missionState.index;
    G.cash(m.pay);
    sfx.missionDone();
    G.toast(missionState.index >= MISSION_DEFS.length
      ? `CAMPAIGN COMPLETE — final pay $${m.pay}. The bay is yours.`
      : `JOB DONE — $${m.pay}. ${missionState.index}/15 complete.`);
    G.save();
  } else if (result.fail) {
    sfx.missionFail();
    G.toast(`JOB FAILED — ${result.fail} The payphone still rings.`);
  }
}

/** External events (impacts, knockdowns) that missions may be counting. */
export function missionEvent(kind) {
  const m = missionState.active;
  if (m && m.notify) m.notify(kind);
}

/** Busted or wasted mid-job: the job dies with the run. */
export function failActiveMission(reason) {
  const m = missionState.active;
  if (!m) return;
  if (m.cleanup) m.cleanup();
  missionState.active = null;
  G.clearObjective();
  G.toast(`JOB FAILED — ${reason}`);
}

export { fmtTime };
