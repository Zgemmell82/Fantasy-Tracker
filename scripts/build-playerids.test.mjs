import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMap, parseCsv } from './build-playerids.mjs';

const csv = [
  'mfl_id,sleeper_id,espn_id,yahoo_id,name,position,team',
  '1,4046,3139477,30121,"Mahomes, Patrick",QB,KC',
  '2,NA,NA,NA,No Yahoo Guy,WR,DAL',
  '3,7525,4430878,31883,"Quote ""Q"" Name",WR,FA',
  '4,9221,4567048,40012,Ja\'Tavion Sanders,TE,CAR',
  ''
].join('\n');

test('reads quoted fields, commas inside names and escaped quotes', () => {
  const rows = parseCsv(csv);
  assert.equal(rows[1][4], 'Mahomes, Patrick');
  assert.equal(rows[3][4], 'Quote "Q" Name');
});

test('keeps players that have a Yahoo id and a team, keyed by Yahoo id', () => {
  const map = buildMap(csv);
  assert.deepEqual(Object.keys(map).sort(), ['30121', '40012']);          // no yahoo id, or a free agent: dropped
  assert.deepEqual(map['30121'], ['4046', '3139477', 'Mahomes, Patrick', 'KC', 'QB']);
});

test('says so when the table has changed shape', () => {
  assert.throws(() => buildMap('a,b\n1,2'), /yahoo_id/);
});
