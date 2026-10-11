import test from 'node:test';
import assert from 'node:assert/strict';
import { STYLES, STYLE_KEYS, compose, composeLore, composeNeed, composePlay, composeRundown, createDirector, importanceOf, snapshotFacts } from './radio.js';
import { LORE } from './lore.js';
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

const sweep = (fn, n = 40) => Array.from({ length: n }, (_, i) => fn(() => i / n));

test('there is plenty of variety: many different reactions per style and mood', () => {
  STYLE_KEYS.forEach(k => {
    ['good', 'bad', 'mixed'].forEach(m => {
      const f = { hits: [hit('X', m === 'bad' ? 'opp' : 'mine', m === 'mixed' ? 0 : 5)] };
      const seen = new Set(sweep(r => composePlay(f, k, false, names, r)[2].text));
      assert.ok(seen.size >= 6, k + ' ' + m + ' only has ' + seen.size);
    });
  });
});

test('nothing outside the spicy roast contains profanity, and nothing ever contains strong language', () => {
  const MILD = /\b(damn\w*|hell|crap|ass)\b/i, STRONG = /\b(fuck\w*|shit\w*|bitch\w*|asshole|cunt|bastard|nigg\w*|fag\w*|retard\w*)\b/i;
  const { facts } = live();
  const segs = [
    ...[-5, 0, 5].flatMap(est => ['mine', 'opp'].map(side => ({ kind: 'play', facts: { badge: 'TD', text: 'x for 9 yards', hits: [hit('X', side, est)], impact: [{ name: 'A', wp: 0.2 }] } }))),
    { kind: 'rundown', facts }, { kind: 'need', facts: { league: facts.leagues[0] } }, { kind: 'rootcall', facts }, { kind: 'intro', facts },
    { kind: 'outro', facts: { ...facts, leagues: facts.leagues.map(l => ({ ...l, done: true })) } },
    { kind: 'lore', facts: { item: LORE[0], mention: [], relevant: true } }
  ];
  const said = (style, spicy) => segs.flatMap(sg => sweep(r => compose(sg, style, spicy, names, r).map(l => l.text).join(' '), 30)).join(' ');
  STYLE_KEYS.forEach(k => {
    assert.doesNotMatch(said(k, false), MILD, k);
    assert.doesNotMatch(said(k, true), STRONG, k);
    if (k !== 'roast') assert.doesNotMatch(said(k, true), MILD, k + ' spicy flag has no effect outside roast');
  });
});

test('stakes are worded for how the league stands', () => {
  const play = wp => composePlay({ text: 'x', hits: [hit('X', 'mine', 5)], impact: [{ name: 'Alpha', wp }] }, 'neutral', false, names, rnd)[3].text;
  assert.match(play(0.9), /clear favorite.*90/);
  assert.match(play(0.5), /close.*50/);
  assert.match(play(0.2), /underdog.*20/);
});

test('a flashback names your players when they are in the story, and the director tells each storyline once', () => {
  const lines = composeLore({ item: LORE.find(i => i.id === 'w4-car-det'), mention: ['Tetairoa McMillan'], relevant: true }, 'neutral', false, names, rnd);
  assert.match(lines[0].text, /14 passes for 192 yards/);
  assert.match(lines[1].text, /Tetairoa McMillan is in your leagues/);
  const f = { ...live().facts, week: 5, teams: ['LA'], names: ['puka nacua'] };
  const d = createDirector({ rundownEvery: 1e12, fillerEvery: 100 });
  const T = 1e6; const snap = { facts: f, live: 1 };
  d.next(T, snap);
  const kinds = []; const told = [];
  for (let i = 1; i <= 20; i++) { const sg = d.next(T + i * 200000, snap); if (sg) { kinds.push(sg.kind); if (sg.kind === 'lore') told.push(sg.facts.item.id); } }
  assert.ok(kinds.includes('lore'));
  assert.equal(new Set(told).size, told.length);                           // never the same storyline twice
  assert.equal(told[0], 'w4-lar-nacua');                                   // the first one is about a team and player you have
});

test('the need segment is phrased several ways', () => {
  const l = { name: 'Alpha', diff: -11, exp: -4, wp: 0.3, leftMine: 1, leftOpp: 0, helpers: ['Adams'], threats: [] };
  assert.ok(new Set(sweep(r => composeNeed({ league: l }, 'neutral', false, names, r).map(x => x.text).join('|'), 30)).size >= 6);
});

test('the root-for callout is not repeated every couple of minutes', () => {
  const d = createDirector({ rundownEvery: 1e12, fillerEvery: 100 });
  const snap = { facts: live().facts, live: 1 };
  const T = 1e6;
  d.next(T, snap);
  const kinds = [];
  for (let i = 1; i <= 12; i++) { const sg = d.next(T + i * 30000, snap); if (sg) kinds.push(sg.kind); }
  assert.ok(kinds.filter(k => k === 'rootcall').length <= 2, kinds.join(','));      // 6 minutes: at most twice
});
