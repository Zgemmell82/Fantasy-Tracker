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
| TV view | `/tv.html?room=CODE` | the TV: mirrored headset view, timer, anonymous effect feed, vote readout |
| Phone | `/phone.html` (+ room code) – campaign only | each player's phone (use the LAN URL shown in the host panel, e.g. `http://192.168.x.x:5173/phone.html`) |

No phones handy (Survivor campaign)? Either
- host panel → **+ Bot** / **+ 5 Bots**, then the Debug panel (Jump to any phase, Bots tap/vote, Skip run); or
- open `/phone.html?room=CODE&debug=1` – the ⚙ drawer lets one tab act as several fake players.
The room code is shown in the host panel and on the TV; the host page keeps its code across reloads (`?room=ABCD` to force one).

Without the relay (static hosting) the pages still sync between tabs of the same browser via BroadcastChannel.
`npm run build && npm run preview` serves a production build with the relay too.

## Main menu

The host page opens on a **main menu** (the TV shows "Main menu" and the room code):

- **🏝️ Survivor Campaign** – the full party game below (phones + headset + TV).
- **🔥 Fire Making** – a standalone mini game, **headset + TV only** (phones show "no phones needed"; no help/sabotage taps).

Every host panel has a **☰ Main menu** button. (Automation/console: `window.__app.setMode('menu'|'campaign'|'fire')`.)

## 🔥 Fire Making (standalone mini game)

**Flow.** Menu → Fire Making → enter the number of players (1–12, `config/firegame.js → players`) → **Start**. For each player:
the TV says **"Player N, you're up."** → they put on the headset and type their own name on the **virtual keyboard**
(max 12 chars, blank = "Player N"; on desktop you can also type on your keyboard) → **BEGIN!** starts the clock. **One attempt, no retries.**
The clock stops the instant the flag rises. Fire dies / they tap **GIVE UP** twice / the safety time limit hits → **DNF**.
After every run the name + time go on the **live TV scoreboard** (fastest first, DNFs at the bottom). After the last player the TV
crowns the fastest time, and the host chooses **Play Again** or **Back to Menu**.

**The challenge** (stationary, hands/arms only). A fire pit holds twigs, branches and a log; beside it: a branch to shave, a knife, a flint,
extra fuel. A rope hangs over the fire holding a flag down.

1. **Prepare fuel** – shave tinder curls off the branch with the knife (move the knife quickly along it), then drop the right
   amount of curls into the nest on the fuel. Too little (<~3 curls) won't catch; too much smothers the fire.
2. **Ignite** – strike the flint against the knife over the nest. Spark quality = strike speed × angle (a slanted scrape is best) and
   sparks must land on dry tinder. *Desktop:* grab the knife and flick the mouse quickly over the nest (the flint is implied).
3. **Grow the fire** – blow on the ember. If the headset mic works (host panel **enable mic**, or automatic on Start – it needs the click), blowing
   into the mic feeds oxygen; otherwise it falls back to **fanning with a controller** (waving either hand over the fire). *Desktop:* hold
   **Space** / right mouse, or flick the mouse when not holding anything. Blowing too hard on a weak ember snuffs it. Fuel burns down –
   drag more twigs/branches/logs from the pile onto the fire.
4. **Win** – when the flame is tall and hot enough it fills the rope's heat buffer; the rope snaps, the flag pops up, the clock stops.

**Simulation** (`src/host/firegame/sim.js`, no fluid physics): each fuel piece has heat value, moisture, burn rate and ignition
temperature; the flame has heat and oxygen levels; tinder has an amount/dryness; the rope has a heat buffer that fills only while a hot flame
tip reaches it. Rendering (particle flame, ember glow, sparks, glowing rope) is layered over those numbers. **Every tuning value is in
`src/config/firegame.js`** (fuel stats, tinder window, spark speed/angle, shave speed, oxygen/blow thresholds incl. mic and fan ranges, rope capacity/heat rate,
fail condition, player limits, name length, time limit).

