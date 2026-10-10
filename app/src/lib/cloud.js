// The account backend (Supabase): sign-in sessions and each account's saved leagues.
// The URL and anon key are public by design; what protects each account's data is the row-level
// security policy in supabase/schema.sql, which only lets a signed-in user touch their own row.
import { createClient } from '@supabase/supabase-js';

// Settings pasted into GitHub often carry quotes, spaces, a trailing slash or an API path; strip those.
const clean = v => String(v || '').trim().replace(/^["']+|["']+$/g, '').trim();
const url = clean(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '').replace(/\/(rest|auth)\/v1.*$/, '');
const key = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);

export const cloudHost = (() => { try { return new URL(url).host; } catch (e) { return ''; } })();

// A plain-English reason the saved address can't be right, or '' if it looks fine.
export const cloudProblem = !url || !key ? ''
  : !/^https?:\/\//i.test(url) ? 'The project URL has to start with https:// (it\'s saved as "' + url + '").'
  : /(^|\.)supabase\.com$/i.test(cloudHost) ? 'The saved URL is Supabase\'s website (' + cloudHost + '), not your project. Use the Project URL from Project Settings → API; it looks like https://abcdefghij.supabase.co.'
  : /^[a-z0-9]+$/i.test(key.split('.')[0]) && key.split('.').length === 3 && /service_role/.test(atobSafe(key.split('.')[1])) ? 'The saved key is the service_role key. Use the anon public key instead; the service_role key must never go in the app.'
  : '';

function atobSafe(v) { try { return atob(v.replace(/-/g, '+').replace(/_/g, '/')); } catch (e) { return ''; } }

export const cloudConfigured = !!(url && key);

// persistSession keeps people signed in on their device until they sign out; the token refreshes itself.
export const supabase = cloudConfigured && !cloudProblem
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ff-tracker-auth' } })
  : null;

// Asks the account server if it is there and accepts this key. Returns a message when something is wrong, else ''.
export async function checkCloud() {
  if (!supabase) return '';
  try {
    const r = await fetch(url + '/auth/v1/health', { headers: { apikey: key } });
    if (r.status === 401 || r.status === 403) return 'The server at ' + cloudHost + ' turned down the app\'s key. Check that SUPABASE_ANON_KEY is the anon public key from the same project.';
    if (!r.ok) return 'The server at ' + cloudHost + ' answered with an error (' + r.status + '). If the project was paused, restore it in the Supabase dashboard.';
    return '';
  } catch (e) {
    return 'Can\'t reach ' + cloudHost + '. Check that SUPABASE_URL is your project\'s URL (Project Settings → API → Project URL) and that the project isn\'t paused.';
  }
}

// The saved copy for one account: { state, at } or null if this account has never saved.
export async function pullState(userId) {
  const { data, error } = await supabase.from('tracker_state').select('state, updated_at').eq('user_id', userId).limit(1);
  if (error) throw new Error(error.message);
  const row = data && data[0];
  return row ? { state: row.state || {}, at: Date.parse(row.updated_at) || 0 } : null;
}

export async function pushState(userId, state, at) {
  const { error } = await supabase.from('tracker_state').upsert({ user_id: userId, state, updated_at: new Date(at).toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}
