// audio.js — every sound in Sunset Bay is synthesised with WebAudio: gunshots,
// crashes, pickups, an engine hum, police sirens and three radio stations whose
// loops are little step-sequenced tunes. No audio files, nothing to load.

let ctx = null;
let master = null;
let muted = false;

export function ensureAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}
export const isMuted = () => muted;

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function blip(freq, dur, type = 'square', vol = 0.12, when = 0, slideTo = null) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noiseBurst(dur, vol, freq = 1200, when = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

export const sfx = {
  shot(kind) {
    noiseBurst(kind === 'smg' ? 0.07 : 0.12, 0.25, kind === 'smg' ? 2400 : 1600);
    blip(140, 0.08, 'square', 0.1, 0, 60);
  },
  dryFire() { blip(900, 0.04, 'square', 0.06); },
  reload() { blip(500, 0.05, 'square', 0.08); blip(700, 0.05, 'square', 0.08, 0.09); },
  crash(strength = 1) {
    noiseBurst(0.22, Math.min(0.4, 0.12 + strength * 0.2), 500);
    blip(90, 0.2, 'sine', 0.22, 0, 40);
  },
  jack() { blip(300, 0.07, 'square', 0.1); blip(210, 0.09, 'square', 0.1, 0.08); },
  door() { blip(180, 0.06, 'sine', 0.12); },
  cash() { blip(880, 0.07, 'square', 0.1); blip(1320, 0.1, 'square', 0.1, 0.07); },
  pickup() { blip(660, 0.06, 'triangle', 0.14); blip(990, 0.09, 'triangle', 0.14, 0.06); },
  checkpoint() { blip(1046, 0.08, 'triangle', 0.15); },
  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.16, 'triangle', 0.14, i * 0.09));
  },
  missionFail() {
    [392, 330, 262].forEach((f, i) => blip(f, 0.2, 'triangle', 0.13, i * 0.12));
  },
  busted() { [330, 330, 262].forEach((f, i) => blip(f, 0.22, 'square', 0.1, i * 0.16)); },
  wasted() { blip(220, 0.7, 'sawtooth', 0.12, 0, 55); },
  buy() { blip(740, 0.06, 'square', 0.1); blip(1108, 0.1, 'square', 0.1, 0.06); },
  denied() { blip(160, 0.14, 'square', 0.1); },
  sirenStep(on) { /* siren is continuous, see below */ },
};

// ---- engine hum -------------------------------------------------------------
let engineOsc = null, engineGain = null, engineFilter = null;
export function engineStart() {
  if (!ctx || engineOsc) return;
  engineOsc = ctx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 55;
  engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass'; engineFilter.frequency.value = 320;
  engineGain = ctx.createGain();
  engineGain.gain.value = 0.0;
  engineOsc.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(master);
  engineOsc.start();
}
export function engineSet(ratio) {
  if (!engineOsc || muted) return;
  const t = ctx.currentTime;
  engineOsc.frequency.setTargetAtTime(50 + ratio * 130, t, 0.06);
  engineGain.gain.setTargetAtTime(0.028 + ratio * 0.03, t, 0.08);
}
export function engineStop() {
  if (!engineOsc) return;
  try { engineOsc.stop(); } catch { /* already stopped */ }
  engineOsc.disconnect(); engineGain.disconnect(); engineFilter.disconnect();
  engineOsc = null;
}

// ---- police siren ------------------------------------------------------------
let sirenOsc = null, sirenGain = null, sirenLfo = null;
export function sirenSet(on, closeness = 1) {
  if (!ctx) return;
  if (on && !sirenOsc) {
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 760;
    sirenLfo = ctx.createOscillator();
    sirenLfo.frequency.value = 0.7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 190;
    sirenLfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain); sirenGain.connect(master);
    sirenOsc.start(); sirenLfo.start();
  }
  if (sirenGain) {
    const target = on && !muted ? 0.012 + closeness * 0.03 : 0;
    sirenGain.gain.setTargetAtTime(target, ctx.currentTime, 0.15);
  }
  if (!on && sirenOsc) {
    const osc = sirenOsc, lfo = sirenLfo;
    setTimeout(() => { try { osc.stop(); lfo.stop(); } catch { /* gone */ } }, 400);
    sirenOsc = null; sirenLfo = null; sirenGain = null;
  }
}

// ---- radio -------------------------------------------------------------------
export const STATIONS = [
  { name: 'WAVE 103 · SYNTH', bpm: 112, wave: 'sawtooth', root: 45,
    bass: [0, -1, 0, -1, 7, -1, 0, -1, 5, -1, 0, -1, 7, -1, 10, -1],
    lead: [12, -1, 15, -1, 19, -1, 15, -1, 12, -1, 15, -1, 22, -1, 19, -1] },
  { name: 'PALMS FM · CHILL', bpm: 82, wave: 'triangle', root: 50,
    bass: [0, -1, -1, -1, 7, -1, -1, -1, 9, -1, -1, -1, 7, -1, -1, -1],
    lead: [16, -1, -1, 14, -1, -1, 12, -1, -1, -1, 14, -1, -1, -1, -1, -1] },
  { name: 'BAY ROCK · RIFFS', bpm: 128, wave: 'square', root: 40,
    bass: [0, 0, -1, 0, -1, 0, 3, -1, 0, 0, -1, 0, 5, -1, 3, -1],
    lead: [12, -1, 12, -1, 15, -1, 12, -1, 17, -1, 15, -1, 12, -1, -1, -1] },
];

let radioTimer = null;
let radioStep = 0;
let radioIndex = -1;

function radioTick() {
  const st = STATIONS[radioIndex];
  if (!st || !ctx) return;
  const i = radioStep % 16;
  const b = st.bass[i];
  if (b >= 0) blip(midi(st.root + b), 0.16, 'triangle', 0.16);
  const l = st.lead[i];
  if (l >= 0) blip(midi(st.root + l), 0.13, st.wave, 0.05);
  if (i % 4 === 0) noiseBurst(0.03, 0.03, 6000);
  radioStep++;
}

export function radioStart(index) {
  radioStop();
  if (!ctx) return;
  radioIndex = index;
  radioStep = 0;
  const st = STATIONS[index];
  radioTimer = setInterval(radioTick, (60 / st.bpm) / 2);
}
export function radioStop() {
  if (radioTimer) clearInterval(radioTimer);
  radioTimer = null;
  radioIndex = -1;
}
export const radioPlaying = () => radioIndex;
