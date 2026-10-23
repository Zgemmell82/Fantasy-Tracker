import test from 'node:test';
import assert from 'node:assert/strict';
import { gamesLeft, pathToVictory, pathsFor } from './pathfacts.js';

const x = (name, who, f = 0.5, pts = 5) => ({ p: { name, pos: 'WR', team: 'LA', pts }, who, f, game: null });
const o = (me, them, mine, opp, extra = {}) => ({ name: 'L', me, them, mine, opp, approx: false, ...extra });

test('the drill opens when two games or fewer are left', () => {
  assert.equal(gamesLeft(5, {}, Date.parse('2026-10-06T12:00:00Z')).open, false);     // week not started
  assert.equal(gamesLeft(5, {}, Date.parse('2026-10-11T18:00:00Z')).open, false);     // Sunday afternoon: many left
  assert.equal(gamesLeft(5, {}, Date.parse('2026-10-12T14:00:00Z')).left, 1);         // Monday morning: just Monday night
  assert.equal(gamesLeft(5, {}, Date.parse('2026-10-12T14:00:00Z')).open, true);
});

test('two players against one: the margin they have to beat', () => {
  const p = pathToVictory(o(70, 82.4, [x('Brock Purdy', 'mine'), x('Cooper Kupp', 'mine')], [x('Davante Adams', 'opp')]));
  assert.equal(p.headline, 'Purdy and Kupp need to outscore Adams by more than 12.4 points for you to win.');
  assert.equal(p.margin, 12.4);
});

test('ahead, behind, tied and finished', () => {
  assert.match(pathToVictory(o(90, 80, [x('Kupp', 'mine')], [x('Adams', 'opp'), x('Corum', 'opp')])).headline, /^You lead by 10\. You win as long as Adams and Corum do not outscore Kupp by 10 or more\.$/);
  assert.match(pathToVictory(o(80, 80, [x('Kupp', 'mine')], [x('Adams', 'opp')])).headline, /^Tied\. Kupp just needs to outscore Adams\.$/);
  assert.equal(pathToVictory(o(100, 90, [], [])).headline, 'Final. You won by 10.');
  assert.equal(pathToVictory(o(90, 100, [], [])).state, 'final');
});

test('when one side has nobody left', () => {
  const done = pathToVictory(o(70, 81, [x('Purdy', 'mine'), x('Kupp', 'mine')], []));
  assert.equal(done.headline, 'They are done at 81. Purdy and Kupp need more than 11 points combined to win.');
  assert.equal(pathToVictory(o(90, 81, [x('Kupp', 'mine')], [])).state, 'won');
  assert.match(pathToVictory(o(90, 81, [], [x('Adams', 'opp')])).headline, /^You are done at 90 and lead by 9\. You win unless Adams scores 9 or more combined\.$/);
  assert.equal(pathToVictory(o(70, 81, [], [x('Adams', 'opp')])).state, 'lost');
});

test('players already finished are not "left"; no-score leagues are skipped; open leagues sort first', () => {
  const p = pathToVictory(o(70, 82, [x('Done', 'mine', 0), x('Kupp', 'mine')], [x('Adams', 'opp')]));
  assert.equal(p.mine.length, 1);
  const list = pathsFor([o(100, 90, [], [], { name: 'Final' }), o(70, 82, [x('K', 'mine')], [x('A', 'opp')], { name: 'Open' }), o(0, 0, [], [], { name: 'Hand', approx: true })]);
  assert.deepEqual(list.map(v => v.name), ['Open', 'Final']);
});
