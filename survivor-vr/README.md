# Survivor VR – party game prototype

Low-poly jungle/beach tiki party game. One player at a time is in the headset (stationary, hands/arms only);
everyone else plays on their phone. Three.js + optional WebXR, with a mouse/keyboard fallback for PC testing.

## Run it

```bash
cd survivor-vr
npm install
npm run dev          # http://localhost:5173
```

Open three pages (the dev server also relays messages between them over a WebSocket at `/relay`):

| Page | URL | Who |
|---|---|---|
| Host / headset | `/index.html` | the PC (or Quest browser). Challenge picker, host + debug panel, 3D scene |
| TV view | `/tv.html` | the TV: mirrored headset view, timer, anonymous effect feed, vote readout |
| Phone | `/phone.html` | each player's phone (use the LAN URL shown in the host panel, e.g. `http://192.168.x.x:5173/phone.html`) |

No phones handy? Either
- host panel → **+ Bot** and use the per-bot Help/Sabotage buttons, "Bots vote", "Skip run → random result"; or
- open `/phone.html?debug=1` – the ⚙ drawer lets one tab act as several fake players.

Without the relay (static hosting) the pages still sync between tabs of the same browser via BroadcastChannel.
`npm run build && npm run preview` serves a production build with the relay too.

## Playing a round
1. 3–6 players join (phones or bots). Host picks a challenge.
2. Each player takes a headset turn (random order): host/headset player clicks READY (or Enter) → 3-2-1 → run.
3. During a run every *other* phone gets **one** tap: HELP or SABOTAGE. The effect is a weighted random draw from that
   challenge's pool, anonymous (the TV feed and headset board only show the effect). Taps reset each run.
4. Best result wins immunity. Then **Tribal Council**: phones pick a player (not the immunity winner) + 1–2 sentences;
   the TV reads votes out one at a time, anonymously, in shuffled order. Most votes is "named" (set
   `eliminateVotedOut: true` in `config/game.js` to actually remove them). Next round → pick another challenge.

## Desktop controls
- **Tiki Hoops** – aim with the mouse, hold left-click to charge, release to shoot. (XR: grab ball with trigger, throw.)
- **Idol Endurance** – pick the idol hand (3D buttons). Mouse tilts the ball stick; WASD holds the idol up/steady.
  (XR: grip both controllers; point the stick controller up; idol hand must stay overhead.)
- **Jungle Jigsaw** – drag pieces; `R`/right-click rotates or un-flips. (XR: trigger grabs, A/B/grip twists.)
- **Tray Balance** – mouse tilts the tray. (XR: tilt the controller flat like a tray.)

## Config (all tweakable)
- `src/config/game.js` – player counts, timings, tap rules, vote limits, elimination, TV mirror settings
- `src/config/scoring.js` – per-challenge ranking direction, tie-break, DNF handling, result formatting
- `src/config/effects.js` – **help/sabotage pools** per challenge (weights, durations, timed `mods`, one-shot `action`s)
- `src/config/challenges.js` – distances, speeds, limits, physics numbers per challenge
- `src/config/meta.js` – names/blurbs shown in picker, TV and phones

Adding an effect is mostly data: add an entry to a pool. Timed `mods` multipliers are read inside a challenge via
`this.mod('key')`; one-shot `action: {type:'foo'}` calls `act_foo()` on the challenge.

## Layout
```
index.html tv.html phone.html     entry pages
server/relay-plugin.js            WebSocket relay + /__info (LAN IPs), a Vite plugin
src/host/                         game state machine (game.js), scene/XR/input (stage, hands, ui3d, hud, world), panel
src/host/challenges/              basketball, endurance, puzzle(+jigsaw), balance (cannon-es physics)
src/tv/ src/phone/ src/shared/    TV page, phone page, net/util/theme
```

## Notes / known limits
- **WebXR paths are written but untested on hardware** (no headset available when this was built). Desktop paths were
  exercised with a headless browser. Expect to tune XR throw velocity, stick calibration and tray orientation.
- Quest 1 budget: flat-shaded Lambert, instanced palms, no shadows, low-res canvas textures. The TV mirror re-renders the
  scene to a small render target and sends JPEGs (`GAME.tv`); lower `mirrorFpsInXR` or set `onMirror` off if it costs too much.
- Balance uses rigid-body physics, so stacks are chaotic: a motionless tray lasts only ~12–15 s with the default drop
  rate. Tune `dropInterval`, `blockSize`, `friction` in `challenges.js`. Endurance is easy for a perfect desktop player
  (it will hit the 240 s cap) – raise `idolDroopPerSecond`/`wobbleGrowth` to taste.
- Ties in a tribal vote = nobody named. Joining is only allowed between rounds.
