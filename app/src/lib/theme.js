// "Game time": the 1:00 game is the light theme, the night game is the dark one (the default).
// It is a per-device choice, remembered in this browser.
const KEY = 'ff-theme';
const BAR = { light: '#f1f3f8', dark: '#0d1119' };

export function getTheme() {
  try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch (e) { return 'dark'; }
}

export function setTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  if (t === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = BAR[t];
  try { localStorage.setItem(KEY, t); } catch (e) {}
  return t;
}
