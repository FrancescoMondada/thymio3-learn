// What the mode is made of (src/py/ann_mode.py, a port of main/ann.c of the firmware): the sensors, the
// numbers of the firmware, and the states. Pure data: no import, so that Node can test everything.

// The 7 proximity sensors, in the order of the firmware (PROXIMITY(0..6)). `angle` is where each one looks,
// in degrees from the front of the robot, positive to the left; (x, y) is where it sits on the robot's
// outline in millimetres, x to the right and y to the front (the robot is about 110 mm wide). The five in front are evenly
// spaced along the nose: 27.5 mm from each other, and their directions 0, 28 and 55 degrees apart.
export const SENSORS = [
  { id: 0, name: 'left',        short: 'L',  angle: 55,   x: -47, y: 30 },
  { id: 1, name: 'front-left',  short: 'FL', angle: 28,   x: -27, y: 49 },
  { id: 2, name: 'front',       short: 'F',  angle: 0,    x: 0,   y: 54 },
  { id: 3, name: 'front-right', short: 'FR', angle: -28,  x: 27,  y: 49 },
  { id: 4, name: 'right',       short: 'R',  angle: -55,  x: 47,  y: 30 },
  { id: 5, name: 'back-left',   short: 'BL', angle: 180,  x: -25, y: -52 },
  { id: 6, name: 'back-right',  short: 'BR', angle: 180,  x: 25,  y: -52 },
];
export const FRONT_SENSORS = 5;                 // only these can make the robot hit something

export const PROX_MAX = 4095;
// What a reading stands for: a low reading is a far object, a high one a near object (same curve as the virtual arena's sensors,
// src/sim/arena.js: 4500 * (1 - d / 110)^2, about 4000 when touching, 3300 at 16 mm, nothing beyond 11 cm).
export const SENSE_RANGE_MM = 110;
export const distanceFromProx = (reading) => SENSE_RANGE_MM * (1 - Math.sqrt(Math.min(Math.max(reading, 0), 4500) / 4500));
export const COLLISION = 3300;                  // COLLISION_SENSOR_VALUE: over this a front sensor means a collision
export const SENSOR_SCALE = 20;                 // x = proximity / 20
export const MOTOR_SCALE = 30;                  // wheel = sum(x * w) / 30
export const DEFAULT_BIAS = 2000;               // the bias weight: 2000 / 30 = 66.7
export const DEFAULT_BASE = DEFAULT_BIAS / MOTOR_SCALE;
export const DEFAULT_STEP = 3;                  // LEARNING_STEP
export const DEFAULT_FORGET = 16;               // seconds between two forgettings
export const W_LIMIT = 100;
export const MAX_SPEED = 500;
export const BACK_SPEED = -200;
export const BACK_MS = 1000;
export const LEARN_MS = 300;
export const LEARNT_MAX = 16;                   // the 16 Lego LEDs

// What the sliders can do.
export const RANGES = {
  step: { min: 0, max: 10, step: 0.5 },         // the learning step (the firmware's is 3)
  base: { min: 0, max: 200, step: 1 },          // the speed with nothing in front (the firmware's is 67)
  forget: { min: 0, max: 120, step: 1 },        // seconds between two forgettings, 0 = never
  weight: { min: -30, max: 30, step: 0.5 },     // a weight, by hand (up to 100 in the typed field)
};

export const STATES = {
  0: 'drive',
  1: 'back',
  2: 'learn',
  4: 'freeze',
  5: 'pause',
};
export const STATE_CODE = { drive: 0, back: 1, learn: 2, freeze: 4, pause: 5 };

// The speed one sensor adds to one wheel for a reading and a weight (what a connection "carries").
export const contribution = (reading, weight) => (reading / SENSOR_SCALE) * weight / MOTOR_SCALE;

// A new brain: the 14 weights at 0.
export const emptyWeights = () => ({ left: new Array(7).fill(0), right: new Array(7).fill(0) });

// Some brains to start from (weights in the firmware's units). The first is what the robot starts with.
export const PRESETS = [
  { id: 'blank', left: [0, 0, 0, 0, 0, 0, 0], right: [0, 0, 0, 0, 0, 0, 0] },
  // what the robot ends up with after a few bumps on each side: obstacle on the left -> turn right
  { id: 'avoid', left: [9, 6, 0, -6, -9, 0, 0], right: [-9, -6, 0, 6, 9, 0, 0] },
  // the opposite: the robot is drawn to what it sees
  { id: 'attract', left: [-9, -6, 0, 6, 9, 0, 0], right: [9, 6, 0, -6, -9, 0, 0] },
  // a robot that slows down in front of anything
  { id: 'cautious', left: [0, -3, -6, -3, 0, 0, 0], right: [0, -3, -6, -3, 0, 0, 0] },
];
