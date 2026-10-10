# Fantasy Tracker: Base44 build prompts

Paste these into Base44 one at a time, in order. Wait for each to finish building and check it works before sending the next. (Prompt 1 is what you give when creating the app.)

---

## PROMPT 1: Create the app (accounts, leagues, games)

Build **Fantasy Tracker**, a mobile-first web app (fills a phone screen, max-width 560px centered on desktop, safe-area aware, installable to the home screen) for fantasy football players who are in several leagues at once. It shows every league's starters, yours and your opponent's, grouped by NFL game for the week, so you can watch all your leagues in one place. Season is **2026**, regular season **weeks 1-18**.

### Accounts
- Login is required to see anything. Use Base44's built-in auth (email + password, Google if available). A person signs in once and stays signed in on that device until they tap Sign out.
- Every user has their own private dashboard. A new user starts with **no leagues**. Nobody can ever see another user's data (row-level security: users read/write only their own records).
- Account card at the bottom of the Leagues tab: email, "Signed in · saved to your account", Sign out button.

### Data (Base44 entities, all owned by the signed-in user)
- **League**: name (unique per user, max 24 chars), color (hex), sort_order, source (`sleeper | espn | mfl | ffpc | manual`), external_league_id, external_team_id, is_private (bool), espn_s2, swid, mfl_api_key (optional credential fields, only ever read by the owner).
- **LeagueWeek**: league (reference, not name, so renaming keeps all data), week (1-18), mine[] and opp[] (arrays of players), score_mine, score_opp, how (`sleeper|espn|mfl|manual`), updated_at, sync_error. A player is `{name, pos, team, sleeper_id?, espn_id?, pts?}` with pos in QB/RB/WR/TE/K/DEF and team as a standard NFL abbreviation.
- **CheckedOff**: week, player key (side + team + lowercase name).
- **UserSettings**: sleeper_username, last_week_viewed.
- **PlayerCache** (shared, refreshed daily by a backend function): name, pos, team, sleeper_id, for player search.
- Deleting a league deletes its LeagueWeek records. A week nobody has touched starts from the previous week's *my starters* (opponent empty).

### Look and feel (dark, modern, iOS-like. Use exactly these tokens)
Background `#0d1119`; surfaces `#161c28` / `#1f2635` / `#293142`; hairlines `rgba(255,255,255,.07)`; text `#eef1f7`, muted `#8d97ab`, faint `#5f687c`; **mint `#2fe0b0`** = your side and primary actions (text on mint `#04241b`); **coral `#ff6b7f`** = opponents / against you; live red `#ff4d5e`; amber `#ffc043` for big plays. Cards radius 18px, controls radius 12px, pills fully rounded. System font stack (SF Pro), bold tight display titles. Position colors: QB `#ff5c8a`, RB `#20d6bf`, WR `#5aa9ff`, TE `#ffb259`, K `#c38bff`, DEF `#c4946a`. League color choices (12): `#8b7cff #ffc043 #35d49a #4fb6ff #ff7a59 #ff5ca8 #2fe0b0 #c38bff #ff4d5e #a3e635 #f472b6 #94a3b8` plus a custom color picker. Sheets slide up from the bottom with a grabber and a "Done" button. Smooth, short animations only.

Header: small "2026 season" eyebrow, big screen title ("Week 5" / "Plays" / "Leagues"), a round sync/refresh button, and a horizontally scrolling row of week pills 1-18 (current week marked with a dot and selected on open). **Current week** = the first week whose last kickoff was less than 8 hours ago. Bottom tab bar with three tabs: **Games**, **Plays**, **Leagues**.

### NFL data
Use ESPN's public scoreboard for the schedule, times, live scores and clock: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week={W}&dates=2026` (each event has an `id`, competitors with team abbreviations, `status.type.state` = pre/in/post, `shortDetail`, and `situation` with down/distance and possession). Normalize team abbreviations: JAC→JAX, WSH→WAS, LAR→LA, ARZ→ARI, NEP→NE, GBP→GB, KCC→KC, NOS→NO, SFO→SF, TBB→TB, LVR→LV. Team logos: `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/{abbr lowercase}.png&h=96&w=96` (LA→`lar`, WAS→`wsh`); fall back to the abbreviation in a circle. Player photos: Sleeper `https://sleepercdn.com/content/nfl/players/thumb/{sleeper_id}.jpg` or ESPN `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/{espn_id}.png&w=96&h=70`, falling back to the team logo. Defenses are shown as "Chiefs D/ST" (nickname + D/ST). If the browser is blocked by CORS on any third-party API, call it from a backend function instead.

