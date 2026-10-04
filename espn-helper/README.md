# ESPN helper (for private ESPN leagues)

ESPN only shares a private league with requests that carry your ESPN login cookies. Fantasy Tracker is a web app, so it can't attach those cookies itself. This helper is a small, free Cloudflare Worker that holds the cookies and adds them to the app's requests. Your cookies stay in your Cloudflare account and are never stored on your phone.

Setup takes about 10 minutes, and steps 1 and 2 need a computer.

## 1. Get your two ESPN cookies

1. On a computer, sign in at https://fantasy.espn.com in Chrome.
2. Press F12 (Mac: ⌥⌘I) to open DevTools, then go to **Application → Cookies → https://fantasy.espn.com**.
3. Copy the value of **`espn_s2`**. It's a long string.
4. Copy the value of **`SWID`**, including the `{ }` braces.

Treat these like a password: anyone who has them can act as you on ESPN. They last about a year; if the league stops syncing, repeat this step and update the secrets.

## 2. Create the worker

1. Sign up or sign in at https://dash.cloudflare.com (the free plan is enough).
2. Go to **Workers & Pages → Create → Create Worker**, name it `espn-helper`, and click **Deploy**.
3. Click **Edit code**, replace everything with the contents of [`worker.js`](worker.js), and click **Deploy**.
4. Go to the worker's **Settings → Variables and Secrets** and add:

   | Name | Type | Value |
   | --- | --- | --- |
   | `ESPN_S2` | Secret | your `espn_s2` cookie |
   | `SWID` | Secret | your `SWID` cookie, with the braces |
   | `ALLOWED_ORIGIN` | Text | `https://zgemmell82.github.io` |
   | `LEAGUES` | Text | your private league ID (comma-separate if there are several) |

5. Copy the worker's address, e.g. `https://espn-helper.yourname.workers.dev`. Opening it in a browser should show `ESPN helper is running.`

## 3. Link the league in the app

1. On the **Leagues** tab, tap **Connect** on the league and choose **ESPN**.
2. Enter the **League ID** and **your team ID**. Both are in your team page's web address, after `leagueId=` and `teamId=`.
3. Turn on **Private league** and paste the worker address into **ESPN helper link**.
4. Tap **Test connection**. It should say `Connected — pulled … starters`.

The helper only passes read-only requests to ESPN's fantasy football API, and only for the leagues listed in `LEAGUES`.
