// Per-challenge tunables (distances, speeds, limits...). Units are metres / seconds.
export const CHALLENGES = {
  basketball: {
    timeLimit: 90,
    hoops: [                         // dist from the player, angle in degrees (0 = straight ahead, + = right)
      { dist: 3.0, angle: -30 },
      { dist: 4.4, angle: 24 },
      { dist: 5.8, angle: -12 },
      { dist: 7.2, angle: 34 },
      { dist: 8.8, angle: -38 },
    ],
    rimHeight: 2.7,
    rimRadius: 0.46,
    ballRadius: 0.16,
    gravity: 9.81,
    respawnDelay: 0.5,               // s between a ball leaving play and a fresh one appearing
    bounce: 0.55,
    throwScaleXR: 1.25,              // multiplies controller velocity on release
    // desktop mouse: hold to charge, release to throw
    desktop: { chargeTime: 1.5, minSpeed: 5.5, maxSpeed: 13.5, elevationDeg: 28 },
    aimAssistStrength: 0.65,         // 0..1 blend toward a perfect shot while aim assist is active
  },

  endurance: {
    timeLimit: 240,
    // idol (overhead hand)
    idolOverheadMargin: 0.18,        // hand must stay this far above head height
    idolSideTolerance: 0.32,         // how far sideways before it's out
    idolDroopPerSecond: 0.004,       // idol sinks this much (m) per second elapsed...
    idolDroopMax: 0.55,
    idolShakeBase: 0.035,            // shake amplitude (m) at start
    idolShakeGrowth: 0.0006,         // + per second
    desktopHandSpeed: 0.9,           // WASD hand speed (m/s)
    // ball-on-stick
    platformRadius: 0.13,
    ballRadius: 0.035,
    stickLength: 0.5,
    gravityScale: 9.81,
    rollDamping: 0.9,                // higher = ball slows faster
    maxTiltDeg: 16,                  // desktop: mouse at screen edge = this tilt
    wobbleBase: 0.012,               // stick tilt noise (rad)
    wobbleGrowth: 0.00012,
    inertiaScaleXR: 0.6,
  },

  puzzle: {
    timeLimit: 240,
    cols: 4,
    rows: 3,
    cellSize: 0.13,                  // metres
    snapDistance: 0.075,
    blankSeconds: 15,                // sabotage "blank picture" lasts this long
    blankCount: 5,
    highlightSeconds: 10,
    pictureCount: 6,                 // number of distinct puzzles (>= maxPlayers)
  },

  balance: {
    timeLimit: 150,
    trayHalf: 0.2,                   // tray is 0.4 m square
    firstDrop: 1.5,                  // s after GO
    dropInterval: 4.5,               // s between blocks...
    dropIntervalMin: 2.4,            // ...shrinking toward this
    dropIntervalDecay: 0.06,         // per block
    blockSize: [0.08, 0.13],         // random edge length range (height is ~55% of this)
    blockMass: 0.5,
    friction: 1.0,
    slipperyFriction: 0.04,
    fatigueTiltBase: 0.0,            // arm-wobble noise (rad) at start...
    fatigueTiltGrowth: 0.0012,       // ...grows per second
    fatigueTiltMax: 0.07,
    desktopMaxTiltDeg: 14,
    fallBelow: 0.22,                 // block this far below tray = out
  },
};
