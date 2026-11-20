// input.js — keyboard and mouse state. Modules poll `keys` for held controls and
// register one-shot handlers with onPress for taps (enter car, interact, pause).

const held = new Set();
const pressHandlers = new Map();
export const mouse = { x: 0, y: 0, down: false };

function code(e) {
  return e.code;
}

export function initInput(canvas) {
  addEventListener('keydown', (e) => {
    const c = code(e);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) e.preventDefault();
    if (!held.has(c)) {
      held.add(c);
      const list = pressHandlers.get(c);
      if (list) for (const fn of list) fn();
    }
  });
  addEventListener('keyup', (e) => held.delete(code(e)));
  addEventListener('blur', () => held.clear());
  canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) mouse.down = true; });
  addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export const key = (c) => held.has(c);

/** Movement vector from WASD / arrows, normalised. */
export function moveVector() {
  let x = 0, y = 0;
  if (key('KeyA') || key('ArrowLeft')) x -= 1;
  if (key('KeyD') || key('ArrowRight')) x += 1;
  if (key('KeyW') || key('ArrowUp')) y -= 1;
  if (key('KeyS') || key('ArrowDown')) y += 1;
  if (x !== 0 && y !== 0) { const s = Math.SQRT1_2; x *= s; y *= s; }
  return { x, y };
}

/** Register a one-shot action on a fresh key press. Returns an unsubscribe. */
export function onPress(c, fn) {
  if (!pressHandlers.has(c)) pressHandlers.set(c, []);
  pressHandlers.get(c).push(fn);
  return () => {
    const list = pressHandlers.get(c);
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
}
