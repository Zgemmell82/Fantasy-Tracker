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

- **By game** groups every league's starters by NFL game. A player you start in several leagues shows `×2`, `×3` and so on. Tap a player to cross them off.
- **Plays** has two views. **By game** lists the games with your or your opponents' starters, live first, with ESPN's live score and clock. Tap one to drop down its play-by-play: **All**, **Players** (plays involving your tracked players, green for yours and red for theirs, with a rough half-PPR point estimate) or **Scoring**. Open live games refresh every 20 seconds. Game cards on **Games** have the same Play-by-play dropdown. **All plays** is one feed, newest first, of every play involving a player in any of your leagues, across all live games or all games this week. Each player shows one row per league, tagged FOR you (green) or AGAINST you (red). Filter by All, For me, Against or Scoring, and switch individual leagues on or off.
- **Left to play**: each league card on **Leagues** shows how many of your starters and how many of your opponent's still have a game to finish this week (with how many are playing right now), and how many of each are in the Monday night game. Players on a bye aren't counted.
- **Monday night**: on **Games**, a Monday Night card lists who is still to play in that game, for you and against you, league by league. It disappears once the game is final.
- **Leagues** shows where each league's lineup came from, with Sync, Edit and Connect actions. The slider button on a league opens its settings: name, color (12 presets or a custom color), move up or down, link to Sleeper or ESPN, and delete. **Add a league** at the bottom creates a new one, and you can link it straight away. Renaming keeps the league's lineups and link.
- Each league is linked under **Source**/**Connect**:
  - **Sleeper**: enter your username and pick the league.
  - **ESPN**: league ID and team ID. Private leagues go through the ESPN helper (see `../espn-helper/README.md`).
  - **MFL** (MyFantasyLeague): league ID, franchise ID and, for private leagues, an API key.
  - **FFPC**: no feed this app can read, so FFPC leagues are labelled and filled in by hand with **Edit**.
  - **By hand**: edit starters yourself.
- Connected leagues sync when the app opens, when you switch weeks and when it returns to the foreground, at most once every 15 minutes. **Sync** in the header forces a refresh.
- Leagues are saved to the signed-in account and also cached on the device (`localStorage`, one entry per account), so the app opens instantly and keeps working offline; changes upload when you're back online. The original app's data (`ff-tracker-v3`) is only ever read, for the one-time import, and never written. API keys and helper links you enter under Connect are saved to your account too. A week you haven't updated starts from last week's starters.

## Differences from the design

- The iPhone frame is gone. The app fills the real screen and respects the notch and home-indicator safe areas.
- Screenshot **Scan** was dropped, because it relied on Claude Design's built-in AI. The bottom bar now has two tabs, unlinked leagues show **Edit** as their main action, and the "Screenshot" source is now called **By hand**.
- Text fields use 16px text so iOS doesn't zoom in when you tap them.
- A manual edit clears an older sync error from that league's status line.
