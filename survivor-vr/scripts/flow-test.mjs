// Headless check of the whole game state machine (no browser): node scripts/flow-test.mjs
import { Game } from '../src/host/game.js';
const runner = { prepare() {}, start() {}, stop() {}, applyEffect() {} };
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const mk = (n) => { const g = new Game(runner); for (let i = 0; i < n; i++) g.addBot(); return g; };
const runAll = (g) => { let k = 0; while (['turnReady','countdown','running','handoff','turnResult'].includes(g.phase) && k++ < 500) {
  if (g.phase === 'turnResult') g.advanceFromResult(); else g.finishTurn({ value: 20 + Math.random() * 60, dnf: false, progress: 5 }); } };
const vote = (g, mode) => { const T = g.tribal; let i = 0; for (const v of T.voters) { const t = g.votableTargets(v); if (!t.length) continue;
  const tgt = mode === 'tie' ? t[i++ % Math.min(2, t.length)] : t[0]; g.submitVote(v, tgt.id, 'because.'); } };

// 11 players -> 6 / 5
let g = mk(11); g.startGame();
assert(g.twoTribes && g.members('A').length === 6 && g.members('B').length === 5, '11 players split 6/5');
g = mk(9); g.startGame(); assert(!g.twoTribes && g.merged && g.phase === 'picker', '9 players: one tribe');
// two tribes team episode
g = mk(10); g.startGame(); assert(g.phase === 'tribes', 'tribes phase'); g.next();
assert(g.pickable().join() === 'supply,rope', 'only relays pickable pre-merge');
assert(!g.startEpisode('basketball').ok, 'individual rejected pre-merge');
g.startEpisode('supply');
const first = g.run.group; let tapOk = 0, tapBad = 0;
g.beginTurn(); g.update(4); assert(g.phase === 'running', 'running');
const tp = g.tappers(); assert(tp.every((id) => g.player(id).tribe === first) && !tp.includes(g.headsetId) && tp.length === 4, 'tappers = playing tribe minus runner');
const watcher = g.players.find((p) => p.tribe !== first).id;
assert(!g.tap(watcher, 'help').ok, 'watching tribe cannot tap');
assert(g.tap(tp[0], 'sabotage').ok && !g.tap(tp[0], 'help').ok, 'one tap only (teammate sabotage allowed)');
g.update(2); g.finishTurn({ value: 10 }); assert(g.phase === 'handoff', 'handoff after teammate');
const c1 = g.relayTotal(); g.update(1); assert(g.relayTotal() > c1, 'relay clock keeps running in handoff');
assert(Object.keys(g.taps).length === 0, 'taps reset');
runAll(g);
assert(g.phase === 'roundResults' && g.team.losing && g.team.winning !== g.team.losing, 'team result: ' + JSON.stringify(Object.fromEntries(Object.entries(g.team.totals).map(([k, v]) => [k, v.total.toFixed(1)]))));
g.next(); assert(g.phase === 'voting' && g.tribal.voters.every((v) => g.player(v).tribe === g.team.losing), 'only losing tribe votes');
// tie -> revote -> tie -> unanimous -> draw
vote(g, 'tie'); g.update(2); g.update(0); g.startReadout(); g.skipReadout();
assert(g.phase === 'tie' && g.tribal.nextStage === 'revote', 'tie notice -> revote');
const tied = [...g.tribal.tied]; g.continueTie();
assert(g.phase === 'voting' && g.tribal.stage === 'revote' && g.tribal.targets.join() === tied.join() && g.tribal.voters.length === 5, 'revote: everyone votes, only for tied');
vote(g, 'tie'); g.startReadout(); g.skipReadout();
if (g.phase === 'tie') { assert(g.tribal.nextStage === 'unanimous', 'tied again -> unanimous'); g.continueTie();
  assert(g.phase === 'unanimous' && g.tribal.voters2.every((v) => !g.tribal.tied.includes(v)), 'tied players do not vote');
  const v2 = g.tribal.voters2; const target = g.tribal.tied[0];
  v2.forEach((v) => g.unanimousPick(v, target)); g.update(2); assert(g.phase === 'tribalResult' && g.tribal.result.eliminated === target && g.tribal.result.how === 'unanimous', 'unanimous resolves');
}
// deadlock draw
g = mk(10); g.startGame(); g.next(); g.startEpisode('rope'); runAll(g); g.next(); vote(g, 'tie'); g.startReadout(); g.skipReadout(); g.continueTie(); vote(g, 'tie'); g.startReadout(); g.skipReadout();
if (g.phase === 'tie') { g.continueTie(); g.tribal.voters2.forEach((v, i) => g.unanimousPick(v, g.tribal.tied[i % 2])); g.forceDeadlock();
  assert(g.phase === 'draw', 'deadlock -> draw'); const pool = g.tribal.draw.pool; assert(pool.every((id) => !g.tribal.tied.includes(id)), 'draw pool excludes tied: ' + pool.length);
  g.update(10); assert(g.phase === 'tribalResult' && pool.includes(g.tribal.result.eliminated), 'draw eliminates from pool'); assert(g.player(g.tribal.result.eliminated).status === 'out', 'pre-merge out (not juror)'); }
