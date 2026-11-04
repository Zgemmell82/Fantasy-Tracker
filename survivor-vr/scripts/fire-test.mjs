// Headless checks for the standalone Fire Making mini game: node scripts/fire-test.mjs
// (1) the lightweight fire simulation behaves as designed, (2) the one-attempt-per-player state machine.
import { FIREGAME as C } from '../src/config/firegame.js';
import { FireSim } from '../src/host/firegame/sim.js';
import { FireGame } from '../src/host/firegame/state.js';
import { mulberry32 } from '../src/shared/util.js';

let bad = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) bad++; };

// scripted player: shave `curls`, strike with quality `q`, blow with blowFn, feed fuel every 3 s
function run({ curls = 5, q = 0.8, blowFn = () => 0, seed = 1, dryness = 0.85, feed = true, maxT = 200 }) {
  const s = new FireSim(C, mulberry32(seed)); const dt = 1 / 30; let t = 0, sparkAt = 0, lastFeed = -1; const pile = { ...C.pile };
  s.addTinder(curls, dryness);
  while (t < maxT && !s.snapped && !s.dead) {
    if (s.tinder.state === 'unlit' && t >= sparkAt) { s.spark(q); sparkAt = t + 0.3; }
    if (feed && s.lit && Math.floor(t / 3) !== lastFeed) {
      lastFeed = Math.floor(t / 3);
      if (s.fuels.filter((f) => !f.spent).length < 6 && s.H > 0.3) for (const ty of s.H < 1 ? ['twig', 'branch', 'log'] : ['branch', 'log', 'twig']) if (pile[ty] > 0) { s.addFuel(ty); pile[ty]--; break; }
    }
    s.step(dt, blowFn(s, t)); t += dt;
  }
  return { t, s };
}
const good = (s) => (s.lit ? (s.H < 0.9 ? 0.45 : 0.2) : 0);

let r = run({ blowFn: good });
ok(r.s.snapped && r.s.events.includes('snap'), `good play burns the rope (sim time ${r.t.toFixed(1)}s after tinder placed)`);
r = run({ curls: 2, blowFn: good, maxT: 60 }); ok(!r.s.lit, 'too little tinder (2 curls) will not catch');
r = run({ q: 0.25, blowFn: good, maxT: 60 }); ok(!r.s.lit, 'weak sparks do not light it');
r = run({ dryness: 0.3, blowFn: good }); const dry = run({ dryness: 0.9, blowFn: good }); ok(r.t > dry.t, 'damp tinder is slower than dry tinder');
r = run({ blowFn: () => 0 }); ok(r.s.dead && !r.s.snapped, 'no blowing: the fire dies (DNF)');
r = run({ blowFn: (s) => (s.lit && s.tinder.state === 'spent' ? 1 : 0) }); ok(r.s.dead, 'blowing hard on a weak ember snuffs it');
const smoth = new FireSim(C, mulberry32(3)); smoth.addTinder(11, 0.9); for (let i = 0; i < 20; i++) smoth.step(0.05, 0); ok(smoth.smother > 0.5 && smoth.O < 0.6, `too much tinder smothers (oxygen ${smoth.O.toFixed(2)})`);
const cold = new FireSim(C, mulberry32(4)); for (let i = 0; i < 300; i++) cold.step(0.05, 1); ok(!cold.lit && !cold.dead, 'blowing on an unlit pile does nothing / is not "dead"');
const rp = new FireSim(C, mulberry32(5)); rp.lit = true; rp.H = 1.4; rp.tip = 0; for (let i = 0; i < 20; i++) rp.step(0.05, 0); ok(rp.rope === 0 || rp.rope < 0.2, 'rope heat only fills while a hot flame reaches it');

// state machine: one attempt each, sorted live scoreboard, DNF last, play again
const log = []; const g = new FireGame({ prepare: (n) => log.push(n), begin: () => {} });
ok(g.setPlayers(99) === C.players.max && g.setPlayers(0) === C.players.default, 'player count is clamped');
g.start(3); g.update(C.upSeconds + 1); ok(g.phase === 'naming', 'up -> naming');
g.begin('  ABCDEFGHIJKLMNOP '); ok(g.current.name.length === 12, 'name capped at 12 chars');
g.finish({ value: 61.2 }); g.finish({ value: 5 }); ok(g.scoreboard().length === 1 && g.scoreboard()[0].time === 61.2, 'exactly one attempt: second finish ignored');
g.next(); g.begin('   '); ok(g.current.name === 'Player 2', 'blank name -> "Player 2"'); g.finish({ dnf: true, value: 20, reason: 'gave up' });
g.next(); g.begin('Zed'); g.finish({ value: 40.1 }); g.next();
ok(g.phase === 'final' && g.scoreboard().map((x) => x.name).join() === 'Zed,ABCDEFGHIJKL,Player 2' && g.scoreboard()[2].dnf, 'fastest first, DNF at the bottom');
ok(g.winner().name === 'Zed', 'fastest time wins'); g.playAgain(); ok(g.phase === 'up' && g.scoreboard().length === 0, 'play again resets');
process.exit(bad ? 1 : 0);
