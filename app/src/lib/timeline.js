// A league's win chance over the day: a point is saved whenever the odds or score move, and big jumps are
// tagged with the player whose points changed the most since the last point.
import { load, save } from './store.js';

export const LS_WP = week => 'ff-wp-2026-' + week;
const MAX_POINTS = 500, MIN_GAP = 4 * 60 * 1000, JUMP = 0.04;

const ptsOf = o => {
  const m = {};
  [...o.mine, ...o.opp].forEach(x => { if (typeof x.p.pts === 'number') m[x.who + ':' + x.p.name] = x.p.pts; });
  return m;
};

// The player whose points rose most since `before`, as { n, who, d } (null if nothing moved).
export function biggestMover(before, o) {
  let best = null;
  [...o.mine, ...o.opp].forEach(x => {
    if (typeof x.p.pts !== 'number') return;
    const d = x.p.pts - (before[x.who + ':' + x.p.name] || 0);
    if (d > 0.4 && (!best || d > best.d)) best = { n: x.p.name, who: x.who, d: Math.round(d * 10) / 10 };
  });
  return best;
}

// series: { [league]: { pts: {…}, points: [{ t, wp, me, them, note? }] } }. Returns a new series (or the same one if nothing changed).
export function record(series, outlooks, now = Date.now()) {
  let next = series;
  outlooks.forEach(o => {
    const cur = next[o.name] || { pts: {}, points: [] };
    const last = cur.points[cur.points.length - 1];
    if (o.approx) return;
    const wp = Math.round(o.wp * 1000) / 1000;
    const moved = !last || Math.abs(wp - last.wp) >= 0.005 || o.me !== last.me || o.them !== last.them;
    if (!moved || (last && now - last.t < MIN_GAP && Math.abs(wp - last.wp) < JUMP)) return;
    const pt = { t: now, wp, me: o.me, them: o.them };
    if (last && Math.abs(wp - last.wp) >= JUMP) {
      const m = biggestMover(cur.pts, o);
      if (m) pt.note = m;
    }
    const points = [...cur.points, pt].slice(-MAX_POINTS);
    if (next === series) next = { ...series };
    next[o.name] = { pts: ptsOf(o), points };
  });
  return next;
}

// The biggest moves of the day, largest first: [{ t, delta, wp, note }].
export function biggestSwings(points, n = 3) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const d = points[i].wp - points[i - 1].wp;
    if (Math.abs(d) >= JUMP) out.push({ t: points[i].t, delta: d, wp: points[i].wp, note: points[i].note || null });
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, n);
}

export const loadSeries = week => load(LS_WP(week), {});
export const saveSeries = (week, s) => save(LS_WP(week), s);
