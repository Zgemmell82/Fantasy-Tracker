// Standalone "Fire Making" mini game - every tuning value lives here.
// Units: metres, seconds; heat/oxygen/moisture are normalised 0..1 (heat can exceed 1 up to flame.maxHeat).
export const FIREGAME = {
  players: { min: 1, max: 12, default: 4 },
  nameMax: 12,
  upSeconds: 6,                 // "Player N, you're up" announcement before the keyboard appears (host can skip)
  resultSeconds: 6,             // result card on the TV before the next player (host can skip)
  timeLimit: 420,               // safety cap: the run ends as DNF
  autoMic: true,                // try to enable the headset mic when the game starts (needs the host click gesture)

  // ---- fuel pieces: heat, moisture and burn-rate per piece ----
  fuels: {
    //          mass  moisture   burnRate  heatValue  igniteTemp  heatCapacity
    twig:   { mass: 0.12, moisture: [0.04, 0.22], burnRate: 0.010, heatValue: 1.0, igniteTemp: 0.30, capacity: 2.0 },
    branch: { mass: 0.35, moisture: [0.12, 0.34], burnRate: 0.0075, heatValue: 1.2, igniteTemp: 0.50, capacity: 5.0 },
    log:    { mass: 1.00, moisture: [0.25, 0.40], burnRate: 0.0065, heatValue: 1.4, igniteTemp: 0.65, capacity: 14.0 },
  },
  pit: { twig: 3, branch: 2, log: 1 },        // laid in the pit at the start
  pile: { twig: 4, branch: 3, log: 2 },       // extra fuel beside the pit
  pitMax: 10,
  addCool: 0.10,                // flame heat lost (per unit of fuel mass * its moisture-ish) when a piece is added

  // ---- tinder (shavings) ----
  tinder: {
    curlAmount: 0.11,           // each shaved curl
    minCatch: 0.30,             // below this the tinder will not catch properly
    ideal: 0.55,                // sweet spot starts here ...
    maxAmount: 1.05,            // ... above this it smothers fully
    smotherMax: 0.85,           // max oxygen starvation from too much tinder
    dryness: [0.75, 0.95],      // shavings from a damp branch are less dry
    burnRate: 0.35,             // amount/s once burning
    heat: 0.55,                 // heat source strength while burning
    warmGain: 0.55,             // per perfect spark
    warmDecay: 0.45,            // spark warmth lost per second
    ignitionWarm: 1.0,
  },

  // ---- knife shaving ----
  shave: {
    speedXR: 0.45,              // knife speed (m/s) along the branch that cuts a curl
    speedDesktop: 0.9,          // mouse drag speed on the table plane (m/s)
    cooldown: 0.22,
    branchMoisture: [0.05, 0.3],
    reach: 0.11,                // knife must be this close to the branch
    maxCurlsOnTray: 14,
  },

  // ---- flint on knife ----
  strike: {
    speedRange: [0.9, 3.2],     // relative speed (m/s) mapped to 0..1 spark quality
    angleIdealDeg: [20, 70],    // angle between stroke and the knife spine
    angleFalloffDeg: 35,
    minQuality: 0.12,
    sparksPerStrike: [2, 9],
    cooldown: 0.22,
    contactDist: 0.10,          // XR: flint must touch the knife
    nestRadius: 0.13,           // sparks must land this close to the tinder nest
  },

  // ---- flame / oxygen simulation ----
  flame: {
    heatScale: 13,              // converts (heatValue * burnRate) into flame heat input
    loss: 0.5,                  // flame heat lost per second (steady heat = input / loss)
    maxHeat: 1.5,
    moistureDamp: 0.8,          // wet fuel gives less heat
    heatFuelK: 1.0,             // how strongly the flame warms fuel
    coolK: 1.2,                 // how fast fuel cools
    evaporation: 0.35,          // moisture lost per second per unit of temp above 0.15
    moisturePenalty: 1.5,       // wet fuel needs more temp to ignite
    tipMax: 0.95,               // flame tip height (m) at very high heat
    tipSteepness: 1.6,
  },
  oxygen: {
    relax: 3.0,                 // oxygen returns to its target at this rate
    consumption: 3.0,           // oxygen use per unit of fuel burn rate
    blowGain: 2.6,              // oxygen added per second at full blow
    max: 1.7,
    burnBoostMax: 1.4,          // fuel burns up to this much faster in oxygen-rich air
  },
  blow: {
    micRange: [0.04, 0.25],     // mic RMS mapped to 0..1 (breath rumble)
    fanSpeedXR: [0.7, 2.6],     // controller speed (m/s) mapped to 0..1
    fanSpeedNdc: [0.8, 4.0],    // desktop mouse speed (screens/s) mapped to 0..1
    desktopKey: 0.8,            // hold Space / right mouse
    snuffLevel: 0.6,            // blowing harder than this on a weak ember...
    weakHeat: 0.25,             // ...(heat below this) snuffs it
    snuffCool: 1.4,
    micAutoFallbackSeconds: 4,  // if the mic is on but never hears a breath in this long while fanning is used, prefer fanning
  },

  // ---- rope + flag ----
  rope: {
    height: 0.85,               // metres above the pit
    reach: 0.12,                // flame tip counts from this far below the rope
    minHeat: 0.90,              // flame must be this hot
    heatRate: 0.16,             // buffer fill per second at full reach
    cool: 0.15,                 // buffer drain per second when the flame is not touching
    capacity: 1.0,              // the rope snaps when the buffer is full
  },

  // ---- fail state ----
  dead: { heat: 0.03, seconds: 1.5 },
};
