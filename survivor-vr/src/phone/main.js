// Phone controller. One real phone = one player. The debug drawer (gear button) lets a single
// tab pose as several fake players so the whole loop can be tested alone.
import { connect } from '../shared/net.js';
import { GAME } from '../config/game.js';
import { CHALLENGE_LIST } from '../config/meta.js';
import { countSentences, uid } from '../shared/util.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { return JSON.parse(sessionStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// identities this tab can act as: the real player + any fake ones from the debug panel
let ids = store.get('ids', null);
if (!ids) { ids = [{ pid: 'p_' + uid(), name: '', fake: false }]; store.set('ids', ids); }
let meIdx = Math.min(store.get('me', 0), ids.length - 1);
const me = () => ids[meIdx];
let S = null;
let joinError = '';
let voteDraft = { target: null, message: '' };
let toastTimer = null;
const fakeNames = ['Coconut', 'Mango', 'Tiki', 'Parrot', 'Lava', 'Reef'];

const net = connect({
  role: 'phone',
  onMessage: (m) => {
    if (m.t === 'state') { S = m.s; render(); renderDbg(); }
    else if (m.pid && m.pid === me().pid) {
      if (m.t === 'joinResult' && !m.ok) { joinError = m.reason || 'Could not join.'; render(); }
      if ((m.t === 'tapResult' || m.t === 'voteResult') && !m.ok) toast(m.reason || 'Not allowed');
    }
  },
});
setInterval(() => { if (!S) net.send({ t: 'hello' }); }, 1500);
setTimeout(() => net.send({ t: 'hello' }), 300);

function toast(t) {
  const el = $('#toast'); el.textContent = t; el.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.style.display = 'none'), 2500);
}
const playerOf = (id) => S?.players.find((p) => p.id === id);
const nameOf = (id) => playerOf(id)?.name || '?';

function join(name) {
  me().name = name; store.set('ids', ids); joinError = '';
  net.send({ t: 'join', pid: me().pid, name });
}
function tap(kind) { net.send({ t: 'tap', pid: me().pid, kind }); }
function vote() {
  net.send({ t: 'vote', pid: me().pid, target: voteDraft.target, message: voteDraft.message });
}

