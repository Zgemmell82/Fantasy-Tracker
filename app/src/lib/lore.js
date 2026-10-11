// Season storylines the hosts can bring up as a "flashback", when a team or player in the story is in your leagues.
//
// Every item here was checked against at least two independent outlets agreeing on the score and the key detail
// (checked October 2026). Rules for adding more, so the show never says something untrue:
//  - Only finished games: scores, stat lines, records. No injuries, depth charts or opinions; those go stale.
//  - Quote a number only if two sources give the same number. If sources disagree (a kick of 56 or 57 yards), leave it out.
//  - Keep `text` as plain spoken English with the numbers written as digits.
//  - Put the sources you checked in `sources`; the tests require at least two.

export const LORE = [
  { id: 'w1-chi-car', week: 1, teams: ['CHI', 'CAR'], players: [],
    text: 'In week one, the Bears beat the Panthers 59 to 37. That is 96 combined points, the most ever in a season opener.',
    sources: ['https://www.nfl.com/news/2026-nfl-season-week-1-what-we-learned-from-sunday-s-games', 'https://www.fox.com/sports/football/nfl/watch-chicago-bears-vs-carolina-panthers-sep-13-2026', 'https://www.newstribune.com/news/2026/sep/14/nfl-capsules-bears-score-59-in-record-setting-week-1-win-vs-panthers/'] },
  { id: 'w1-bal-ind', week: 1, teams: ['BAL', 'IND'], players: ['Derrick Henry', 'Lamar Jackson'],
    text: 'In week one, the Ravens beat the Colts 41 to 23. Derrick Henry ran for 144 yards and three touchdowns, and Lamar Jackson threw for 324 yards.',
    sources: ['https://www.espn.com/nfl/game/_/gameId/401872659/ravens-colts', 'https://www.cbsnews.com/baltimore/news/baltimore-ravens-start-season-dominating-41-23-win-indianapolis-colts/', 'https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/derrick-henry-lamar-jackson-star-in-win-over-colts'] },
  { id: 'w1-det-no', week: 1, teams: ['DET', 'NO'], players: [],
    text: 'In week one, the Lions beat the Saints 31 to 30 in overtime.',
    sources: ['https://www.cbsnews.com/detroit/news/detroit-lions-new-orleans-saints-week-1-2026/', 'https://www.detroitlions.com/news/recap-lions-vs-saints-goff-stbrown-barnes', 'https://www.wilx.com/2026/09/13/lions-win-thriller-31-30-overtime-over-saints-open-up-detroits-season/'] },
  { id: 'w2-buf-det', week: 2, teams: ['BUF', 'DET'], players: ['Josh Allen'],
    text: 'In week two, Josh Allen accounted for five touchdowns, three passing and two rushing, in the Bills\' 41 to 31 win over the Lions in their new stadium.',
    sources: ['https://sports.yahoo.com/articles/thursday-night-football-josh-allen-033532950.html', 'https://www.nbcnewyork.com/news/sports/nfl/lions-bills-score-week-2/6549168/'] },
  { id: 'w2-kc-ind', week: 2, teams: ['KC', 'IND'], players: ['Patrick Mahomes', 'Harrison Butker'],
    text: 'In week two, Patrick Mahomes threw for 382 yards and three touchdowns, and Harrison Butker\'s 40-yard field goal as time expired in overtime beat the Colts 33 to 30.',
    sources: ['https://abcnews.com/Sports/wireStory/mahomes-walker-shine-butker-hits-winning-40-yarder-136610229', 'https://www.newstribune.com/news/2026/sep/21/butkers-field-goal-as-time-expires-in-ot-lifts-chiefs-past-colts-33-30/', 'https://www.colts.com/news/colts-drop-heartbreaker-in-week-2-overtime-loss-to-kansas-city-chiefs'] },
  { id: 'w3-bal-dal', week: 3, teams: ['BAL', 'DAL'], players: ['Tyler Loop'],
    text: 'In week three in Rio de Janeiro, Tyler Loop\'s field goal as time expired gave the Ravens a 34 to 31 win over the Cowboys.',
    sources: ['https://www.nbclosangeles.com/news/sports/nfl/ravens-cowboys-walk-off-field-goal-brazil/3947964/', 'https://www.cbsnews.com/baltimore/news/baltimore-ravens-rio-brazil-cbs-dallas-cowboys-football/', 'https://www.baltimoreravens.com/news/ravens-beat-cowboys-last-second-field-goal-tyler-loop-week-3'] },
  { id: 'w3-wsh-sea', week: 3, teams: ['WAS', 'SEA'], players: [],
    text: 'In week three, the Commanders beat the Seahawks 33 to 31.',
    sources: ['https://www.espn.com/nfl/game/_/gameId/401872955/seahawks-commanders', 'https://www.commanders.com/news/commanders-seahawks-takeaways-2026'] },
  { id: 'w3-jax-ne', week: 3, teams: ['JAX', 'NE'], players: ['Trevor Lawrence', 'Drake Maye'],
    text: 'In week three, the Jaguars beat the Patriots 35 to 6. Trevor Lawrence threw three touchdowns, and Drake Maye turned the ball over three times.',
    sources: ['https://www.cbssports.com/nfl/news/jaguars-vs-patriots-live-updates-score-highlights-stats/live/', 'https://www.bostonglobe.com/2026/09/27/sports/patriots-jaguars-nfl-live-score/', 'https://www.nbcsportsboston.com/nfl/new-england-patriots/live-updates-jacksonville-jaguars-week-3-highlights-score/804338/'] },
  { id: 'w3-den-lar', week: 3, teams: ['DEN', 'LA'], players: [],
    text: 'In week three on Sunday night, the Broncos trailed the Rams 16 to 0 at halftime and came back to win 30 to 26.',
    sources: ['https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/sunday-night-football-broncos-complete-comeback-defeat-rams-30-26', 'https://www.milehighreport.com/denver-broncos-scores-results/186432/broncos-vs-rams-final-score-snf-week-3', 'https://www.nbclosangeles.com/news/sports/nfl/rams-broncos-score-week-3/3947967/'] },
  { id: 'w4-cle-pit', week: 4, teams: ['CLE', 'PIT'], players: [],
    text: 'In week four, the Browns beat the Steelers 27 to 24 on Thursday night, on a 56-yard field goal with 10 seconds left.',
    sources: ['https://www.espn.com/nfl/game/_/gameId/401872964/steelers-browns', 'https://sports.yahoo.com/nfl/pittsburgh-steelers-cleveland-browns-20261001005/', 'https://www.espn.com/nfl/story/_/id/50079473/cleveland-browns-pittsburgh-steelers-week-4-tnf'] },
  { id: 'w4-car-det', week: 4, teams: ['CAR', 'DET'], players: ['Tetairoa McMillan'],
    text: 'In week four, Tetairoa McMillan caught 14 passes for 192 yards and two touchdowns in the Panthers\' 32 to 26 win over the Lions.',
    sources: ['https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/sunday-night-football-tetairoa-mcmillans-big-night-powers-panthers-to-32-26-victory', 'https://www.panthers.com/news/tetairoa-mcmillan-named-nfc-offensive-player-of-the-week-after-historic-performance-in-week-4-himmy-award', 'https://www.foxcarolina.com/2026/10/08/tetairoa-mcmillan-named-week-4-nfc-offensive-player-week/'] },
  { id: 'w4-lar-nacua', week: 4, teams: ['LA'], players: ['Puka Nacua'],
    text: 'In week four, Puka Nacua came back from missing two games and caught nine passes for 125 yards.',
    sources: ['https://www.nbcsports.com/fantasy/football/player-news/2026-10-04/puka-nacua-returns-with-dominant-9-125-statline', 'https://sports.yahoo.com/articles/puka-nacua-registers-nine-receptions-015620014.html', 'https://www.cbssports.com/fantasy/football/news/rams-puka-nacua-nine-catches-rushing-td-in-return/'] }
];

const lc = s => String(s).toLowerCase();

// The next storyline worth telling: one about a team or player in the listener's leagues, never one already told,
// and only about weeks that have already happened. Falls back to any unused storyline when nothing is relevant.
// facts: { week, teams: [abbr], names: [lowercase player names] }
export function pickLore(facts, used, rnd = Math.random) {
  const teams = new Set(facts.teams || []), names = new Set((facts.names || []).map(lc));
  const open = LORE.filter(i => i.week < (facts.week || 99) && !used.has(i.id));
  // Best first: a storyline about a player you have, then one about a team you have, then any unused one.
  const byPlayer = open.filter(i => i.players.some(p => names.has(lc(p))));
  const byTeam = open.filter(i => i.teams.some(t => teams.has(t)));
  const relevant = byPlayer.length ? byPlayer : byTeam;
  const pool = relevant.length ? relevant : open;
  if (!pool.length) return null;
  const item = pool[Math.floor(rnd() * pool.length) % pool.length];
  return {
    item,
    mention: item.players.filter(p => names.has(lc(p))),
    relevant: relevant.includes(item) && item.teams.some(t => teams.has(t))
  };
}
