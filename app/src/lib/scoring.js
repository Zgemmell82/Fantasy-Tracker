// Each league's own scoring rules, so play-by-play point swings match the league's totals instead of one default.
// Sleeper hands over scoring_settings; ESPN lists scoringItems by stat id. Anything a league doesn't say falls
// back to the usual defaults (half-PPR here is only the fallback when a league's reception scoring is unknown).

export const DEFAULT_RULES = { rec: 0.5, recYd: 0.1, recTd: 6, rushYd: 0.1, rushTd: 6, passYd: 0.04, passTd: 4, passInt: -2, fumLost: -2, teRec: 0 };

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pick = (obj, keys) => { for (const k of keys) { const v = num(obj[k]); if (v != null) return v; } return null; };

// Individual defensive players (IDP) are scored the same in every league: solo and assisted tackles, tackles for loss,
// passes defensed, sacks, interceptions, forced and recovered fumbles, and defensive touchdowns.
export const IDP_RULES = { solo: 1.5, ast: 0.75, tfl: 0.5, pd: 2, sack: 2.5, int: 5, ff: 4, fr: 3, td: 6 };
export const IDP_POSITIONS = new Set(['DL', 'DE', 'DT', 'LB', 'ILB', 'OLB', 'MLB', 'DB', 'CB', 'S', 'SS', 'FS', 'EDR', 'IDP']);
export const isIdp = pos => IDP_POSITIONS.has(String(pos || '').toUpperCase());

// Sleeper league.scoring_settings -> rules.
export function sleeperRules(s) {
  if (!s || typeof s !== 'object') return null;
  const r = { ...DEFAULT_RULES };
  const set = (key, val) => { if (val != null) r[key] = val; };
  set('rec', pick(s, ['rec'])); set('recYd', pick(s, ['rec_yd'])); set('recTd', pick(s, ['rec_td']));
  set('rushYd', pick(s, ['rush_yd'])); set('rushTd', pick(s, ['rush_td']));
  set('passYd', pick(s, ['pass_yd'])); set('passTd', pick(s, ['pass_td'])); set('passInt', pick(s, ['pass_int']));
  set('fumLost', pick(s, ['fum_lost'])); set('teRec', pick(s, ['bonus_rec_te']));
  return r;
}

// ESPN settings.scoringSettings.scoringItems -> rules. Stat ids: 3 pass yds, 4 pass TD, 20 INT, 24 rush yds,
// 25 rush TD, 42 rec yds, 43 rec TD, 53 receptions, 72 fumbles lost.
const ESPN_STAT = { 3: 'passYd', 4: 'passTd', 20: 'passInt', 24: 'rushYd', 25: 'rushTd', 42: 'recYd', 43: 'recTd', 53: 'rec', 72: 'fumLost' };
export function espnRules(items) {
  if (!Array.isArray(items) || !items.length) return null;
  const r = { ...DEFAULT_RULES };
  items.forEach(i => { const k = ESPN_STAT[i.statId]; if (k && num(i.points) != null) r[k] = i.points; });
  return r;
}

// Yahoo league settings -> rules. stat_modifiers lists { stat_id, value } pairs. Stat ids (from Yahoo's NFL stat table, not
// yet checked against a live league): 4 pass yds, 5 pass TD, 6 INT, 9 rush yds, 10 rush TD, 11 receptions, 12 rec yds,
// 13 rec TD, 18 fumbles lost. Totals shown in the app always come from Yahoo itself; these only price play-by-play estimates.
const YAHOO_STAT = { 4: 'passYd', 5: 'passTd', 6: 'passInt', 9: 'rushYd', 10: 'rushTd', 11: 'rec', 12: 'recYd', 13: 'recTd', 18: 'fumLost' };
export function yahooRules(stats) {
  if (!Array.isArray(stats) || !stats.length) return null;
  const r = { ...DEFAULT_RULES };
  let any = false;
  stats.forEach(s => {
    const k = YAHOO_STAT[Number(s && s.stat_id)];
    const v = parseFloat(s && s.value);
    if (k && Number.isFinite(v)) { r[k] = v; any = true; }
  });
  return any ? r : null;
}

// Standard / half / PPR, from reception points.
export const formatOf = rules => !rules ? undefined : rules.rec >= 0.9 ? 'ppr' : rules.rec >= 0.4 ? 'half' : 'std';

// The rules that apply to one position (tight ends can get a reception bonus).
export const rulesFor = (rules, pos) => {
  const r = rules || DEFAULT_RULES;
  return pos === 'TE' && r.teRec ? { ...r, rec: r.rec + r.teRec } : r;
};

// A league's saved "scoring" format picks defaults when we don't have its full rules (a manual choice under Source).
export const rulesFromFormat = f => ({ ...DEFAULT_RULES, rec: f === 'ppr' ? 1 : f === 'std' ? 0 : 0.5 });

// The rules to use for one league's lineup: its detected rules, with a format chosen under Source winning on receptions.
export function leagueRules(lineup, conn) {
  const l = lineup || {}, chosen = conn && conn.scoring;
  if (l.rules) return chosen ? { ...l.rules, rec: rulesFromFormat(chosen).rec } : l.rules;
  const fmt = chosen || l.scoring;
  return fmt ? rulesFromFormat(fmt) : undefined;
}
