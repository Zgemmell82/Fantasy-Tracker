import test from 'node:test';
import assert from 'node:assert/strict';
import { espnScoring } from './espn.js';

const league = pts => ({ settings: { scoringSettings: { scoringItems: [{ statId: 24, points: 0.1 }, { statId: 53, points: pts }] } } });
test('reads reception scoring from ESPN league settings', () => {
  assert.equal(espnScoring(league(1)), 'ppr');
  assert.equal(espnScoring(league(0.5)), 'half');
  assert.equal(espnScoring(league(0)), 'std');
  assert.equal(espnScoring({}), undefined);
  assert.equal(espnScoring({ settings: { scoringSettings: { scoringItems: [{ statId: 24, points: 0.1 }] } } }), undefined);
});
