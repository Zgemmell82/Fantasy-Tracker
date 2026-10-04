// Play-by-play from ESPN's public NFL game data, matched to the starters tracked in the app.
import { SEASON } from './season.js';
import { normTeam } from './teams.js';

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

export async function fetchScoreboard(week, helper) {
  return parseScoreboard(await siteJson(NFL + 'scoreboard?seasontype=2&week=' + week + '&dates=' + SEASON, helper));
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
  drives.forEach(d => (d.plays || []).forEach(p => {
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
      offense: start.team && teamIds[start.team.id] || (d.team && normTeam(d.team.abbreviation)) || '',
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

// Half-PPR estimate of what this play was worth to one player.
export function estimate(play, re, role) {
  const t = play.text;
  if (/no play/i.test(t) && /penalty/i.test(t)) return 0;
  const yards = play.yards != null ? play.yards : (() => { const m = t.match(/for (-?\d+) yards?/); return m ? Number(m[1]) : /for no gain/.test(t) ? 0 : 0; })();
  const td = /TOUCHDOWN/i.test(t) && (!play.scoredBy || play.scoredBy === play.offense);
  let pts = 0;
  if (role === 'passer') {
    if (/INTERCEPTED/i.test(t)) pts -= 2;
    else if (!/incomplete|sacked|spiked/i.test(t)) pts += yards * 0.04 + (td ? 4 : 0);
  } else if (role === 'receiver') {
    if (!/incomplete|INTERCEPTED/i.test(t)) pts += 0.5 + yards * 0.1 + (td ? 6 : 0);
  } else if (role === 'rusher') {
    pts += yards * 0.1 + (td ? 6 : 0);
  } else if (role === 'kicker') {
    const fg = t.match(new RegExp(re + '\\s+(\\d+)\\s+yard field goal is (GOOD|No Good|BLOCKED)', 'i'));
    if (fg) pts += fg[2].toUpperCase() === 'GOOD' ? (Number(fg[1]) >= 50 ? 5 : Number(fg[1]) >= 40 ? 4 : 3) : -1;
  }
  if (role !== 'kicker' && new RegExp(re + '\\s+FUMBLES').test(t)) {
    const rec = t.match(/RECOVERED by ([A-Z]{2,3})/);
    if (rec && normTeam(rec[1]) !== play.offense) pts -= 2;
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
export function matchPlays(plays, tracked) {
  const people = tracked.filter(p => p.pos !== 'DEF').map(p => ({ ...p, re: nameRe(p.name) })).filter(p => p.re);
  const defs = tracked.filter(p => p.pos === 'DEF');
  return plays.map(play => {
    const hits = [];
    people.forEach(p => {
      if (!new RegExp(p.re).test(play.text)) return;
      const role = roleOf(play.text, p.re);
      hits.push({ ...p, role, est: estimate(play, p.re, role) });
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