// ---------- rendering ----------
let lastKey = '';
function render() {
  const app = $('#app');
  if (!S) { app.innerHTML = `<div class="card center"><h2>🌴 Connecting…</h2><div class="muted">Looking for the host page.</div></div>`; return; }
  const mine = playerOf(me().pid);
  // keep a draft vote across re-renders; only rebuild DOM when the visible screen changes
  const key = [S.phase, S.round, S.headsetId, mine ? 'in' : 'out', S.taps?.[me().pid] || '', S.voted?.includes(me().pid), S.immunityId, meIdx, joinError, S.readout?.index, S.votedOut?.join(), S.tapsLeft === 0].join('|');
  if (key === lastKey) return;
  lastKey = key;

  let html = `<header><div class="me">${mine ? `<span class="dot" style="background:${mine.color}"></span>${esc(mine.name)}` : '🌴 Survivor VR'}${S.immunityId === me().pid ? ' 🛡️' : ''}</div>
    <span class="pill">${S.round ? 'Round ' + S.round : 'Lobby'}</span></header>`;

  if (!mine) {
    html += `<div class="card"><h2>Join the tribe</h2><p class="muted">${esc(joinError || 'Pick a name and tap Join.')}</p>
      <input type="text" id="nm" maxlength="14" placeholder="Your name" value="${esc(me().name)}" />
      <div style="height:12px"></div><button class="btn" id="join">Join</button></div>`;
    $('#app').innerHTML = html;
    $('#join').onclick = () => join(($('#nm').value || '').trim() || 'Castaway');
    return;
  }

  const meId = me().pid;
  const isHeadset = S.headsetId === meId;
  const ch = CHALLENGE_LIST.find((c) => c.id === S.challengeId);

  switch (S.phase) {
    case 'lobby':
    case 'roundEnd':
      html += `<div class="card center"><h2>${S.phase === 'roundEnd' ? 'Round over' : "You're in!"}</h2>
        <p class="muted">${S.phase === 'roundEnd' ? roundEndText() : 'Waiting for the host to pick a challenge…'}</p>
        <div>${S.players.map((p) => `<span class="pill" style="margin:3px"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</span>`).join('')}</div></div>`;
      break;
    case 'turnReady':
    case 'countdown':
      html += isHeadset
        ? `<div class="card center"><h2>🥽 You're up!</h2><p>${esc(ch?.name)}: ${esc(ch?.blurb)}</p><p class="muted">Put on the headset. Stay seated or standing in one spot.</p></div>`
        : `<div class="card center"><h2>${esc(nameOf(S.headsetId))} is up next</h2><p class="muted">${esc(ch?.name)}. When the run starts you get <b>one</b> tap: HELP or SABOTAGE.</p></div>`;
      html += tapButtons(true, isHeadset);
      break;
    case 'running':
      html += isHeadset
        ? `<div class="card center"><h2>🥽 You're in the headset!</h2><p class="muted">Focus. The tribe is deciding your fate…</p></div>`
        : `<div class="card center"><div class="muted">${esc(nameOf(S.headsetId))} is playing</div><div style="font-size:20px;margin-top:4px">One tap only. Choose wisely.</div></div>` + tapButtons(false, false);
      break;
    case 'turnResult': {
      const r = S.results[S.headsetId];
      html += `<div class="card center"><h2>${esc(nameOf(S.headsetId))}</h2><div style="font-size:36px;font-weight:900;color:var(--fire2)">${esc(r?.display ?? '')}</div></div>`;
      break;
    }
    case 'roundResults':
      html += `<div class="card"><h2>Results</h2>${S.ranking.map((id, i) => `<div class="opt ${i === 0 ? 'sel' : ''}"><b>${i + 1}</b> <span class="dot" style="background:${playerOf(id)?.color}"></span>${esc(nameOf(id))}<span style="margin-left:auto">${esc(S.results[id].display)}</span></div>`).join('')}
        <p class="center">🛡️ <b>${esc(nameOf(S.immunityId))}</b> wins immunity${S.immunityId === meId ? ' - that is YOU!' : ''}.</p></div>`;
      break;
    case 'voting':
      html += votingHtml(meId);
      break;
    case 'readout':
      html += `<div class="card center"><h2>🔥 Eyes on the TV</h2><p class="muted">Votes are being read aloud…</p></div>`;
      break;
  }
  $('#app').innerHTML = html;
  wire();
}

function roundEndText() {
  const out = S.votedOut || [];
  return `${out.length ? `${esc(nameOf(out[0]))} got the most votes.` : 'It was a tie - nobody goes home.'} 🛡️ ${esc(nameOf(S.immunityId))} had immunity.`;
}

function tapButtons(early, isHeadset) {
  const mineTap = S.taps?.[me().pid];
  const open = S.phase === 'running' && !isHeadset && !mineTap;
  return `<div class="big2">
    <button class="tap help ${mineTap === 'help' ? 'picked' : ''}" data-tap="help" ${open ? '' : 'disabled'}>✨ HELP</button>
    <button class="tap sabotage ${mineTap === 'sabotage' ? 'picked' : ''}" data-tap="sabotage" ${open ? '' : 'disabled'}>💥 SABOTAGE</button>
  </div>
  <div class="center muted">${isHeadset ? 'You cannot tap on your own run.' : mineTap ? 'Tap locked in. Nobody knows it was you.' : early ? 'Taps open when the run starts.' : 'Exactly one tap per run.'}</div>`;
}

function votingHtml(meId) {
  if (S.voted.includes(meId)) return `<div class="card center"><h2>✅ Vote locked in</h2><p class="muted">Waiting for the others…</p></div>`;
  const imm = S.immunityId;
  const cands = S.players.filter((p) => !p.eliminated);
  return `<div class="card"><h2>🔥 Tribal Council</h2>
    <p class="muted">Pick who goes home. Immunity holder is safe. Your message is read out anonymously.</p>
    ${cands.map((p) => {
      const blocked = p.id === imm || (!GAME.vote.allowSelfVote && p.id === meId);
      return `<div class="opt ${blocked ? 'imm' : ''} ${voteDraft.target === p.id ? 'sel' : ''}" data-v="${blocked ? '' : p.id}">
        <span class="dot" style="background:${p.color}"></span>${esc(p.name)}${p.id === imm ? ' 🛡️ immune' : p.id === meId ? ' (you)' : ''}</div>`;
    }).join('')}
    <textarea id="msg" maxlength="${GAME.vote.maxChars}" placeholder="Why? (1-${GAME.vote.maxSentences} sentences)">${esc(voteDraft.message)}</textarea>
    <div class="count" id="cnt"></div>
    <button class="btn" id="cast">Cast vote</button></div>`;
}

