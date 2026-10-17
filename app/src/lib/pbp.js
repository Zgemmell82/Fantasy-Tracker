// Play-by-play from ESPN's public NFL game data, matched to the starters tracked in the app.
import { SEASON } from './season.js';
import { SCHEDULE_ALL } from '../data.js';
import { normTeam } from './teams.js';
import { DEFAULT_RULES, rulesFor } from './scoring.js';

const SITE = 'https://site.api.espn.com';
const NFL = '/apis/site/v2/sports/football/nfl/';

// Reads ESPN's game data directly; if the browser is blocked, retries through the ESPN helper.
async function siteJson(path, helper) {
  try {
    const r = await fetch(SITE + path);
    if (!r.ok) throw new Error('ESPN ' + r.status);
    return await r.json();
  } catch (e) {
    if (!helper || e.name !== 'TypeError') throw new Error(e.name === 'TypeError' ? 'Couldn\'t reach ESPN for play-by-play.' : e.message);
    const r = await fetch(String(helper).trim().replace(/\/+$/, '') + path);
    if (!r.ok) throw new Error('ESPN helper ' + r.status);
    return r.json();
  }
}

// ── Scoreboard: live score, clock and ESPN game id for every game of a week ──
export function parseScoreboard(j) {
  const out = {};
  (j && j.events || []).forEach(ev => {
    const comp = (ev.competitions || [])[0] || {};
    const cs = comp.competitors || [];
    const home = cs.find(c => c.homeAway === 'home'), away = cs.find(c => c.homeAway === 'away');
    if (!home || !away) return;
    const abbr = c => normTeam(c.team && c.team.abbreviation);
    const st = (comp.status || ev.status || {});
    const type = st.type || {};
    const sit = comp.situation || {};
    const teamIds = {};
    cs.forEach(c => { if (c.team) teamIds[c.team.id] = abbr(c); });
    out[abbr(away) + '@' + abbr(home)] = {
      id: ev.id,
      state: type.state || 'pre',                // pre | in | post
      detail: type.shortDetail || type.detail || '',
      period: Number(st.period) || 0,                 // 1-4, 5 = overtime
      clock: typeof st.clock === 'number' ? st.clock : null,   // seconds left in the period
      away: abbr(away), home: abbr(home),
      awayScore: away.score != null ? Number(away.score) : null,
      homeScore: home.score != null ? Number(home.score) : null,
      down: sit.downDistanceText || sit.shortDownDistanceText || '',
      possession: sit.possession ? teamIds[sit.possession] || '' : '',
      redZone: !!sit.isRedZone,
      teamIds
    };
  });
  return out;
}

// Finds a game on the scoreboard by the schedule's "away@home" key. International and neutral-site games can list
// home and away the other way round, so a swapped match counts too (with its teams and scores turned around).
export function boardFor(board, key) {
  if (!board) return undefined;
  if (board[key]) return board[key];
  const [a, h] = String(key).split('@');
  const r = board[h + '@' + a];
  return r ? { ...r, away: r.home, home: r.away, awayScore: r.homeScore, homeScore: r.awayScore, swapped: true } : undefined;
}

// How long to wait before asking the scoreboard again, or null once the whole week is over.
// It keeps checking even when nothing is live yet, so a game that kicks off later is noticed.
export function nextPollMs(board, week, now = Date.now()) {
  const games = SCHEDULE_ALL.filter(g => g.w === week);
  if (Object.values(board || {}).some(g => g.state === 'in')) return 30000;
  const start = g => Date.parse(g.t);
  if (games.every(g => now > start(g) + 5 * 3600000)) return null;                       // the week is over
  const stateOf = g => { const i = boardFor(board, g.a + '@' + g.h); return i && i.state; };
  if (games.some(g => now > start(g) - 20 * 60000 && now < start(g) + 4 * 3600000 && stateOf(g) !== 'post')) return 30000;   // starting or just started
  const next = Math.min(...games.filter(g => start(g) > now).map(start));
  return next - now < 6 * 3600000 ? 60000 : 300000;
}

// Adds games that a second scoreboard knows about and the first one doesn't.
export function mergeBoards(base, extra) {
  const out = { ...base };
  Object.entries(extra || {}).forEach(([k, v]) => {
    const [a, h] = k.split('@');
    if (!out[k] && !out[h + '@' + a]) out[k] = v;
  });
  return out;
}

const ymd = ms => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  return p.replace(/-/g, '');
};

