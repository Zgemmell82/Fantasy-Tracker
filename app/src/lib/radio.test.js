import test from 'node:test';
import assert from 'node:assert/strict';
import { STYLES, STYLE_KEYS, compose, composePlay, composeRundown, createDirector, importanceOf, snapshotFacts } from './radio.js';
import { hotRoute } from './hotroute.js';

const rnd = () => 0;
const names = ['A', 'B'];
const hit = (name, side, est, leagues = ['Alpha'], role = 'receiver') => ({ name, side, est, leagues, role });

test('every style has two hosts and a full set of reactions', () => {
  assert.deepEqual(STYLE_KEYS.sort(), ['hype', 'neutral', 'optimistic', 'pessimistic', 'roast', 'supportive']);
  STYLE_KEYS.forEach(k => {
    assert.equal(STYLES[k].hosts.length, 2);
    ['good', 'bad', 'mixed'].forEach(m => assert.ok(compose({ kind: 'play', facts: { hits: [hit('X', m === 'bad' ? 'opp' : 'mine', m === 'mixed' ? 0 : 5)] } }, k, false, names, rnd).length >= 3, k + ' ' + m));
  });
});

test('a play helps or hurts depending on whose side the player is on', () => {
  const good = composePlay({ text: 'J.Hurts pass to D.Smith for 12 yards', hits: [hit('Devonta Smith', 'mine', 4)] }, 'neutral', false, names, rnd);
  assert.match(good[1].text, /yours/); assert.match(good[1].text, /helps you/);
  const bad = composePlay({ text: 'x', hits: [hit('Devonta Smith', 'opp', 4, ['Beta'])] }, 'neutral', false, names, rnd);
  assert.match(bad[1].text, /other side in Beta/); assert.match(bad[1].text, /hurts you/);
  const mixed = composePlay({ text: 'x', hits: [hit('P', 'mine', 4, ['A']), hit('P', 'opp', 4, ['B'])] }, 'neutral', false, names, rnd);
  assert.match(mixed[1].text, /yours in A and on the other side in B/);
  assert.match(mixed[1].text, /helps you in A and hurts you in B/);
  const flip = composePlay({ text: 'x', hits: [hit('P', 'mine', -3, ['A']), hit('P', 'opp', -3, ['B'])] }, 'neutral', false, names, rnd);
  assert.match(flip[1].text, /hurts you in A and helps you in B/);
});

test('touchdowns and interceptions are described, and the league odds are mentioned when given', () => {
  const td = composePlay({ badge: 'TD', text: 'x', hits: [hit('Star', 'mine', 7.2, ['Alpha'], 'rusher')], impact: [{ name: 'Alpha', wp: 0.62 }] }, 'hype', false, names, rnd);
  assert.match(td[0].text, /end zone/);
  assert.match(td[3].text, /62 percent/);
  const int = composePlay({ badge: 'INT', text: 'x', hits: [hit('QB', 'mine', -2, ['Alpha'], 'passer')] }, 'pessimistic', false, names, rnd);
  assert.match(int[0].text, /interception/); assert.match(int[1].text, /hurts you/);
});

test('the roast style only gets spicier when asked', () => {
  const f = { hits: [hit('X', 'mine', -4, ['Alpha'], 'passer')] };
  const mild = Array.from({ length: 12 }, (_, i) => composePlay(f, 'roast', false, names, () => i / 12)[2].text).join(' ');
  const spicy = Array.from({ length: 12 }, (_, i) => composePlay(f, 'roast', true, names, () => i / 12)[2].text).join(' ');
  assert.doesNotMatch(mild, /damn|hell|dumpster/i);
  assert.match(spicy, /dumpster|Hell|cry for help/i);
});

test('the rundown reads scores and win chances and the root-for list', () => {
  const lines = composeRundown({ leagues: [{ name: 'Alpha', you: 70, them: 81, wp: 0.5 }, { name: 'Beta', you: 150, them: 70, wp: 1 }], rootFor: ['Adams'], rootAgainst: ['Corum'] }, 'neutral', false, names, rnd);
  assert.match(lines[1].text, /Alpha it is 70 to 81, and you are at 50 percent/);
  assert.match(lines[1].text, /Beta it is 150 to 70/);
  assert.match(lines[3].text, /Root for Adams/); assert.match(lines[3].text, /Corum/);
});

const MON = Date.parse('2026-10-12T14:00:00Z');
const star = { name: 'Star Wideout', pos: 'WR', team: 'LA' };
const live = () => {
  const hr = hotRoute(5, { Alpha: { mine: [star], opp: [], score: { mine: 70, opp: 81 } } }, ['Alpha'], {}, MON);
  return { hr, facts: snapshotFacts(hr, 5, 1) };
};

test('snapshot facts name the players who can swing each league', () => {
  const { facts } = live();
  assert.equal(facts.leagues[0].name, 'Alpha');
  assert.deepEqual(facts.leagues[0].helpers, ['Star Wideout']);
  assert.deepEqual(facts.rootFor, ['Star Wideout']);
  assert.equal(facts.over, false);
});

test('the director opens with an intro, then plays, then rundowns and fillers, and signs off when everything is over', () => {
  const T = 1e6;                                                           // real clocks are large numbers
  const d = createDirector({ rundownEvery: 1000, fillerEvery: 400 });
  const { facts } = live();
  const snap = { facts, live: 1 };
  assert.equal(d.next(T, snap).kind, 'intro');
  assert.equal(d.next(T + 100, snap), null);                               // nothing yet
  d.pushPlay({ key: 'g:1', importance: 3, facts: { hits: [hit('X', 'mine', 5)] }, at: T + 150 });
  d.pushPlay({ key: 'g:1', importance: 3, facts: {}, at: T + 160 });      // same play twice is one play
  assert.equal(d.next(T + 200, snap).kind, 'play');
  assert.equal(d.next(T + 250, snap), null);
  assert.equal(d.next(T + 600, snap).kind, 'need');                       // filler: what has to happen
  assert.equal(d.next(T + 1100, snap).kind, 'rundown');
  const over = { facts: { ...facts, over: true }, live: 0 };
  assert.equal(d.next(T + 1200, over).kind, 'outro');
  assert.equal(d.next(T + 1300, over), null);                              // and then it stops
  assert.equal(d.ended, true);
});

test('big plays go first, stale ones are dropped, and minor plays wait their turn', () => {
  const d = createDirector({ rundownEvery: 1e9, fillerEvery: 1e9, maxAge: 1000 });
  const snap = { facts: live().facts, live: 1 };
  d.next(0, snap);
  d.pushPlay({ key: 'a', importance: 1, facts: { hits: [hit('Minor', 'mine', 1)] }, at: 10 });
  d.pushPlay({ key: 'b', importance: 3, facts: { hits: [hit('Major', 'mine', 7)] }, at: 20 });
  assert.equal(d.next(30, snap).facts.hits[0].name, 'Major');
  assert.equal(d.next(40, snap), null);                                    // minor one waits for a quiet moment
  assert.equal(d.next(30000, snap), null);                                 // and is dropped once stale
});

test('importance follows the badge and the size of the swing', () => {
  assert.equal(importanceOf({ badge: 'TD', hits: [hit('x', 'mine', 1)] }), 3);
  assert.equal(importanceOf({ badge: 'FG', hits: [hit('x', 'mine', 1)] }), 2);
  assert.equal(importanceOf({ badge: '', hits: [hit('x', 'mine', 3.5)] }), 2);
  assert.equal(importanceOf({ badge: '', hits: [hit('x', 'mine', 0.5)] }), 1);
});