// merge at 8: 10 players -> 2 tribals
g = mk(10); g.startGame(); g.next();
for (let i = 0; i < 2; i++) { g.startEpisode(i ? 'rope' : 'supply'); runAll(g); g.next(); vote(g, 'first'); g.startReadout(); g.skipReadout(); if (g.phase === 'tie') { g.continueTie(); vote(g, 'first'); g.startReadout(); g.skipReadout(); } g.next(); }
assert(g.phase === 'merge' && g.merged && g.active.length === 8, 'merge at 8: ' + g.phase + ' ' + g.active.length);
g.next(); assert(g.phase === 'picker' && g.pickable().includes('basketball'), 'individual after merge');
// individual round: immunity cannot be voted
g.startEpisode('basketball'); runAll(g); assert(g.phase === 'roundResults' && g.immunityId, 'immunity'); g.next();
assert(!g.tribal.targets.includes(g.immunityId) && g.tribal.voters.length === 8, 'immunity protected');
vote(g, 'first'); g.startReadout(); g.skipReadout(); if (g.phase === 'tie') { g.continueTie(); vote(g, 'first'); g.startReadout(); g.skipReadout(); }
assert(g.phase === 'tribalResult' && g.player(g.tribal.result.eliminated).status === 'juror' && g.jurors.length === 1, 'post-merge elimination -> juror');
// drive to finale
g.next();
while (g.active.length > 3) { g.startEpisode('puzzle'); runAll(g); g.next(); vote(g, 'first'); g.startReadout(); g.skipReadout(); while (g.phase === 'tie') { g.continueTie(); if (g.phase==='voting') { vote(g, 'first'); g.startReadout(); g.skipReadout(); } else break; } g.next(); }
assert(g.phase === 'finaleIntro' && g.active.length === 3, 'finale at 3: ' + g.phase);
g.next(); let guard = 0;
while (guard++ < 100 && g.phase !== 'finaleImmunity') { if (['turnReady','countdown','running','handoff'].includes(g.phase)) g.finishTurn({ value: 10 + Math.random() * 100, dnf: false, progress: 5 }); else g.next(); }
assert(g.phase === 'finaleImmunity' && g.finale.rows.length === 4, 'finale 4 challenges scored');
const tot = Object.values(g.finale.points).reduce((a, b) => a + b, 0); assert(Math.abs(tot - 36) < 1e-9, 'points total 4*9=36, got ' + tot);
g.next(); assert(g.queue.length === 2 && !g.queue.some((q) => q.playerId === g.finale.immunityId), 'fire: the other two');
while (!['fireResult'].includes(g.phase)) { if (['turnReady','countdown','running','handoff'].includes(g.phase)) g.finishTurn({ value: 30 + Math.random() * 40, dnf: false }); else g.next(); }
assert(g.finale.finalists.length === 2 && g.finale.finalists.includes(g.finale.immunityId), 'finalists = immunity + fire winner');
g.next(); assert(g.phase === 'pitch', 'pitch'); g.nextPitch(); g.nextPitch(); assert(g.phase === 'jury', 'jury ' + g.jury.jurors.length);
g.jury.jurors.forEach((j) => g.submitJuryVote(j, g.finale.finalists[0])); g.update(2); assert(g.phase === 'juryReveal', 'reveal');
while (g.phase === 'juryReveal') g.nextJuryReveal();
assert(g.phase === 'winner' && g.winnerId === g.finale.finalists[0], 'winner crowned');
// finale tie splitting
import('../src/config/scoring.js').then(({ rankWithTies, placementPoints }) => {
  const res = { a: { value: 120 }, b: { value: 120 }, c: { value: 120 } };
  const pts = placementPoints(rankWithTies('endurance', res, ['a','b','c']), [5,3,1]); assert(pts.a === 3 && pts.b === 3 && pts.c === 3, 'all tie -> 3 each');
  const r2 = { a: { value: 120 }, b: { value: 120 }, c: { value: 50 } };
  const p2 = placementPoints(rankWithTies('endurance', r2, ['a','b','c']), [5,3,1]); assert(p2.a === 4 && p2.b === 4 && p2.c === 1, 'two tie for 1st -> 4,4,1');
});
