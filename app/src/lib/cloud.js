// The account backend (Supabase): sign-in sessions and each account's saved leagues.
// The URL and anon key are public by design; what protects each account's data is the row-level
// security policy in supabase/schema.sql, which only lets a signed-in user touch their own row.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cloudConfigured = !!(url && key);

// persistSession keeps people signed in on their device until they sign out; the token refreshes itself.
export const supabase = cloudConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ff-tracker-auth' } })
  : null;

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
