# Fantasy Tracker (custom leagues)

This is a copy of the original tracker (`Fantasy-Tracker-1`) with its own GitHub Pages site and its own saved data. You can add, rename, recolor, reorder and delete leagues. Changes here never affect the original app.

A phone web app that lists your fantasy starters, and your opponents', grouped by NFL game for the week. It's built from the Claude Design handoff in `../project/Fantasy Tracker.dc.html` and uses the Modernist design system.

## Accounts and sign-in

Everyone makes an account (email and password) and gets their own dashboard with their own leagues. Signing in once keeps you signed in on that device until you tap **Sign out** (bottom of the Leagues tab). Leagues are saved to the account, so another phone or computer shows the same leagues after signing in. A new account starts empty; the leagues from the original tracker can be imported once from the Leagues tab on the device that has them.

Accounts use [Supabase](https://supabase.com) (free tier). One-time setup:

1. Create a project at supabase.com.
2. **SQL Editor → New query**, paste the contents of `supabase/schema.sql`, **Run**. This creates the table that holds each account's leagues and locks it so people only see their own.
3. **Authentication → URL Configuration**: set **Site URL** to the app's address (`https://zgemmell82.github.io/fantasy-tracker/`). Under **Authentication → Providers → Email** you can turn **Confirm email** off if you don't want a confirmation step.
4. **Project Settings → API**: copy the **Project URL** and the **anon public** key. (The anon key is meant to be public; the table's row-level security is what protects each account's data. Never use the `service_role` key here.)
5. In the GitHub repository: **Settings → Secrets and variables → Actions → Variables → New repository variable**, add `SUPABASE_URL` and `SUPABASE_ANON_KEY`, then run the **Deploy app to GitHub Pages** workflow again.

### Yahoo Fantasy helper (needed for Yahoo leagues)

Yahoo requires a sign-in ("OAuth") and keeps a secret key, so Yahoo leagues go through a Supabase Edge Function, `yahoo`. It is read-only, only for signed-in users, only talks to Yahoo's fantasy API, and keeps each user's Yahoo tokens in a table only the function can read. Set it up once:

1. Go to https://developer.yahoo.com/apps/create/ and create an app: *Web Application*, permission **Fantasy Sports – Read**. For **Redirect URI** use the exact address of your app (for example `https://zgemmell82.github.io/Fantasy-Tracker/`). Copy the **Client ID** and **Client Secret**.
2. In Supabase run the `yahoo_tokens` part of `supabase/schema.sql` (SQL Editor).
3. Supabase → **Edge Functions → Deploy a new function**, name it exactly `yahoo`, paste `supabase/functions/yahoo/index.ts`, and deploy (leave **Verify JWT** on).
4. Edge Functions → **Secrets**: add `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET`. Optional: `YAHOO_REDIRECT_URIS` (comma-separated pages Yahoo may send people back to).
5. In the app: **Locker Room → Source → Yahoo → Connect Yahoo**, sign in at Yahoo, then pick your team.

### MyFantasyLeague helper (needed for MFL leagues)

MyFantasyLeague doesn't let other websites read its data from the browser, so MFL leagues are fetched through a small Supabase Edge Function, `mfl`. It only works for signed-in users, only talks to `api.myfantasyleague.com`, and only fetches the few kinds of data the app needs. Install it once:

1. In the Supabase dashboard, open **Edge Functions → Deploy a new function → Via Editor**.
2. Name it exactly `mfl`.
3. Replace the sample code with the contents of `supabase/functions/mfl/index.ts`, then **Deploy**. Leave **Verify JWT** on.
4. In the app: **Locker Room → Source → MFL**, enter the league ID and franchise ID (plus an API key if the league is private), and tap **Test connection**.

With the Supabase CLI instead: `supabase functions deploy mfl --project-ref <your project ref>`. After changing `supabase/functions/mfl/index.ts`, deploy it again.

### Hot Route Radio AI banter (optional)

*Hot Route Radio is switched off in the app for now, so none of this is needed yet. Nothing has been deployed for it.*

**Hot Route Radio** (on the Two-Minute Drill tab) is a live two-host show about your leagues. It works without any setup: the hosts use built-in lines and the phone's own voices. For AI-written banter on big plays and in quiet moments, add the `podcast` Edge Function:

1. In Supabase, open **Edge Functions → Deploy a new function → Via Editor**, name it exactly `podcast`, paste the contents of `supabase/functions/podcast/index.ts`, and **Deploy** (leave **Verify JWT** on).
2. Under **Project Settings → Edge Functions → Secrets**, add `ANTHROPIC_API_KEY` (an API key from console.anthropic.com).
3. The default model is `claude-haiku-5-5`: quick and very cheap (a rough estimate is about a cent an hour of live listening per person). The optional secret `PODCAST_MODEL` can pick a stronger one, e.g. `claude-opus-5-5`, for better writing at roughly 40 times the cost.

This uses the Claude **API**, which is billed separately from a claude.ai Pro or Max subscription: it's pay-as-you-go on the Anthropic Console, so set a monthly spend limit there.

The function only accepts structured facts from the app and builds the prompt itself, so it can't be used as a general AI endpoint. Until it's set up, the app says so under the player and keeps going with built-in lines.

For local work, put the same two values in `app/.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Run it

```sh
npm install
npm run dev      # local dev server
npm test         # unit tests for grouping, weeks and ESPN parsing
npm run build    # production build in dist/
```

`dist/` is a static site that works from any path, e.g. GitHub Pages, Netlify or Vercel. Open it in Safari on your iPhone and use **Share → Add to Home Screen**. It then runs full screen and works offline.

## How it works

- **Live Feed** (the plays tab) has two views. **By game** lists the games with your or your opponents' starters, live first, with ESPN's live score and clock. Tap one to open it, then pick **Players**, **Play-by-Play** or **Recap** (each game remembers its own choice). Play-by-Play has **All**, **Players** (plays involving your tracked players, green for yours and red for theirs, with a rough half-PPR point estimate) or **Scoring**. Open live games refresh every 20 seconds. The scoreboard keeps checking before kickoff too (every 30 seconds around game time) and refreshes the moment the app comes back to the foreground, so a game that starts while the app is closed or in the background shows up live. **All plays** is one feed, newest first, of every play involving a player in any of your leagues,. Each player shows one row per league, tagged FOR you (green) or AGAINST you (red). Every game of the week that has started is in one feed. Filter by All (every play in every game, with the ones that matter to your teams highlighted), For/Against (only plays that gain or lose fantasy points for a player you have or face, or injure one) or Scoring (with a switch for scoring plays from all players), and switch individual leagues on or off.
- **Lineup check**: at the top of **The Huddle**, a card lists your starters who are Out (including IR and suspended), Doubtful or Questionable, or on a bye this week, with the injury, the kickoff time and which leagues they're in. Below it, "Good news" lists the same problems on your opponents' side (only the serious ones). Each league card in the **Locker Room** shows how many alerts it has. The designations come from Sleeper's public player list (saved on the device for a few hours), so a game-day inactive can show up a little late. Games that are over are skipped.
- **Left to play**: each league card in the **Locker Room** shows how many of your starters and how many of your opponent's still have a game to finish this week (with how many are playing right now), and how many of each are in the Monday night game. Players on a bye aren't counted.
- **Defensive players (IDP)**: if a starter in your lineup is an individual defensive player (DL, LB, DB and so on, which Sleeper, MFL and Yahoo report), the Live Feed and recaps score the plays he's in: solo tackle 1.5, assisted tackle 0.75, tackle for loss +0.5, pass defensed 2, sack 2.5 (split between two players), interception 5, forced fumble 4, fumble recovery 3, defensive touchdown +6. These values are fixed in `app/src/lib/scoring.js` (`IDP_RULES`), not read from each league. ESPN IDP slots aren't read yet.
- **Play-by-play order**: while a game is live the play-by-play shows the newest play first; once the game is over it flips to the order things happened, first play to last.
- **Game recap**: open a finished game (**Live Feed → By game**) and it opens on a **Recap**: for each league, the fantasy points you got and the points you gave up (your opponent's players) in each quarter. Tap a quarter to see the plays behind it, oldest first, each labelled FOR you or AGAINST you. Switch to **Play-by-play** for the full feed. Points are estimated from the plays (half-PPR), so they can differ from a league's official scoring.
- **Two-Minute Drill** (was Hot Route): the gist of your week, for the leagues picked in the league filter. **Where you stand** shows each matchup's score and win probability. Below it, **Root for** and **Root against** rank the players still to play by how much a big game from them (about one standard deviation above their projection) would change your chance to win. Each league line says whether he's yours or theirs, what the matchup looks like, and the change (**+26%** means a big game raises your win chance 26 points; **−10%** lowers it; **no effect** means that matchup is basically decided). The big number on the right adds the lines up across leagues. A **How to read these numbers** button explains it in the app. A player who is against you in a league you're winning big barely counts there, so someone like a WR who is yours in a league you're trailing and theirs in one you lead by 80 comes out as a root-for instead of cancelling to zero. **Cancels out** lists players who help you in one league and hurt you in another by about the same amount. Win probability uses the score so far, how much of each game is left, and each remaining player's average for the week: Sleeper's weekly projection (in the league's own reception scoring for Sleeper leagues, half-PPR otherwise), or an average game for the position when there isn't one. A note at the bottom of the tab says which it used. Projections come from Sleeper's public projections feed and are saved on the device for a few hours; if it can't be reached, the tab falls back to position averages. Treat the odds as a guide.
- **Hot Route Radio** (built but **switched off for now**; build with `VITE_FEATURE_RADIO=1` to turn it on, see `app/src/lib/features.js`): at the top of **Two-Minute Drill**, pick a style (Optimistic, Pessimistic, Neutral, Roast, Supportive or Hype) and press **Listen**. Two hosts react to the live plays that touch your leagues, say what you need to win each league, call out who to root for and against, and give a scoreboard rundown every few minutes. Roast has a **Spicier roast** switch (mild by default; jokes stay about your roster and the play on the field). Voices use the device's built-in text-to-speech (the app picks the best-sounding voices it finds, preferring Premium, Enhanced, Natural and Neural ones; on iPhone you can download free Premium voices under Settings → Accessibility → Spoken Content → Voices) and the screen is kept awake while it plays; turn **Voices** off for captions only. Big moments can be written by AI (see above). Commentary comes from the app's own data plus a short list of season storylines in `app/src/lib/lore.js`; it isn't betting advice. Each storyline (finished games only: scores and stat lines) was checked against at least two outlets; the hosts tell one now and then when a team or player in it is in your leagues, never twice, and never about weeks that haven't happened. To add more, follow the rules at the top of that file (two sources agreeing on every number, no injuries or opinions) and the tests will check the format.
- **Game time**: at the bottom of **Locker Room**, choose **1:00 game** (light) or **Night game** (dark, the default). The choice applies to the whole app, including the sign-in screen, and is remembered on that device.
- **League filter**: **The Huddle**, **Live Feed** and **Two-Minute Drill** have a row of league chips under the top switch. It starts on **All leagues**; tap leagues to show just those (as many as you like), or tap **All leagues** to reset. The choice applies to Games and Plays, By game and All plays alike, and resets when the app reopens.
- **Projections and red zone**: the matchup breakdown shows each starter's projected finish (points so far plus what's left of his Sleeper projection; a **~** means a position average was used) and each team's projected total. An **RZ** tag appears on the Games tab (on the game and on players whose team has the ball) and in the matchup while a team is in the red zone.
- **Tabs**: **The Huddle** (home: lineup check, an all-leagues table where each league expands (collapsed by default) to both lineups side by side with your starters' live and projected points, ), **Live Feed** (plays), **Two-Minute Drill** (live swings, BOOM players, and what you need to win) and **Locker Room** (leagues, sources, theme, account).
- **All-leagues strip**: at the top of The Huddle, one row per league with the score, the projected finish (score so far plus the Sleeper projection left on each unfinished starter) and Winning / Losing / Close. *Projected win* or *Projected loss* means the other way round on the scoreboard right now. Close is a win chance between 35% and 65%.
- **Live Feed plays**: the **All plays** feed only shows plays that gain or lose fantasy points for a player you have or are facing, or injure one of them (punts, kneel-downs and plays with none of your players are dropped). Green helps you, red hurts you (plays worth nothing to a player get no label). Point swings use each league's own scoring (Sleeper's and ESPN's scoring settings are read when a league syncs). **By game** games each open and close on their own and list your players in that game marked For or Against with their leagues.
- **BOOM**: on Two-Minute Drill each player's league lines show YOURS or AGAINST, the % over or under his original projection, and his live score with that projection. A player is booming in a league when his live score is at least **120%** of his projection *in that league's scoring* and at least **5 points** over it. Pick the scoring under **Locker Room → Source → Scoring** (Sleeper and ESPN are read automatically; other sources default to half PPR).
- **What I need to win**: once the week has started and a Thursday, late-Sunday (4 pm ET on) or Monday game is unfinished, Two-Minute Drill shows each league's gap, which of your remaining players (by projection left) can close it, a plain-English line, and Win (70%+) / On the bubble / Need a miracle (15% or less). Leagues at 99% or finished show as Locked.
- **Matchup breakdown**: tap a league's score (or starter count) in **The Huddle** or the **Locker Room** to open the week's matchup: both teams' totals, then your starters and your opponent's side by side with each player's points (or kickoff time before they play). Points appear for linked leagues; by-hand leagues show lineups only. For ESPN and MFL leagues the starters are ordered QB, RB, WR, TE, K, DEF, then IDP, and each position is lined up against your opponent's. If one side has an extra RB, WR or TE, the extras face each other in a **FLX** row after the TE.
- **Locker Room** (was Leagues) shows where each league's lineup came from, with Sync, Edit and Connect actions. The slider button on a league opens its settings: name, color (12 presets or a custom color), move up or down, link to Sleeper or ESPN, and delete. **Add a league** at the bottom creates a new one, and you can link it straight away. Renaming keeps the league's lineups and link.
- Each league is linked under **Source**/**Connect**:
  - **Sleeper**: enter your username and pick the league.
  - **ESPN**: league ID and team ID. Private leagues go through the ESPN helper (see `../espn-helper/README.md`).
  - **MFL** (MyFantasyLeague): league ID, franchise ID and, for private leagues, an API key.
  - **Yahoo**: sign in with Yahoo once (see the Yahoo helper above), then pick your team from the list.
  - **FFPC**: no feed this app can read, so FFPC leagues are labelled and filled in by hand with **Edit**.
  - **By hand**: edit starters yourself.
- Connected leagues sync when the app opens, when you switch weeks and when it returns to the foreground, at most once every 15 minutes. **Sync** in the header forces a refresh.
- Leagues are saved to the signed-in account and also cached on the device (`localStorage`, one entry per account), so the app opens instantly and keeps working offline; changes upload when you're back online. The original app's data (`ff-tracker-v3`) is only ever read, for the one-time import, and never written. API keys and helper links you enter under Connect are saved to your account too. A week you haven't updated starts from last week's starters.

## Differences from the design

- The iPhone frame is gone. The app fills the real screen and respects the notch and home-indicator safe areas.
- Screenshot **Scan** was dropped, because it relied on Claude Design's built-in AI. The bottom bar now has two tabs, unlinked leagues show **Edit** as their main action, and the "Screenshot" source is now called **By hand**.
- Text fields use 16px text so iOS doesn't zoom in when you tap them.
- A manual edit clears an older sync error from that league's status line.
