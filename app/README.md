# Fantasy Tracker (custom leagues)

This is a copy of the original tracker (`Fantasy-Tracker-1`) with its own GitHub Pages site and its own saved data. You can add, rename, recolor, reorder and delete leagues. Changes here never affect the original app.

A phone web app that lists your fantasy starters, and your opponents', grouped by NFL game for the week. It's built from the Claude Design handoff in `../project/Fantasy Tracker.dc.html` and uses the Modernist design system.

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
- **Plays** lists the games with your or your opponents' starters, live first, with ESPN's live score and clock. Tap one to drop down its play-by-play: **All**, **Players** (plays involving your tracked players, green for yours and red for theirs, with a rough half-PPR point estimate) or **Scoring**. Open live games refresh every 20 seconds. Game cards on **By game** have the same Play-by-play dropdown.
- **Leagues** shows where each league's lineup came from, with Sync, Edit and Connect actions. The slider button on a league opens its settings: name, color (12 presets or a custom color), move up or down, link to Sleeper or ESPN, and delete. **Add a league** at the bottom creates a new one, and you can link it straight away. Renaming keeps the league's lineups and link.
- Built-in connections are in `src/App.jsx` (`DEFAULT_CONN`):
  - RDL and DFL come from Sleeper (user `Uncutgems82`). They're matched to Sleeper leagues by name or initials; if that fails, pick the right league once under Connect.
  - Deloitte comes from ESPN (league 308619009, team 1). This works only if the league is public.
  - Breezewood is a private ESPN league. It syncs through the ESPN helper once you set it up (see `../espn-helper/README.md`) and enter its IDs under Connect.
- Connected leagues sync when the app opens, when you switch weeks and when it returns to the foreground, at most once every 15 minutes. **Sync** in the header forces a refresh.
- Everything is saved in the browser's `localStorage` on the device, under `ff-tracker-custom-v1`. On first open it copies the original app's data (`ff-tracker-v3`) if that exists on the same site, and it never writes to that key. A week you haven't updated starts from last week's starters.

## Differences from the design

- The iPhone frame is gone. The app fills the real screen and respects the notch and home-indicator safe areas.
- Screenshot **Scan** was dropped, because it relied on Claude Design's built-in AI. The bottom bar now has two tabs, unlinked leagues show **Edit** as their main action, and the "Screenshot" source is now called **By hand**.
- Text fields use 16px text so iOS doesn't zoom in when you tap them.
- A manual edit clears an older sync error from that league's status line.
