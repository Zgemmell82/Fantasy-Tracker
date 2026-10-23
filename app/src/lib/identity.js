// One player, one record: the same person is named differently across sites ("Luther Burden III" on ESPN, "Luther
// Burden" on Sleeper, "D.J. Moore" vs "DJ Moore", accents, Jr./Sr.), so players are matched on a normalized name
// plus their team, never on the raw display name.
import { normTeam } from './teams.js';

const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b\.?/g;

export const nameId = name => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(SUFFIX, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

export const playerKey = (name, team) => normTeam(team) + '|' + nameId(name);
