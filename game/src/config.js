// config.js — every shared tuning number for Sunset Bay lives here, so the other
// modules argue about behaviour, never about constants.

// The world is a rectangle of city ending in a beach and open water to the east.
export const WORLD_W = 3360;
export const WORLD_H = 2520;
export const BEACH_X = 2920;        // sand starts here
export const WATER_X = 3120;        // water starts here; cars and feet stop at the shore

// City grid: blocks of BLOCK separated by roads of ROAD_W. Roads sit at multiples
// of PITCH starting at ROAD_OFF, so block interiors never touch a road.
export const BLOCK = 300;
export const ROAD_W = 84;
export const PITCH = BLOCK + ROAD_W;
export const ROAD_OFF = 60;
export const COLS = 7;              // building blocks across (last column is the beach strip)
export const ROWS = 5;              // building blocks down

export const TILE = 42;             // minimap / spatial flavour only

// Player tuning.
export const PLAYER_RADIUS = 13;
export const WALK_SPEED = 148;
export const SPRINT_SPEED = 232;
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_MAX_ARMOR = 100;

// Wanted tuning: heat is a float, stars are its floor. Heat decays only while
// no police unit has eyes on the player.
export const HEAT_PER_STAR = 100;
export const MAX_STARS = 5;
export const HEAT_DECAY_PER_SEC = 9;
export const HEAT_JACK = 55;
export const HEAT_JACK_OCCUPIED = 110;
export const HEAT_HIT_CAR = 26;
export const HEAT_HIT_PED = 65;
export const HEAT_SHOT = 18;
export const HEAT_KILL_PED = 120;

// Police tuning.
export const POLICE_BASE_SPEED = 342;
export const BUST_RADIUS = 64;
export const BUST_TIME = 2.4;       // seconds of close, slow contact to get busted
export const HELI_MIN_STARS = 4;

// Economy.
export const RESPAWN_FEE = 150;
export const SPRAY_COST = 200;
export const MEAL_COST = 25;

// Day length: a full 24h cycle in seconds of real time.
export const DAY_SECONDS = 300;
export const START_HOUR = 8.25;

// Save key in localStorage.
export const SAVE_KEY = 'sunset-bay-save-v2';

// Palette the renderer and minimap share.
export const COLORS = {
  grass: '#3f7d3a',
  grassDark: '#356b31',
  sidewalk: '#9aa0a6',
  road: '#33373d',
  roadLine: '#e8c33c',
  sand: '#ecd28a',
  water: '#1d6f9f',
  waterDeep: '#155a85',
  buildingRoof: ['#c96f4a', '#b8574d', '#d9a05b', '#8f6fb8', '#4a90c9', '#c94a6e', '#5bb8a6', '#d9d3c3'],
  palm: '#2e8b57',
  trunk: '#8a6642',
};
