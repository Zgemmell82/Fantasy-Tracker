// Spoken audio for Hot Route Radio, using the phone's or browser's built-in text-to-speech (no cost, no account).
// Two different voices play the two hosts; if the device only has one, pitch tells them apart.

export const speechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance !== 'undefined';

const FEMALE = ['samantha', 'karen', 'moira', 'tessa', 'victoria', 'zira', 'aria', 'jenny', 'fiona', 'allison', 'google us english', 'google uk english female', 'female'];
const MALE = ['daniel', 'alex', 'fred', 'tom', 'guy', 'david', 'mark', 'oliver', 'aaron', 'google uk english male', 'male'];

const english = voices => voices.filter(v => /^en([-_]|$)/i.test(v.lang || ''));
const named = (list, tokens) => list.find(v => tokens.some(t => String(v.name).toLowerCase().includes(t)));

// Two voices, preferably one that sounds female and one male. shared is true when the device has only one voice.
export function pickVoices(voices) {
  const en = english(voices || []);
  if (!en.length) return { a: null, b: null, shared: true };
  const a = named(en, FEMALE) || en[0];
  const b = named(en.filter(v => v !== a), MALE) || en.find(v => v !== a) || a;
  return { a, b, shared: a === b };
}

// The device's voices; they often arrive a moment after the page loads.
export function loadVoices() {
  return new Promise(resolve => {
    if (!speechSupported()) return resolve([]);
    const have = window.speechSynthesis.getVoices();
    if (have.length) return resolve(have);
    const done = () => { window.speechSynthesis.removeEventListener('voiceschanged', done); resolve(window.speechSynthesis.getVoices()); };
    window.speechSynthesis.addEventListener('voiceschanged', done);
    setTimeout(done, 1500);
  });
}

// iPhones only allow speech after a tap: call this straight from the button's click to unlock it.
export function unlockSpeech() {
  if (!speechSupported()) return;
  try {
    const u = new window.SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch (e) { /* speech isn't available; the show still runs as captions */ }
}

// Speaks one line and resolves when it ends (or after a safety timeout, since some phones never report the end).
export function speak(text, voice, { rate = 1.05, pitch = 1 } = {}) {
  return new Promise(resolve => {
    if (!speechSupported() || !text) return resolve();
    const u = new window.SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.rate = rate; u.pitch = pitch;
    let finished = false;
    const end = () => { if (!finished) { finished = true; clearTimeout(t); resolve(); } };
    const t = setTimeout(end, Math.max(4000, text.length * 110));
    u.onend = end; u.onerror = end;
    try { window.speechSynthesis.speak(u); } catch (e) { end(); }
  });
}

export function cancelSpeech() {
  try { if (speechSupported()) window.speechSynthesis.cancel(); } catch (e) { /* nothing to cancel */ }
}

// Keeps the screen on while the show plays (where the browser allows it), since built-in voices stop when it locks.
export async function keepAwake() {
  let lock = null;
  const get = async () => { try { lock = navigator.wakeLock ? await navigator.wakeLock.request('screen') : null; } catch (e) { lock = null; } };
  await get();
  const again = () => { if (document.visibilityState === 'visible') get(); };
  document.addEventListener('visibilitychange', again);
  return () => { document.removeEventListener('visibilitychange', again); try { lock && lock.release(); } catch (e) { /* already released */ } };
}
