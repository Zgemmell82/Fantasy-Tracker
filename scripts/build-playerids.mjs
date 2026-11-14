// Builds app/public/playerids.json from the DynastyProcess player id table, so Yahoo players can be matched to the
// same Sleeper and ESPN ids the rest of the app uses. Runs in the deploy workflow (and nightly), never in the browser.
//   node scripts/build-playerids.mjs [output path]
// The table: https://github.com/dynastyprocess/data (files/db_playerids.csv). If it can't be downloaded the output is
// an empty map and the build carries on: the app then falls back to matching by name, team and position.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SOURCE = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv';

// A small CSV reader: quoted fields, "" escapes, commas and newlines inside quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); field = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const clean = v => (v == null || v === 'NA' ? '' : String(v).trim());

// -> { [yahoo_id]: [sleeper_id, espn_id, name, team, position] } for players that have a Yahoo id and a current team.
export function buildMap(csv) {
  const [head, ...rows] = parseCsv(csv);
  const at = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  for (const need of ['yahoo_id', 'name']) if (!(need in at)) throw new Error('The player id table has no "' + need + '" column.');
  const out = {};
  for (const r of rows) {
    const yid = clean(r[at.yahoo_id]);
    if (!yid) continue;
    const team = clean(r[at.team]);
    if (!team || team === 'FA') continue;
    out[yid] = [clean(r[at.sleeper_id]), clean(r[at.espn_id]), clean(r[at.name]), team, clean(r[at.position])];
  }
  return out;
}

async function main() {
  const file = process.argv[2] || new URL('../app/public/playerids.json', import.meta.url).pathname;
  let map = {};
  try {
    const r = await fetch(SOURCE);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    map = buildMap(await r.text());
    console.log('playerids: ' + Object.keys(map).length + ' players with a Yahoo id');
  } catch (e) {
    console.warn('playerids: could not build the table (' + e.message + '); the app will match Yahoo players by name instead.');
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ at: Date.now(), source: SOURCE, map }));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
