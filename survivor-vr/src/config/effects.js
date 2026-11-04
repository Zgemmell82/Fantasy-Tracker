// Effect pools. A phone tap draws ONE entry at random (weighted) from the
// matching `help` or `sabotage` list of the current challenge.
//
// Entry fields:
//   id        unique within the challenge
//   label     short name (host/debug only - players never see who tapped)
//   feed      line shown on the TV feed + headset board (keep it anonymous!)
//   weight    relative draw chance (default 1)
//   duration  seconds the effect lasts (omit for one-shot actions)
//   mods      { key: multiplier } - timed multipliers read by the challenge
//             (multipliers from several active effects multiply together)
//   action    { type, ...params } - one-shot behaviour implemented by the challenge
export const EFFECTS = {
  basketball: {
    help: [
      { id: 'aimAssist', label: 'Aim assist', weight: 3, duration: 14,
        feed: 'The spirits steady your aim...', mods: { aimAssist: 1 } },
      { id: 'bigRim', label: 'Bigger rim', weight: 3, duration: 10,
        feed: 'The rims swell wide!', mods: { rimScale: 1.55 } },
      { id: 'shaveTime', label: 'Shave seconds', weight: 2,
        feed: 'A gift from the tribe: seconds shaved off your clock!', action: { type: 'shaveSeconds', seconds: 3 } },
    ],
    sabotage: [
      { id: 'moveHoop', label: 'Hoops slide sideways', weight: 3, duration: 9,
        feed: 'Someone is shoving the hoops sideways!', action: { type: 'moveHoops', count: 2, range: 1.6 } },
      { id: 'shrinkRim', label: 'Shrink rim', weight: 3, duration: 9,
        feed: 'The rims shrink!', mods: { rimScale: 0.62 } },
      { id: 'wind', label: 'Wind', weight: 2, duration: 8,
        feed: 'A harsh wind whips across the beach!', mods: { wind: 1 }, params: { strength: 3.2 } },
      { id: 'crowd', label: 'Crowd blocks view', weight: 2, duration: 8,
        feed: 'The tribe crowds in front of you!', action: { type: 'crowdBlock', count: 5 } },
    ],
  },

  endurance: {
    help: [
      { id: 'steadyIdol', label: 'Steadier idol', weight: 3, duration: 12,
        feed: 'The idol feels light and steady...', mods: { idolShake: 0.3, idolDroop: 0.4 } },
      { id: 'widePlatform', label: 'Wider ball platform', weight: 3, duration: 12,
        feed: 'The ball platform grows wider!', mods: { platformScale: 1.55 } },
    ],
    sabotage: [
      { id: 'heavyIdol', label: 'Idol gets heavy', weight: 3, duration: 10,
        feed: 'The idol suddenly feels HEAVY!', mods: { idolDroop: 3.2 } },
      { id: 'shakyIdol', label: 'Shaky idol', weight: 3, duration: 10,
        feed: 'The idol starts to tremble!', mods: { idolShake: 2.6 } },
      { id: 'slipperyBall', label: 'Slippery ball', weight: 2, duration: 10,
        feed: 'The ball turns slippery as a wet fish!', mods: { ballSlip: 1 } },
      { id: 'wobblyStick', label: 'Wobbly stick', weight: 2, duration: 10,
        feed: 'The stick starts to wobble!', mods: { stickWobble: 3.5 } },
      { id: 'storm', label: 'Storm', weight: 2, duration: 9,
        feed: 'A STORM rolls in!', mods: { storm: 1, idolShake: 1.6, stickWobble: 1.8 }, params: { wind: 0.9 } },
    ],
  },

  puzzle: {
    help: [
      { id: 'highlight', label: 'Highlight a piece', weight: 3, duration: 10,
        feed: 'A glowing hint appears...', action: { type: 'highlightPiece' } },
      { id: 'lockIn', label: 'Lock in a piece', weight: 2,
        feed: 'A piece slides itself into place!', action: { type: 'lockPiece' } },
    ],
    sabotage: [
      { id: 'blank5', label: 'Blank out 5 pieces', weight: 3, duration: 15,
        feed: 'The pictures fade from five pieces!', action: { type: 'blankPieces' } },
      { id: 'scramble', label: 'Scramble a piece', weight: 2,
        feed: 'A piece spins out of orientation!', action: { type: 'scramblePiece' } },
      { id: 'flip', label: 'Flip a piece', weight: 2,
        feed: 'A piece flips face-down!', action: { type: 'flipPiece' } },
      { id: 'decoy', label: 'Decoy piece', weight: 2,
        feed: 'A suspicious extra piece drifts in...', action: { type: 'decoyPiece' } },
    ],
  },

  balance: {
    help: [
      { id: 'stickyTray', label: 'Sticky tray', weight: 3, duration: 12,
        feed: 'The tray turns sticky!', mods: { trayGrip: 2.4 } },
      { id: 'smallBlock', label: 'Smaller next block', weight: 3,
        feed: 'The next block will be tiny.', action: { type: 'nextBlock', scale: 0.6 } },
      { id: 'slowMo', label: 'Slow-mo', weight: 2, duration: 5,
        feed: 'Time slows down...', mods: { timeScale: 0.4 } },
    ],
    sabotage: [
      { id: 'gust', label: 'Gust of wind', weight: 3,
        feed: 'A gust of wind hits the stack!', action: { type: 'gust', seconds: 1.4, force: 7 } },
      { id: 'slipBlock', label: 'Slippery block', weight: 3,
        feed: 'The next block is slick as soap!', action: { type: 'nextBlock', slippery: true } },
      { id: 'bigBlock', label: 'Oversized block', weight: 2,
        feed: 'The next block is ENORMOUS!', action: { type: 'nextBlock', scale: 1.8 } },
    ],
  },

  supply: {
    help: [
      { id: 'autoSort', label: 'Auto-sort items', weight: 3,
        feed: 'Helpful hands sort a few items for you!', action: { type: 'autoSort', count: 3 } },
      { id: 'hintBasket', label: 'Basket hint', weight: 3, duration: 12,
        feed: 'The right basket glows...', mods: { hint: 1 } },
      { id: 'bigBaskets', label: 'Bigger baskets', weight: 2, duration: 12,
        feed: 'The baskets swell wide!', mods: { basketScale: 1.6 } },
    ],
    sabotage: [
      { id: 'swapBaskets', label: 'Swap two baskets', weight: 3,
        feed: 'Two baskets swap places!', action: { type: 'swapBaskets' } },
      { id: 'scatterPile', label: 'Scatter the pile', weight: 2,
        feed: 'The pile scatters in the wind!', action: { type: 'scatterPile' } },
      { id: 'hideLabels', label: 'Hide the labels', weight: 3, duration: 10,
        feed: 'The basket labels fade away...', mods: { hideLabels: 1 } },
      { id: 'shrinkBaskets', label: 'Shrink baskets', weight: 2, duration: 10,
        feed: 'The baskets shrink!', mods: { basketScale: 0.6 } },
    ],
  },

  rope: {
    help: [
      { id: 'glowFree', label: 'Highlight free loops', weight: 3, duration: 12,
        feed: 'The loose loops start to glow...', mods: { glowFree: 1 } },
      { id: 'unhook', label: 'Unhook a loop', weight: 2,
        feed: 'A loop slips off by itself!', action: { type: 'unhookLoop' } },
      { id: 'looseRope', label: 'Loose rope', weight: 2, duration: 10,
        feed: 'The rope goes slack!', mods: { pullScale: 0.5 } },
    ],
    sabotage: [
      { id: 'reHook', label: 'Re-hook a loop', weight: 3,
        feed: 'A loop snaps back onto the pegs!', action: { type: 'reHookLoop' } },
      { id: 'tighten', label: 'Tighten a loop', weight: 3, duration: 8,
        feed: 'A loop pulls tight and sticks!', action: { type: 'tightenLoop' } },
      { id: 'shakeBoard', label: 'Shake the board', weight: 2, duration: 8,
        feed: 'The whole board starts to shake!', mods: { jitter: 1 } },
    ],
  },

  fire: {
    help: [
      { id: 'dryTinder', label: 'Dry tinder', weight: 3, duration: 15,
        feed: 'The tinder is bone dry - fewer strikes needed!', mods: { strikeNeed: 0.5 } },
      { id: 'tailwind', label: 'Steady breeze', weight: 3, duration: 10,
        feed: 'A steady breeze fans the fire!', mods: { blowGain: 1.8 } },
      { id: 'steadyHeat', label: 'Slow heat loss', weight: 2, duration: 12,
        feed: 'The embers hold their heat...', mods: { heatDecay: 0.3 } },
      { id: 'autoFeed', label: 'Auto-feed kindling', weight: 1,
        feed: 'A bundle of kindling jumps onto the fire!', action: { type: 'autoFeed' } },
    ],
    sabotage: [
      { id: 'dampTinder', label: 'Damp tinder', weight: 3, duration: 15,
        feed: 'The tinder is damp - more strikes needed!', mods: { strikeNeed: 1.8 } },
      { id: 'rain', label: 'Rain', weight: 3, duration: 10,
        feed: 'RAIN! The fire hisses...', mods: { heatDecay: 2.5, blowGain: 0.7, rain: 1 } },
      { id: 'gust', label: 'Cold gust', weight: 2,
        feed: 'A cold gust knocks the heat down!', action: { type: 'gust', heatLoss: 0.4 } },
      { id: 'scatterKindling', label: 'Scatter kindling', weight: 2,
        feed: 'The kindling pile scatters!', action: { type: 'scatterKindling' } },
      { id: 'weakSteel', label: 'Dull fire-steel', weight: 2, duration: 12,
        feed: 'The fire-steel goes dull - strike harder!', mods: { strikeSpeed: 1.6 } },
    ],
  },
};

// Weighted random draw. `rng` is any () => [0,1) function.
export function drawEffect(challengeId, kind, rng = Math.random) {
  const pool = EFFECTS[challengeId]?.[kind] || [];
  const total = pool.reduce((s, e) => s + (e.weight ?? 1), 0);
  let r = rng() * total;
  for (const e of pool) { r -= e.weight ?? 1; if (r <= 0) return e; }
  return pool[pool.length - 1];
}
