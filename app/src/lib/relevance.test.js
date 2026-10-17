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
