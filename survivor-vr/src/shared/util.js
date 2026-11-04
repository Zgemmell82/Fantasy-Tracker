// Small shared helpers.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const uid = () => Math.random().toString(36).slice(2, 9);

export function countSentences(text) {
  const parts = text.trim().split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  return parts.length;
}

export function fmtTime(s) {
  if (s == null) return '--';
  const m = Math.floor(s / 60);
  const r = (s - m * 60).toFixed(1).padStart(m ? 4 : 3, '0');
  return m ? `${m}:${r}` : r;
}
