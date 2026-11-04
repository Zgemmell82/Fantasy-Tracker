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

  // ----- team relay challenges (finish-based; each teammate runs the same challenge) -----
  supply: {
    timeLimit: 120,               // per player; timing out = DNF (adds the relay DNF penalty)
    itemsPerType: 3,              // 4 types -> 12 items in the pile
    basketWidth: 0.34,
    basketSpacing: 0.42,
    basketY: 0.95,
    dropReach: 0.26,              // how close (m) to a basket mouth counts as "over it"
    wrongPenalty: 2.0,            // seconds added for a wrong basket
    xrGrabRadius: 0.16,
  },
  rope: {
    timeLimit: 120,
    loops: 8,
    pegCols: 4,
    pegRows: 2,
    pegSpacingX: 0.22,
    pegSpacingY: 0.30,
    layerGap: 0.03,
    pullDistance: 0.22,           // how far a free loop must be dragged off its pegs
    blockedPenalty: 1.0,          // seconds added for yanking a covered loop
    tightenSeconds: 8,
  },

  // ----- finale fire-making (hands-only; mic optional) -----
  fire: {
    timeLimit: 150,
    strikesNeeded: 6,             // successful fire-steel strokes to light the tinder into an ember
    strikeSpeedNdc: 3.2,          // desktop: mouse flick speed (screen-widths/s) that counts as a stroke
    strikeSpeedXR: 1.7,           // XR: controller speed (m/s) that counts as a stroke
    strikeCooldown: 0.22,
    // blowing / fanning -> heat
    fanSpeedNdc: [0.8, 4.0],      // desktop mouse speed range mapped to 0..1 fan strength
    fanSpeedXR: [0.7, 2.6],       // controller speed (m/s) range mapped to 0..1
    micThreshold: [0.04, 0.25],   // mic RMS range mapped to 0..1 (calibrated per device)
    blowGain: 0.55,               // heat/s at full blow
    heatDecay: 0.16,              // heat/s lost at rest (grows with each stage)
    decayPerStage: 0.35,
    heatFloor: 0.08,              // ember never fully dies
    smotherPenalty: 0.5,          // heat multiplier when kindling is added too early
    // kindling stages: heat required to add it, and the flame size it unlocks
    kindling: [
      { name: 'twigs', minHeat: 0.30, size: 0.30, count: 4 },
      { name: 'sticks', minHeat: 0.50, size: 0.65, count: 3 },
      { name: 'logs', minHeat: 0.70, size: 1.00, count: 2 },
    ],
    fullHeat: 0.8,                // heat at which the flame reaches the stage's full size
    finishSize: 0.95,             // flame size needed after the last kindling stage
    flameGrow: 0.9,               // how fast the flame size chases its target (1/s)
    feedRadius: 0.28,
  },
};