export async function fetchScoreboard(week, helper, now = Date.now()) {
  let board = parseScoreboard(await siteJson(NFL + 'scoreboard?seasontype=2&week=' + week + '&dates=' + SEASON, helper));
  // A game that should be on today but isn't in the week's list (it can be filed differently): ask for that date directly.
  const missing = SCHEDULE_ALL.filter(g => g.w === week && Math.abs(Date.parse(g.t) - now) < 20 * 3600000 && !boardFor(board, g.a + '@' + g.h));
  if (missing.length) {
    const days = [...new Set(missing.map(g => ymd(Date.parse(g.t))))];
    for (const d of days) {
      try { board = mergeBoards(board, parseScoreboard(await siteJson(NFL + 'scoreboard?dates=' + d, helper))); } catch (e) { /* the week's list still stands */ }
    }
  }
  return board;
}

// ── Game summary → flat list of plays, oldest first ──
export function parsePlays(summary) {
  const comp = (summary && summary.header && summary.header.competitions || [])[0] || {};
  const teamIds = {};
  let homeId = null;
  (comp.competitors || []).forEach(c => {
    if (!c.team) return;
    teamIds[c.team.id] = normTeam(c.team.abbreviation);
    if (c.homeAway === 'home') homeId = c.team.id;
  });
  const home = homeId ? teamIds[homeId] : '';
  const away = Object.values(teamIds).find(t => t !== home) || '';
  const drives = summary && summary.drives ? (summary.drives.previous || []).concat(summary.drives.current ? [summary.drives.current] : []) : [];
  const seen = new Set();
  const plays = [];
  let lastHome = 0, lastAway = 0;
  // Some live summaries carry a flat plays list instead of (or as well as) the drives.
  const flat = summary && Array.isArray(summary.plays) ? [{ plays: summary.plays }] : [];
  drives.concat(flat).forEach(d => (d.plays || []).forEach(p => {
    if (!p || seen.has(p.id)) return;
    seen.add(p.id);
    const hs = p.homeScore != null ? Number(p.homeScore) : lastHome;
    const as = p.awayScore != null ? Number(p.awayScore) : lastAway;
    const scoredBy = hs > lastHome ? home : as > lastAway ? away : '';
    lastHome = hs; lastAway = as;
    const start = p.start || {};
    plays.push({
      id: String(p.id),
      seq: Number(p.sequenceNumber) || plays.length,
      period: (p.period && p.period.number) || 0,
      clock: (p.clock && p.clock.displayValue) || '',
      text: String(p.text || ''),
      type: (p.type && p.type.text) || '',
      scoring: !!p.scoringPlay,
      scoredBy,
      down: start.downDistanceText || start.shortDownDistanceText || '',
      offense: start.team && teamIds[start.team.id] || (d.team && normTeam(d.team.abbreviation)) || (p.team && teamIds[p.team.id]) || '',
      yards: typeof p.statYardage === 'number' ? p.statYardage : null,
      homeScore: hs, awayScore: as
    });
  }));
  return { plays: plays.sort((a, b) => a.seq - b.seq), home, away };
}

export async function fetchPlays(eventId, helper) {
  return parsePlays(await siteJson(NFL + 'summary?event=' + eventId, helper));
}

// ── Matching tracked players to play text ("J.Allen pass short right to K.Coleman") ──
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SUFFIX = /\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i;

export function nameRe(full) {
  const name = String(full).replace(SUFFIX, '').trim();
  const parts = name.split(/\s+/);
  if (parts.length < 2) return null;
  const first = parts[0].replace(/[^A-Za-z]/g, '');
  const last = parts.slice(1).join(' ');
  if (!first) return null;
  // ESPN abbreviates first names to 1–3 letters ("J.Chase", "Ja.Chase").
  const firsts = [1, 2, 3].map(n => first.slice(0, n)).filter((v, i, a) => v && a.indexOf(v) === i);
  return '(?:' + firsts.map(esc).join('|') + ')\\.\\s?' + esc(last) + '(?![A-Za-z])';
}

const DEF_KEYWORDS = /sack|intercept|fumble recovery \(opponent\)|safety|blocked|return touchdown/i;