function wire() {
  document.querySelectorAll('[data-tap]').forEach((b) => (b.onclick = () => tap(b.dataset.tap)));
  document.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => {
    if (!b.dataset.v) return;
    voteDraft.target = b.dataset.v;
    document.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('sel', x === b));
    validate();
  }));
  const ta = $('#msg');
  if (ta) ta.oninput = () => { voteDraft.message = ta.value; validate(); };
  const cast = $('#cast');
  if (cast) { cast.onclick = vote; validate(); }
}

function validate() {
  const cast = $('#cast'); if (!cast) return;
  const msg = voteDraft.message.trim();
  const n = countSentences(msg);
  const ok = voteDraft.target && msg.length >= GAME.vote.minChars && n <= GAME.vote.maxSentences;
  cast.disabled = !ok;
  $('#cnt').textContent = `${msg.length}/${GAME.vote.maxChars} · ${n}/${GAME.vote.maxSentences} sentences${n > GAME.vote.maxSentences ? ' - too many!' : ''}`;
}

// reset vote draft each new tribal
let lastRoundForDraft = -1;
setInterval(() => { if (S && S.phase === 'voting' && lastRoundForDraft !== S.round) { lastRoundForDraft = S.round; voteDraft = { target: null, message: '' }; lastKey = ''; render(); } }, 400);

// ---------- debug drawer ----------
$('#dbgbtn').onclick = () => { const d = $('#dbg'); d.style.display = d.style.display === 'block' ? 'none' : 'block'; renderDbg(); };
if (location.search.includes('debug')) $('#dbg').style.display = 'block';

function renderDbg() {
  const d = $('#dbg');
  if (d.style.display !== 'block') return;
  const joined = (pid) => !!playerOf(pid);
  d.innerHTML = `<div class="muted" style="margin-bottom:8px">Debug: act as several fake players from this one tab.</div>
    <div class="row"><label>Acting as</label>
      <select id="who">${ids.map((x, i) => `<option value="${i}" ${i === meIdx ? 'selected' : ''}>${esc(x.name || '(me, not joined)')}${x.fake ? ' [fake]' : ''}${joined(x.pid) ? '' : ' - not joined'}</option>`).join('')}</select></div>
    <div class="row" style="margin-top:8px">
      <button class="btn" id="addfake">+ Add fake player</button>
      <button class="btn" id="joinall">Join all</button>
      <button class="btn" id="randvote">Auto-vote (all)</button>
      <button class="btn" id="randtap">Random tap (all)</button></div>`;
  $('#who').onchange = (e) => { meIdx = +e.target.value; store.set('me', meIdx); lastKey = ''; voteDraft = { target: null, message: '' }; render(); renderDbg(); };
  $('#addfake').onclick = () => {
    const used = new Set(ids.map((x) => x.name));
    const name = fakeNames.find((n) => !used.has(n)) || 'Fake' + ids.length;
    const x = { pid: 'f_' + uid(), name, fake: true };
    ids.push(x); store.set('ids', ids);
    net.send({ t: 'join', pid: x.pid, name });
    meIdx = ids.length - 1; store.set('me', meIdx); lastKey = ''; render(); renderDbg();
  };
  $('#joinall').onclick = () => { for (const x of ids) if (x.name && !joined(x.pid)) net.send({ t: 'join', pid: x.pid, name: x.name }); };
  $('#randtap').onclick = () => { for (const x of ids) net.send({ t: 'tap', pid: x.pid, kind: Math.random() < 0.5 ? 'help' : 'sabotage' }); };
  $('#randvote').onclick = () => {
    const lines = ['Too sneaky for my taste.', 'You are the biggest threat. Sorry!', 'Nothing personal, pure strategy.', 'I did not like that last move. Bye.'];
    for (const x of ids) {
      const opts = S.players.filter((p) => p.id !== x.pid && p.id !== S.immunityId);
      if (!opts.length) continue;
      net.send({ t: 'vote', pid: x.pid, target: opts[Math.floor(Math.random() * opts.length)].id, message: lines[Math.floor(Math.random() * lines.length)] });
    }
  };
}