**Test it without a headset.** Open `/index.html` → Fire Making, `/tv.html?room=CODE` for the TV. The host **Debug panel** has: *Jump* to
any state (setup / up / naming / running / result / mid-game scoreboard / final / everyone-DNF), *Auto name + begin*, **Autopilot (good)** and
**Autopilot (blows wrong → DNF)**, *Place 5 tinder*, *Spark*, *Blow 50%*, *+twig/+branch/+log*, *Force rope snap*, *Kill fire*, a **speed ×1/2/4**
selector, and a live readout of heat / oxygen / tinder / fuel states / rope buffer. Headless checks: `npm run test:fire`
(`scripts/fire-test.mjs`: sim behaviour + one-attempt state machine); `npm test` runs these plus the campaign flow test.
The mic path and XR grabbing (knife + flint in two hands, controller fanning) have **not been tried on a Quest 1** – thresholds are in config.

## The full game

```
lobby ─► (10+ players: tribes) ─► picker ─► episode ─► results ─► tribal ─► (merge at 8) ─► picker …
                                                                              │ 3 left
                                                                              ▼
 finale: 4 individual challenges (5/3/1 pts) ─► immunity ─► fire-making (other two) ─► pitches ─► jury vote ─► winner
```

**Lobby / room code** – the TV (`/tv.html?room=CODE`) shows a 4-letter room code. Phones open `/phone.html`, type the code and a
name. The host panel shows the code and ready-made links. (Each code is its own relay room, so several games can share a server.)

**Tribes** – fewer than 10 players: one tribe, no merge, every episode is individual. 10+ players: two tribes, split as evenly as
possible (11 → 6 + 5; the extra goes to tribe Tiki). One headset: only one tribe plays at a time, the other watches the TV view and
gets **no taps**.

**Taps (every phase)** – each phone of the *active* tribe gets exactly one tap per headset run, HELP or SABOTAGE; the effect is a
weighted random draw from that challenge's pool (`config/effects.js`), anonymous, reset every run. In relays, sabotaging your own
teammate is allowed. Post-merge/finale: everyone still in the game except the runner can tap; jurors and eliminated players cannot.

**Team phase (two tribes)** – relay challenges, finish-based: **Supply Sort** and **Tangled Rope**. Each member takes a headset
turn; the tribe clock keeps running through a short handoff (`GAME.relay.handoffSeconds`), and tribe total time (plus a penalty for
any teammate who times out) is the score. Lowest wins; the losing tribe goes to tribal, the winners are safe.

**Merge** – when 8 players remain the tribes merge: individual challenges, individual immunity (the winner cannot be voted for),
tribal vote.

**Tribal vote** – phones pick a player + 1–2 sentences. The TV reads votes one at a time, shuffled and anonymous.
Tie → **revote** where *everyone* votes (tied players included) but only for the tied players. Tied again → the tribe must reach a
**unanimous decision with the tied players not voting** (phones: pick one of the tied players; resolves the moment all agree,
`GAME.vote.unanimousSeconds` limit or host "deadlock"). No agreement → **random draw** among the players who received no votes,
equal chance each.

**Jury** – players voted out after the merge (and the fire-making loser) become jurors; they keep using their phones for the
final jury vote. Pre-merge eliminations are simply out.

**Finale (3 left)** – each plays all four individual challenges. Endurance and balance are capped at 2 min
(`GAME.finale.holdCapSeconds`); players who survive the cap tie and split the points (also true for any exact tie). Points 5/3/1.
Highest total wins immunity; tiebreakers: best single placement, then fastest basketball time. The other two play the stationary
**Fire Making** challenge one at a time (faster wins): strike the fire-steel, then feed the ember with kindling in stages (twigs →
sticks → logs) while blowing/fanning keeps the heat bar above each stage's threshold. The fire winner + immunity winner are the
finalists; each pitches for `GAME.finale.pitchSeconds` on the TV, then jurors vote on their phones; results are revealed on the TV
and the winner is crowned. (Jury tie → `GAME.finale.jury.tieBreak`.)

