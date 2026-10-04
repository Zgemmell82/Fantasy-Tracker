// Everything is saved on the device. This copy of the app uses its own key so it never
// changes the original tracker's data; on first open it starts from the original's lineups.
export const LS = 'ff-tracker-custom-v1';
export const LS_ORIGINAL = 'ff-tracker-v3';
export const LS_PL = 'ff-sleeper-players';

export function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v == null ? fallback : v;
  } catch (e) { return fallback; }
}

export function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}