// Estimate of what this play was worth to one player, in the given league scoring (half-PPR defaults).
export function estimate(play, re, role, rules = DEFAULT_RULES) {
  const t = play.text;
  if (/no play/i.test(t) && /penalty/i.test(t)) return 0;
  const yards = play.yards != null ? play.yards : (() => { const m = t.match(/for (-?\d+) yards?/); return m ? Number(m[1]) : /for no gain/.test(t) ? 0 : 0; })();
  const td = /TOUCHDOWN/i.test(t) && (!play.scoredBy || play.scoredBy === play.offense);
  let pts = 0;
  if (role === 'passer') {
    if (/INTERCEPTED/i.test(t)) pts += rules.passInt;
    else if (!/incomplete|sacked|spiked/i.test(t)) pts += yards * rules.passYd + (td ? rules.passTd : 0);
  } else if (role === 'receiver') {
    if (!/incomplete|INTERCEPTED/i.test(t)) pts += rules.rec + yards * rules.recYd + (td ? rules.recTd : 0);
  } else if (role === 'rusher') {
    pts += yards * rules.rushYd + (td ? rules.rushTd : 0);
  } else if (role === 'kicker') {
    const fg = t.match(new RegExp(re + '\\s+(\\d+)\\s+yard field goal is (GOOD|No Good|BLOCKED)', 'i'));
    if (fg) pts += fg[2].toUpperCase() === 'GOOD' ? (Number(fg[1]) >= 50 ? 5 : Number(fg[1]) >= 40 ? 4 : 3) : -1;
  }
  if (role !== 'kicker' && new RegExp(re + '\\s+FUMBLES').test(t)) {
    const rec = t.match(/RECOVERED by ([A-Z]{2,3})/);
    if (rec && normTeam(rec[1]) !== play.offense) pts += rules.fumLost;
  }
  // The kicker's extra point rides along in touchdown text.
  const xp = t.match(new RegExp(re + '\\s+extra point is (GOOD|No Good|Blocked)', 'i'));
  if (xp) pts += xp[1].toUpperCase() === 'GOOD' ? 1 : -1;
  return Math.round(pts * 10) / 10;
}

export function roleOf(text, re) {
  if (new RegExp(re + '\\s+(?:\\d+\\s+yard field goal|extra point)').test(text)) return 'kicker';
  if (new RegExp(re + '\\s+(?:pass|sacked|spiked)').test(text)) return 'passer';
  if (new RegExp('pass[^.]*?\\bto\\s+' + re).test(text)) return 'receiver';
  if (new RegExp('^(?:\\([^)]*\\)\\s*)*' + re + '\\s+(?!pass|sacked|kneels|spiked|punts|kicks)').test(text)) return 'rusher';
  return 'other';
}

function defPoints(play, team) {
  const t = play.text;
  if (play.offense === team) return /TOUCHDOWN/i.test(t) && play.scoredBy === team && /(kick|punt)off|return/i.test(play.type) ? 6 : 0;
  let pts = 0;
  if (/sacked/i.test(t)) pts += 1;
  if (/INTERCEPTED/i.test(t)) pts += 2;
  const rec = t.match(/RECOVERED by ([A-Z]{2,3})/);
  if (/FUMBLES/i.test(t) && rec && normTeam(rec[1]) === team) pts += 2;
  if (/SAFETY/i.test(t)) pts += 2;
  if (/TOUCHDOWN/i.test(t) && play.scoredBy === team) pts += 6;
  return pts;
}

// tracked: [{ uid, name, pos, team, side: 'mine'|'opp', leagues }] for this game.
// rulesByLeague: optional { leagueName: rules }. A player in several leagues is scored under each league's rules:
// hit.byLeague has each league's number, and hit.est is the shared number (or the average when leagues differ).
export function matchPlays(plays, tracked, rulesByLeague = {}) {
  const people = tracked.filter(p => p.pos !== 'DEF').map(p => ({ ...p, re: nameRe(p.name) })).filter(p => p.re);
  const defs = tracked.filter(p => p.pos === 'DEF');
  return plays.map(play => {
    const hits = [];
    people.forEach(p => {
      if (!new RegExp(p.re).test(play.text)) return;
      const role = roleOf(play.text, p.re);
      const byLeague = {};
      (p.leagues && p.leagues.length ? p.leagues : ['']).forEach(l => { byLeague[l] = estimate(play, p.re, role, rulesFor(rulesByLeague[l], p.pos)); });
      const vals = Object.values(byLeague);
      const mixed = vals.some(v => v !== vals[0]);
      hits.push({ ...p, role, byLeague, mixed, est: mixed ? Math.round(vals.reduce((n, v) => n + v, 0) / vals.length * 10) / 10 : vals[0] });
    });
    defs.forEach(p => {
      if (!DEF_KEYWORDS.test(play.text + ' ' + play.type) && !(play.scoring && play.scoredBy === p.team)) return;
      const est = defPoints(play, p.team);
      if (est) hits.push({ ...p, role: 'defense', est });
    });
    return { ...play, hits, badge: badgeFor(play) };
  });
}

export function badgeFor(play) {
  const t = play.text + ' ' + play.type;
  if (play.scoring && /TOUCHDOWN/i.test(t)) return 'TD';
  if (play.scoring && /field goal/i.test(t)) return 'FG';
  if (/SAFETY/i.test(t)) return 'SAF';
  if (/INTERCEPTED|interception/i.test(t)) return 'INT';
  if (/FUMBLES/.test(play.text) && /RECOVERED by/i.test(play.text)) {
    const rec = play.text.match(/RECOVERED by ([A-Z]{2,3})/);
    if (rec && normTeam(rec[1]) !== play.offense) return 'FUM';
  }
  if (play.scoring) return 'PTS';
  return '';
}