**Fire input** – if the Quest browser allows microphone access, press **"Enable mic for blowing"** in the host panel *before*
entering VR and blow on the headset mic. Otherwise it falls back to hands-only fanning (waving the controllers; mouse flicks on
desktop). Striking = fast controller (or mouse) strokes. The mic path is untested on a Quest 1 – thresholds are in `config/challenges.js → fire`.

## Run / test each phase (debug panel)

The host panel's **Debug panel** has a **Jump** dropdown that builds a real game state and lands you on any phase, plus buttons
for "Bots tap", "Bots vote", "Bots vote (force tie)", "Bots agree / disagree", "Bots jury vote", "Skip run → random result",
"Run all remaining", "Skip readout". Handy recipes (open `/index.html`, then `/tv.html?room=CODE` and optionally
`/phone.html?room=CODE&debug=1`):

| To see… | Do this |
|---|---|
| Lobby, room code, joining | Jump → *Lobby*, or open a phone and join with the code |
| Two tribes / 11 = 6+5 | Lobby → set 11 in the count box → *Tribes revealed* |
| Relay + watching tribe (no taps) | Jump → *Team relay: first runner ready* → Begin → Bots tap (only the playing tribe's phones are enabled) |
| Relay clock through a handoff | Begin a relay, **Skip run → random** → the next teammate appears in *handoff* while the tribe clock keeps running |
| Losing-tribe tribal | Jump → *Team tribal* → **Bots vote** → Read the votes |
| Tie → revote → unanimous → draw | Jump → *Tribal: tie notice* / *revote* / *unanimous* / *random draw* (or in a vote: **Bots vote (force tie)** then Continue; in the unanimous stage **Bots agree** or **Bots disagree** + *Declare deadlock*) |
| Merge | Jump → *Merge (8 players left)* |
| Individual round + immunity | Jump → *Individual challenge* / *Individual results* / *Individual tribal vote* |
| Finale / points / tiebreak | Jump → *Finale intro*, *first challenge scores*, *immunity winner* |
| Fire-making | Jump → *Fire-making: first runner* → Begin |
| Pitches, jury, winner | Jump → *Finalist pitches* → *Jury voting* (**Bots jury vote**) → *Jury vote reveal* → *Winner* |

Phones: `/phone.html?room=CODE&debug=1` – the ⚙ drawer lets one tab act as many fake players (**+ Add fake player**, **+5**,
**Random tap (all)**, **Auto-vote / pick / jury (all)**) and a dropdown switches which player you are viewing, so you can check
the watching tribe vs the playing tribe, the losing tribe's voting screen, jurors' screens, etc.

`npm run test:flow` runs 30+ headless checks of the state machine (tribe split, taps, relay clock, tie-breaks, merge, finale scoring, jury).

Pure game-logic checks (no browser): the state machine in `src/host/game.js` has no DOM/three.js imports, so it can be driven
from Node with a stub runner.

## Config (all tweakable)
- `src/config/game.js` – player counts, tribe split/merge/finale thresholds, relay + vote + tie-break timings, finale points/caps/pitch time, TV mirror
- `src/config/scoring.js` – per-challenge ranking direction, tie-break, DNF handling, tie-splitting + placement points
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
src/host/challenges/              individual: basketball, endurance, puzzle(+jigsaw), balance (cannon-es);
                                  relays: supply, rope; finale: fire (grab.js = shared pick-up helper)
src/host/debug.js, mic.js         phase-jump + bot helpers, optional microphone blow detector
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
- Joining is only possible in the lobby (before the game starts). A 3-player lobby goes straight to the finale.
- Relay/fire/finale challenges are tuned for a scripted "perfect" player in a headless browser; expect to retune
  (`config/challenges.js`, `config/effects.js`) after real play. Fire-making and the new relays have not been played in a headset.
