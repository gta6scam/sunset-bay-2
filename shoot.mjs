// shoot.mjs — maker's tool: smoke-tests Sunset Bay in headless Chrome and takes
// the entry screenshots listed in shots.json. Run: node shoot.mjs [--shots-only|--test-only]

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/hatch/workspace/shots-tool/package.json');
const puppeteer = require('puppeteer');

const here = fileURLToPath(new URL('.', import.meta.url));
const PORT = 8907;
const BASE = `http://127.0.0.1:${PORT}`;
const args = process.argv.slice(2);
const shotsOnly = args.includes('--shots-only');
const testOnly = args.includes('--test-only');

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: here, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(900);

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = [];
const errors = [];

async function newPage(url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 960 });
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  return page;
}

function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

if (!shotsOnly) {
  const page = await newPage(BASE + '/');
  await page.waitForFunction(() => window.SB, { timeout: 10000 });
  // Canvas is actually painting: sample pixels.
  const painted = await page.evaluate(() => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const data = g.getImageData(0, 0, c.width, c.height).data;
    let varied = 0;
    for (let i = 0; i < data.length; i += 4013 * 4) if (data[i] + data[i + 1] + data[i + 2] > 0) varied++;
    return varied;
  });
  check('canvas renders non-blank pixels', painted > 20, `${painted} sampled lit pixels`);

  await page.click('#newGameBtn');
  await sleep(400);
  const start = await page.evaluate(() => ({ x: window.SB.player.x, y: window.SB.player.y, mode: window.SB.state.mode }));
  check('new game starts in playing mode', start.mode === 'playing');

  await page.keyboard.down('KeyD');
  await sleep(650);
  await page.keyboard.up('KeyD');
  const moved = await page.evaluate(() => window.SB.player.x);
  check('player walks east on D', moved > start.x + 30, `x ${start.x.toFixed(0)} -> ${moved.toFixed(0)}`);

  // Teleport beside the motel taxi and steal it.
  await page.evaluate(() => {
    const taxi = window.SB.cars.find((c) => c.model.name === 'Taxi');
    window.SB.teleport(taxi.x + 30, taxi.y);
  });
  await sleep(120);
  await page.keyboard.press('KeyF');
  await sleep(250);
  const inCar = await page.evaluate(() => !!window.SB.player.car);
  check('player enters a car with F', inCar);

  await page.keyboard.down('KeyW');
  await sleep(900);
  await page.keyboard.up('KeyW');
  const speed = await page.evaluate(() => Math.abs(window.SB.player.car.speed));
  check('car accelerates under W', speed > 60, `speed ${speed.toFixed(0)}`);

  // Crime and punishment.
  await page.evaluate(() => window.SB.setWanted(3));
  await sleep(3500);
  const cops = await page.evaluate(() => window.SB.cars.filter((c) => c.isPolice && c.mode === 'police').length);
  check('police respond at 3 stars', cops >= 1, `${cops} units`);
  const stars = await page.evaluate(() => window.SB.police.stars);
  check('wanted level stays hot (decays only while unseen)', stars >= 2, `${stars}`);

  // Gunplay plumbing.
  await page.keyboard.press('KeyF');
  await sleep(200);
  await page.evaluate(() => window.SB.giveGun());
  const weapon = await page.evaluate(() => window.SB.player.weapon);
  check('weapon can be equipped', weapon === 'pistol', weapon);

  // Mission can start through the debug hook.
  await page.evaluate(() => window.SB.startMissionAt(0));
  await sleep(200);
  const mission = await page.evaluate(() => window.SB.missionState.active && window.SB.missionState.active.title);
  check('mission 1 starts', !!mission, mission || 'none');

  await page.close();
}

if (!testOnly) {
  const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
  for (const shot of shots) {
    const page = await newPage(BASE + '/' + shot.query);
    await page.waitForFunction(() => window.SB, { timeout: 10000 });
    await sleep(shot.wait || 2600);
    const path = join(here, 'screenshots', shot.name);
    await page.screenshot({ path, type: 'jpeg', quality: 84 });
    const size = statSync(path).size;
    results.push(`SHOT ${shot.name} — ${size} bytes${size > 262144 ? ' (OVER 256 KiB!)' : ''}`);
    if (size > 262144) process.exitCode = 1;
    await page.close();
  }
}

check('zero console/page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
console.log(results.join('\n'));
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 8).join('\n'));
await browser.close();
server.kill();
