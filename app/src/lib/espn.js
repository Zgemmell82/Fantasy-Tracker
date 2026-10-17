import { SEASON } from './season.js';
import { defName } from './teams.js';
import { espnRules, formatOf } from './scoring.js';

const ESPN_POS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DEF' };
const ESPN_TEAM = { 1:'ATL',2:'BUF',3:'CHI',4:'CIN',5:'CLE',6:'DAL',7:'DEN',8:'DET',9:'GB',10:'TEN',11:'IND',12:'KC',13:'LV',14:'LA',15:'MIA',16:'MIN',17:'NE',18:'NO',19:'NYG',20:'NYJ',21:'PHI',22:'ARI',23:'PIT',24:'LAC',25:'SF',26:'SEA',27:'TB',28:'WAS',29:'CAR',30:'JAX',33:'BAL',34:'HOU' };
const BENCH = 20, IR = 21;

// Converts one side of an ESPN matchup to starters.
// The player's fantasy points for the week: appliedStatTotal, else the matching actual-stats line.
function playerPoints(e, week) {
  const pe = e.playerPoolEntry || {};
  if (typeof pe.appliedStatTotal === 'number') return pe.appliedStatTotal;
  const stat = ((pe.player && pe.player.stats) || []).find(s => s.statSourceId === 0 && s.statSplitTypeId === 1 && (week == null || s.scoringPeriodId === week));
  return stat && typeof stat.appliedTotal === 'number' ? stat.appliedTotal : null;
}

const sideTotal = side => side ? (side.totalPointsLive ?? side.totalPoints ?? null) : null;

export function espnStarters(side, week) {
  return ((side && side.rosterForCurrentScoringPeriod && side.rosterForCurrentScoringPeriod.entries) || [])
    .filter(e => e.lineupSlotId !== BENCH && e.lineupSlotId !== IR)
    .map(e => {
      const p = (e.playerPoolEntry && e.playerPoolEntry.player) || {};
      const pos = ESPN_POS[p.defaultPositionId] || '';
      const t = ESPN_TEAM[p.proTeamId] || '';
      const out = { n: pos === 'DEF' ? defName(t) : p.fullName, p: pos, t };
      if (p.id && pos !== 'DEF') out.eid = p.id;
      const pts = playerPoints(e, week);
      if (pts != null) out.pts = pts;
      return out;
    });
}

// Public leagues are read directly. Private ones go through your ESPN helper (see espn-helper/),
// which adds your ESPN login cookies, because a web app can't send them itself.
export function espnUrl(leagueId, week, helper) {
  const base = helper ? String(helper).trim().replace(/\/+$/, '') : 'https://lm-api-reads.fantasy.espn.com';
  return base + '/apis/v3/games/ffl/seasons/' + SEASON + '/segments/0/leagues/' + leagueId +
    '?view=mMatchup&view=mMatchupScore&view=mSettings&scoringPeriodId=' + week;
}

// Reception scoring from the league's settings (stat 53 is receptions) -> the projection format that fits it.
const scoringItems = j => (((j || {}).settings || {}).scoringSettings || {}).scoringItems;
export function espnScoring(j) {
  const items = scoringItems(j);
  const rec = Array.isArray(items) ? items.find(i => i.statId === 53) : null;
  if (!rec || typeof rec.points !== 'number') return undefined;
  return rec.points >= 0.9 ? 'ppr' : rec.points >= 0.4 ? 'half' : 'std';
}

// ESPN numbers matchups by "matchup period", which equals the NFL week in most leagues but not all (playoff rounds
// can span two weeks). The league's settings say which scoring periods (NFL weeks) each matchup period covers.
export function espnMatchupPeriod(j, week) {
  const mp = (((j || {}).settings || {}).scheduleSettings || {}).matchupPeriods;
  if (mp && typeof mp === 'object') {
    const hit = Object.keys(mp).find(k => Array.isArray(mp[k]) && mp[k].includes(week));
    if (hit) return Number(hit);
  }
  return week;
}

export async function syncEspn(leagueId, teamId, week, helper) {
  const url = espnUrl(leagueId, week, helper);
  let j;
  try {
    const r = await fetch(url, { credentials: 'omit' });
    if (r.status === 401 || r.status === 403) {
      const why = helper ? ((await r.json().catch(() => ({}))).error || '') : '';
      throw new Error(helper ? (why || 'ESPN turned down your cookies. Copy fresh espn_s2 and SWID values into the helper.') : 'private');
    }
    if (!r.ok) throw new Error((helper ? 'ESPN helper ' : 'ESPN ') + r.status);
    j = await r.json();
  } catch (e) {
    if (e.message === 'private' || e.name === 'TypeError') {
      throw new Error(helper
        ? 'Couldn\'t reach your ESPN helper. Check the helper link and its ALLOWED_ORIGIN setting.'
        : 'ESPN blocked the request. For a private league, turn on "Private league" in Connect and add your ESPN helper.');
    }
    throw e;
  }
  const tid = Number(teamId);
  const g = (j.schedule || []).find(s => s.matchupPeriodId === espnMatchupPeriod(j, week) && ((s.home && s.home.teamId === tid) || (s.away && s.away.teamId === tid)));
  if (!g) throw new Error('No week ' + week + ' matchup for team ' + teamId + '.');
  const home = g.home.teamId === tid;
  const meSide = home ? g.home : g.away, opSide = home ? g.away : g.home;
  const res = { mine: espnStarters(meSide, week), opp: espnStarters(opSide, week), score: { mine: sideTotal(meSide), opp: sideTotal(opSide) } };
  const scoring = espnScoring(j);
  if (scoring) res.scoring = scoring;
  const rules = espnRules(scoringItems(j));
  if (rules) res.rules = rules;
  if (!res.mine.length) throw new Error('ESPN returned no lineup yet for week ' + week + '.');
  return res;
}
