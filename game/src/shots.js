// shots.js — screenshot staging. The maker's screenshots are taken by opening
// the game with ?shot=<name>: each name arranges a real, playable scene (a
// chase with real police, a live mission, dusk traffic) and the photograph is
// the game rendering itself, untouched.

import { addHeat } from './police.js';

export function shotName() {
  const q = new URLSearchParams(location.search);
  return q.get('shot');
}

/**
 * Arrange the scene for `name`. ctx is main.js's toolbox:
 * {player, cars, makeCar, setHour, startMissionAt(index), enterCar(car), toast}
 */
export function applyShot(name, ctx) {
  const { player } = ctx;
  if (name === 'city') {
    ctx.setHour(10.2);
    player.x = 700; player.y = 700;
    return;
  }
  if (name === 'chase') {
    ctx.setHour(15.1);
    // The player is mid-getaway in the motel taxi, three stars up, foot down:
    // a held W keeps the taxi running so the photograph catches a chase, not
    // the arrest at the end of one.
    const taxi = ctx.cars.find((c) => c.model.name === 'Taxi') || ctx.cars[0];
    if (taxi) {
      taxi.x = 1132; taxi.y = 890; taxi.angle = 0; taxi.speed = 260;
      ctx.enterCar(taxi);
    }
    addHeat(330);
    const cop1 = ctx.makeCar('police', 990, 872, 0);
    cop1.speed = 235;
    const cop2 = ctx.makeCar('police', 905, 918, 0.25);
    cop2.speed = 220;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    return;
  }
  if (name === 'mission') {
    ctx.setHour(11.4);
    const taxi = ctx.cars.find((c) => c.model.name === 'Taxi') || ctx.cars[0];
    if (taxi) {
      taxi.x = 700; taxi.y = 500; taxi.angle = Math.PI / 2;
      ctx.enterCar(taxi);
    }
    ctx.startMissionAt(2);   // BURGER RUN: pickup marker across town
    return;
  }
  if (name === 'night') {
    ctx.setHour(19.7);
    // Rolling east through the dusk with the lights on.
    const car = ctx.cars.find((c) => c.model.name === 'Taxi') || ctx.cars[0];
    if (car) {
      car.x = 760; car.y = 890; car.angle = 0; car.speed = 210;
      ctx.enterCar(car);
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    return;
  }
}
