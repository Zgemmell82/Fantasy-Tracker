import test from 'node:test';
import assert from 'node:assert/strict';
import { relevantPlay, effectOf, isInjuryText } from './relevance.js';

const hit = (side, est) => ({ uid: side + est, name: 'X', side, est, leagues: ['L'] });

test('green when it helps you, red when it hurts', () => {
  assert.equal(effectOf('mine', 6), 'help');
  assert.equal(effectOf('mine', -2), 'hurt');
  assert.equal(effectOf('opp', 6), 'hurt');
  assert.equal(effectOf('opp', -2), 'help');
});

test('keeps plays that score or lose points, drops plays that do nothing for your players', () => {
  const play = { text: 'J.Allen pass', type: '', hits: [hit('mine', 3.4), hit('opp', 0)] };
  const r = relevantPlay(play);
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].effect, 'help');
  assert.equal(relevantPlay({ text: 'A.Name punts 45 yards', type: 'Punt', hits: [hit('mine', 0)] }), null);
  assert.equal(relevantPlay({ text: 'kneels', type: '', hits: [] }), null);
});

test('keeps injuries to your players (bad) and to the players you face (good)', () => {
  assert.equal(isInjuryText('Timeout: C.McCaffrey is injured and helped off the field'), true);
  const r = relevantPlay({ text: 'Timeout: C.McCaffrey injured, helped off', type: 'Official Timeout', hits: [hit('mine', 0), hit('opp', 0)] });
  assert.deepEqual(r.hits.map(h => [h.side, h.injury, h.effect]), [['mine', true, 'hurt'], ['opp', true, 'help']]);
});

// End to end: ESPN-style play text -> matchPlays -> relevantPlay, from the user's side of each matchup.
import { matchPlays } from './pbp.js';
const tracked = [
  { uid: 'm1', name: 'Josh Allen', pos: 'QB', team: 'BUF', side: 'mine', leagues: ['A'] },
  { uid: 'm2', name: 'James Cook', pos: 'RB', team: 'BUF', side: 'mine', leagues: ['A'] },
  { uid: 'o1', name: 'Puka Nacua', pos: 'WR', team: 'LA', side: 'opp', leagues: ['A'] },
  { uid: 'o2', name: 'Kyren Williams', pos: 'RB', team: 'LA', side: 'opp', leagues: ['A'] }
];
const play = (text, extra = {}) => ({ id: '1', seq: 1, period: 1, clock: '10:00', text, type: '', scoring: false, scoredBy: '', offense: 'BUF', yards: null, ...extra });
const verdict = (p, uid) => { const r = relevantPlay(matchPlays([p], tracked)[0]); const h = r && r.hits.find(x => x.uid === uid); return h ? [h.effect, h.est > 0 ? '+' : h.est < 0 ? '-' : '0'] : null; };

test('my player scores: help. The opponent\'s player scores: hurt', () => {
  assert.deepEqual(verdict(play('J.Cook 12 yard rush for a TOUCHDOWN', { scoring: true, scoredBy: 'BUF', yards: 12 }), 'm2'), ['help', '+']);
  assert.deepEqual(verdict(play('P.Nacua 20 yard pass from M.Stafford for a TOUCHDOWN', { offense: 'LA', scoring: true, scoredBy: 'LA', yards: 20 }), 'o1'), ['hurt', '+']);
});

test('my player fumbles it away: hurt. The opponent\'s player does: help', () => {
  const lost = (who, off, rec) => play(who + ' rush up the middle for no gain. ' + who + ' FUMBLES, RECOVERED by ' + rec + '-D.Lineman at 40', { offense: off, yards: 0 });
  assert.deepEqual(verdict(lost('J.Cook', 'BUF', 'LA'), 'm2'), ['hurt', '-']);
  assert.deepEqual(verdict(lost('K.Williams', 'LA', 'BUF'), 'o2'), ['help', '-']);
});

test('defenses: the opponent\'s D/ST sacking my QB hurts; my D/ST doing it helps', () => {
  const t2 = [...tracked, { uid: 'od', name: 'Rams D/ST', pos: 'DEF', team: 'LA', side: 'opp', leagues: ['A'] }, { uid: 'md', name: 'Bills D/ST', pos: 'DEF', team: 'BUF', side: 'mine', leagues: ['A'] }];
  const sack = play('J.Allen sacked at BUF 20 for -8 yards (A.Donald)', { offense: 'BUF' });
  const r = relevantPlay(matchPlays([sack], t2)[0]);
  assert.deepEqual(r.hits.map(h => [h.uid, h.effect]), [['od', 'hurt']]);
  const sack2 = play('M.Stafford sacked at LA 20 for -8 yards (V.Epenesa)', { offense: 'LA' });
  assert.deepEqual(relevantPlay(matchPlays([sack2], t2)[0]).hits.map(h => [h.uid, h.effect]), [['md', 'help']]);
});

test('a play worth nothing to a player is neither help nor hurt', () => {
  assert.equal(effectOf('mine', 0, false), 'none');
  assert.equal(effectOf('opp', 0, false), 'none');
});