### Leagues tab
A card per league: round-square avatar with the first 2 letters in the league color, name, source label ("Sleeper", "ESPN", "MFL", "FFPC · by hand", or "Not connected"), a small "N vs N" starter count (or your score vs opponent's with Winning/Losing/Tied/Live once the week has started), a status line (e.g. "Updated from Sleeper · Sun 1:05 PM", "Edited by hand", an error in coral), and buttons **Sync** (only when linked), **Edit**, **Source/Connect**, and a small settings (sliders) icon. Below the cards: a dashed **Add a league** button, then the Account card. Empty state: "Add your first league".
- **League settings sheet** (also used to add a league): live preview of the avatar and tag, name field with validation (required, unique, ≤24 chars), color swatches + custom picker, Move up / Move down, "Link to Sleeper, ESPN or MyFantasyLeague", and Delete league (two-step confirm). Renaming keeps everything. New leagues offer "Add and link" or "Add and fill in by hand".
- **Edit sheet**: segmented control "My starters · N" / "Opponent · N", a search box that adds players from PlayerCache (shows photo, name, position chip, team, and a +), and the current list with a − to remove each.
- Source/Connect sheet is built in Prompt 2.

### Games tab (default)
- Summary card: number of games, **Your starters** (mint), **Against you** (coral), a progress bar and "X of Y checked off". Counts are lineup spots, so a player you start in two leagues counts twice.
- Segmented filter: **All games** / **My players**.
- One card per NFL game that has any tracked player, in schedule order: away logo + abbr @ home logo + abbr, a status pill (Upcoming / **Live** with pulsing dot and clock / Final), kickoff time. Under it: **Your players** (mint heading) and **Against you** (coral heading). Each player row: photo with a mint (yours) or coral (against) ring, name, position chip + team, then **one small colored tag per league** the player is in for that side (league color, name; once the game has started also that league's points, e.g. "RDL 18.4"), and a check circle. Tapping a row checks the player off (dimmed, mint check). It also auto-checks when the game is final and the player has points; a manual tap always wins.
- A player is grouped across leagues by team + lowercase name, so someone started in 3 leagues is one row with 3 tags. A player who is *yours* in one league and *against you* in another appears in both sections.
- Players whose team has no game that week go in a final card "Bye or unmatched".
- Each game card has a **Play-by-play** dropdown (built in Prompt 3).
- Empty state when there are no lineups: "No lineups for week N. Connect a league on the Leagues tab, or add players by hand."

---

## PROMPT 2: Link leagues from other sites

Add league syncing. In each league's **Source/Connect** sheet there's a segmented control: **Sleeper | ESPN | MFL | FFPC | By hand**. Syncing pulls this week's starters for you **and your opponent** and the league's live scores. Run it when the app opens, when the week changes, when the app returns to the foreground, at most every 15 minutes per league (every 2 minutes while games are live); the header refresh button and each league's **Sync** button force it. A failure shows a plain-English message on that league's status line and never wipes the existing lineup. Cache everything the app saw last so it opens instantly. Put third-party calls in backend functions if the browser can't call them directly.

**Sleeper** (public, no password). User enters a Sleeper username (saved in UserSettings), taps Find, and gets their 2026 leagues to pick from (already-linked leagues are disabled): `GET https://api.sleeper.app/v1/user/{name}` → `user_id`; `/user/{user_id}/leagues/nfl/2026`; for sync: `/league/{id}/rosters` (find the roster where `owner_id` or `co_owners` has the user), `/league/{id}/matchups/{week}` (take `starters` and `players_points` for the user's roster and for the opponent in the same `matchup_id`; `points` or `custom_points` is the team score), and `/players/nfl` (huge; resolve ids → name/position/team, cache only the ids seen). Starter ids that are 2-3 capital letters are team defenses. Also try to auto-match a league by name/initials when possible.

**ESPN**. League ID + your team ID (found in the team page URL after `leagueId=` / `teamId=`). `GET https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/{id}?view=mMatchup&view=mMatchupScore&scoringPeriodId={week}`. Find the `schedule` entry for that week where home or away `teamId` is yours; each side has `rosterForCurrentScoringPeriod.entries` (skip lineupSlotId 20 = bench and 21 = IR); player = `playerPoolEntry.player` with `fullName`, `defaultPositionId` (1 QB, 2 RB, 3 WR, 4 TE, 5 K, 16 DEF), `proTeamId` (1 ATL, 2 BUF, 3 CHI, 4 CIN, 5 CLE, 6 DAL, 7 DEN, 8 DET, 9 GB, 10 TEN, 11 IND, 12 KC, 13 LV, 14 LA, 15 MIA, 16 MIN, 17 NE, 18 NO, 19 NYG, 20 NYJ, 21 PHI, 22 ARI, 23 PIT, 24 LAC, 25 SF, 26 SEA, 27 TB, 28 WAS, 29 CAR, 30 JAX, 33 BAL, 34 HOU) and points from `playerPoolEntry.appliedStatTotal`; team score from `totalPointsLive ?? totalPoints`. Public leagues need nothing else. For **private leagues** add a "Private league" switch and fields for the user's `espn_s2` and `SWID` cookies (with a short how-to-find-them note); the backend function sends them as a `Cookie` header and they're stored only on that user's League record. Include a **Test connection** button that syncs once and says "Connected — pulled 9 + 9 starters."

**MFL (MyFantasyLeague)**. League ID, your franchise ID (e.g. 0003), optional API key for private leagues. `GET https://api.myfantasyleague.com/2026/export?TYPE=liveScoring&L={id}&W={week}&JSON=1[&APIKEY=...]` returns `liveScoring.matchup[]` (may be a single object) each with two `franchise` entries (`id`, `score`, `players.player[]` with `id`, `status` = `starter`/`nonstarter`, `score`). Take starters for your franchise and the other franchise in its matchup. Resolve player ids with `TYPE=players&DETAILS=0` (names come as "Last, First"; position PK→K, "Def"→DEF; team aliases above). Include Test connection.

**FFPC**. FFPC has no feed an outside app can read. Treat it as a labelled source: lineups are entered with the Edit sheet, never auto-synced, with an optional league-number field and a short note explaining that. It must be selectable for any league, new or existing.

**By hand**: nothing is fetched; the user edits starters each week.

---

## PROMPT 3: Plays tab (the important one)

Build the **Plays** tab and the per-game play-by-play dropdown on Games cards. The purpose: a live feed of **every play that matters to any of my leagues**, and for each play, exactly which leagues it helps or hurts.

**Data.** For each game use the ESPN scoreboard event `id` and fetch `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={id}`. Plays are in `drives.previous[].plays[]` plus `drives.current.plays[]` (each has `id`, `sequenceNumber`, `period.number`, `clock.displayValue`, `text`, `type.text`, `scoringPlay`, `homeScore`, `awayScore`, `statYardage`, `start.downDistanceText`, `start.team.id`). Poll every 20 seconds while a game is live and the screen is open (pause when the tab is hidden); new plays slide in and are marked new. Scoreboard refreshes every 30 seconds while any game is live.

**Matching plays to my players.** Play text looks like "J.Allen pass short right to K.Coleman for 12 yards". For each tracked non-defense player build a pattern from the first name (1-3 letter prefixes, e.g. "J.", "Ja.", "Jay.") + "." + optional space + last name (strip Jr/Sr/II/III/IV/V; the match must not be followed by another letter). Defenses match plays with sacks, interceptions, fumble recoveries by the defense, safeties, blocked kicks, or return touchdowns, or any scoring play by that team. Work out each player's **role** (passer, receiver, rusher, kicker, defense, other) and a **half-PPR point-swing estimate**: passing 0.04/yd and 4/TD, interception -2; receiving 0.5 per catch + 0.1/yd + 6/TD; rushing 0.1/yd + 6/TD; fumble lost -2; FG 3/4/5 by distance (<40, 40-49, 50+), miss -1; XP +1, miss -1; defense: sack 1, INT 2, fumble recovery 2, safety 2, TD 6. Penalized "no play" plays are worth 0.

**Each play card** shows: quarter + clock, **the game it came from** (away logo @ home logo), badge (TD, FG, INT, FUM, SAF, PTS; gold highlight for big plays), down & distance, the play text, and the running score on scoring plays. Under it, **one line per player involved, with one row per league that player is in**, written in plain words:
- `● RDL · FOR you` (mint) when the player is on **my** side in that league
- `● DFL · AGAINST you` (coral) when the player is **my opponent's** in that league
- The league dot/name uses that league's color; the estimate sits beside it (+7.2 / -2.0, hidden when 0).
- If the same player is mine in one league and my opponent's in another, show both rows ("RDL · FOR you", "DFL · AGAINST you"). If a play involves several tracked players (a pass from my QB to an opponent's WR), list each one.
- Players are shown with a photo ringed mint (mine) or coral (against).

**Plays tab layout.**
1. A segmented switch at top: **By game | All plays**.
2. **By game**: the games with my/opponent starters, live first, then upcoming, then final. Each card shows the live score, clock, down/distance and possession, a count of my (mint) and opponent (coral) starters, and expands into that game's feed.
3. **All plays** (the new combined feed): one chronological feed, newest first, of **every play with any fantasy implication in any of my leagues, across all games in the selected week**: not just live games. Controls above it:
   - Game scope: **Live now** (default while any game is live) | **All games this week**.
   - Impact filter: **Everything** (default; any play that involves any tracked player, including negative plays like interceptions, fumbles and missed kicks) | **For me** | **Against me** | **Scoring plays**.
   - **League filter chips** (one per league in its color; tap to include/exclude, default all) so I can look at just one league.
   - A header line such as "3 live games · updates every 20s · 6:43 PM".
   Order plays by newest first (plays that arrived while the screen was open on top, then by quarter and remaining clock, then sequence). Show 40 at a time with "Show more". Empty states: "No games are live" with a button to switch to All games this week, and "None of your players, or your opponents', have shown up in a play yet."
4. Footnote: "Point swings are half-PPR estimates; your leagues' real totals come from their sites." (Stretch goal: use each league's own scoring settings, such as Sleeper `scoring_settings` and ESPN league settings, so the estimate differs per league.)

Games-tab cards get a collapsible **Play-by-play** dropdown with the same play cards for that game only, filterable by All / Players / Scoring.

Keep everything fast: fetch each game's plays once per cycle and share the result between the Plays tab and the Games dropdowns, and stop polling games that are final.
