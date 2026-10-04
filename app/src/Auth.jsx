import { useEffect, useState } from 'react';
import { cloudConfigured, supabase } from './lib/cloud.js';
import { Icon } from './ui.jsx';

// Who is signed in. The session is kept on the device, so a person signs in once and stays signed in.
export function useSession() {
  const [s, setS] = useState({ status: cloudConfigured ? 'loading' : 'setup', user: null, recovery: false });
  useEffect(() => {
    if (!supabase) return;
    // Token refreshes hand back the same user; keep the same object so the app below doesn't re-render for them.
    const set = (user, recovery) => setS(prev => prev.user && user && prev.user.id === user.id && prev.recovery === recovery ? prev : { status: user ? 'in' : 'out', user, recovery });
    supabase.auth.getSession().then(({ data }) => set(data.session ? data.session.user : null, false));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') set(session && session.user, true);
      else set(session ? session.user : null, false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return [s, setS];
}

const friendly = msg => {
  const m = String(msg || '');
  if (/invalid login/i.test(m)) return 'That email and password don\'t match.';
  if (/already registered|already been registered/i.test(m)) return 'There\'s already an account with that email. Try signing in.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first: open the link we sent, then sign in.';
  if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a minute and try again.';
  if (/fetch|network/i.test(m)) return 'Couldn\'t reach the server. Check your connection.';
  return m || 'Something went wrong. Try again.';
};

const here = () => window.location.origin + window.location.pathname;

function Shell({ children }) {
  return (
    <div className="app">
      <main className="body auth-body">
        <div className="auth">
          <img className="auth-logo" src="icon-v2.svg" alt="" width="64" height="64" />
          <h1 className="title">Fantasy Tracker</h1>
          {children}
        </div>
      </main>
    </div>
  );
}

export function Splash() {
  return <Shell><div className="auth-sub"><span className="auth-spin" aria-hidden="true" />Loading…</div></Shell>;
}

export function SetupNeeded() {
  return (
    <Shell>
      <div className="card auth-card">
        <p className="auth-sub">Sign-in isn't set up yet.</p>
        <p className="sheet-note">The app needs its account server. In the repository, add the <b>SUPABASE_URL</b> and <b>SUPABASE_ANON_KEY</b> variables (Settings → Secrets and variables → Actions → Variables) and run the deploy again. The steps are in <b>app/README.md</b>.</p>
      </div>
    </Shell>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState('in');           // in | up | forgot
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const go = mode => { setMode(mode); setErr(''); setNote(''); };

  const submit = async e => {
    e.preventDefault();
    setErr(''); setNote('');
    const em = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(em)) { setErr('Enter a valid email address.'); return; }
    if (mode !== 'forgot' && password.length < (mode === 'up' ? 8 : 1)) { setErr(mode === 'up' ? 'Use at least 8 characters for the password.' : 'Enter your password.'); return; }
    setBusy(true);
    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo: here() });
        if (error) throw error;
        setNote('If there\'s an account for ' + em + ', a reset link is on its way.');
      } else if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email: em, password, options: { emailRedirectTo: here() } });
        if (error) throw error;
        // With email confirmation on, there is no session until the link is opened.
        if (!data.session) { go('in'); setNote('Almost there: open the confirmation link we emailed to ' + em + ', then sign in.'); }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: em, password });
        if (error) throw error;
      }
    } catch (ex) { setErr(friendly(ex.message)); }
    setBusy(false);
  };

  return (
    <Shell>
      <p className="auth-sub">{mode === 'up' ? 'Create an account to keep your leagues on every device.' : mode === 'forgot' ? 'We\'ll email you a link to choose a new password.' : 'Sign in to open your dashboard.'}</p>
      <form className="card auth-card" onSubmit={submit} noValidate>
        {mode !== 'forgot' && (
          <div className="segmented auth-tabs" role="tablist" style={{ '--n': 2, '--i': mode === 'up' ? 1 : 0 }}>
            <span className="seg-thumb" aria-hidden="true" />
            <button type="button" role="tab" aria-selected={mode === 'in'} className={mode === 'in' ? 'on' : ''} onClick={() => go('in')}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === 'up'} className={mode === 'up' ? 'on' : ''} onClick={() => go('up')}>Create account</button>
          </div>
        )}
        <div className="field">
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" inputMode="email" autoCapitalize="off" autoCorrect="off" placeholder="you@example.com" />
        </div>
        {mode !== 'forgot' && (
          <div className="field">
            <label htmlFor="auth-pass">Password</label>
            <input id="auth-pass" className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} placeholder={mode === 'up' ? 'At least 8 characters' : 'Password'} />
          </div>
        )}
        {err && <div className="banner err" role="alert"><Icon.alert size={16} sw={2.5} /><span>{err}</span></div>}
        {note && <div className="banner ok" role="status"><Icon.check size={16} sw={2.5} /><span>{note}</span></div>}
        <button className="pill-btn primary wide" type="submit" disabled={busy}>
          {busy ? 'One moment…' : mode === 'up' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
        </button>
        {mode === 'in' && <button type="button" className="text-btn auth-link" onClick={() => go('forgot')}>Forgot password?</button>}
        {mode === 'forgot' && <button type="button" className="text-btn auth-link" onClick={() => go('in')}>Back to sign in</button>}
      </form>
    </Shell>
  );
}

// Shown after someone opens a password-reset link.
export function NewPassword({ onDone }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault();
    if (password.length < 8) { setErr('Use at least 8 characters for the password.'); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setErr(friendly(error.message)); else onDone();
  };
  return (
    <Shell>
      <p className="auth-sub">Choose a new password.</p>
      <form className="card auth-card" onSubmit={submit}>
        <div className="field">
          <label htmlFor="new-pass">New password</label>
          <input id="new-pass" className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
        </div>
        {err && <div className="banner err" role="alert"><Icon.alert size={16} sw={2.5} /><span>{err}</span></div>}
        <button className="pill-btn primary wide" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </Shell>
  );
}
