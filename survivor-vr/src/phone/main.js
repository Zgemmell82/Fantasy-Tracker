// Phone controller. One real phone = one player. The debug drawer (gear button) lets a single
// tab pose as several fake players so every phase can be tested alone.
import { connect } from '../shared/net.js';
import { GAME } from '../config/game.js';
import { CHALLENGE_META } from '../config/meta.js';
import { countSentences, uid } from '../shared/util.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { return JSON.parse(sessionStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

let ids = store.get('ids', null);
if (!ids) { ids = [{ pid: 'p_' + uid(), name: '', fake: false }]; store.set('ids', ids); }
let meIdx = Math.min(store.get('me', 0), ids.length - 1);
const me = () => ids[meIdx];
let S = null, net = null, room = '';
let joinError = '';
let voteDraft = { key: '', target: null, message: '' };
let myPick = null;
let toastTimer = null;
const fakeNames = GAME.botNames;

function connectRoom(code) {
  room = code.toUpperCase().trim(); store.set('room', room);
  net?.close(); S = null;
  net = connect({
    role: 'phone', room,
    onMessage: (m) => {
      if (m.t === 'state') { S = m.s; render(); renderDbg(); }
      else if (m.pid && m.pid === me().pid) {
        if (m.t === 'joinResult' && !m.ok) { joinError = m.reason || 'Could not join.'; lastKey = ''; render(); }
        if ((m.t === 'tapResult' || m.t === 'voteResult') && !m.ok) toast(m.reason || 'Not allowed');
      }
    },
  });
  setTimeout(() => net.send({ t: 'hello' }), 300);
  render();
}
setInterval(() => { if (net && !S) net.send({ t: 'hello' }); }, 1500);

function toast(t) {
  const el = $('#toast'); el.textContent = t; el.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.style.display = 'none'), 2500);
}
const playerOf = (id) => S?.players.find((p) => p.id === id);
const nameOf = (id) => playerOf(id)?.name || '?';
const tribeOf = (tid) => S?.tribes.find((t) => t.id === tid);
const send = (m) => net?.send(m);

function join(name) { me().name = name; store.set('ids', ids); joinError = ''; send({ t: 'join', pid: me().pid, name }); }

// ---------- rendering ----------
let lastKey = '';
function render() {
  const app = $('#app');
  if (!room) {
    app.innerHTML = `<div class="card"><h2>🌴 Survivor VR</h2><p class="muted">Enter the room code shown on the TV.</p>
      <input type="text" id="rc" maxlength="6" placeholder="ROOM CODE" style="text-transform:uppercase;text-align:center;font-size:28px;letter-spacing:.2em">
      <div style="height:12px"></div><button class="btn" id="rcgo">Connect</button></div>`;
    $('#rcgo').onclick = () => { const v = $('#rc').value.trim(); if (v) connectRoom(v); };
    return;
  }
  if (!S) { app.innerHTML = `<div class="card center"><h2>🌴 Connecting…</h2><div class="muted">Looking for room <b>${esc(room)}</b>. <a href="#" id="chg" style="color:var(--fire2)">Change code</a></div></div>`; $('#chg').onclick = (e) => { e.preventDefault(); room = ''; store.set('room', ''); render(); }; return; }
  const mine = playerOf(me().pid), T = S.tribal;
  const key = [S.phase, S.episode, S.headsetId, mine ? mine.status + mine.tribe : 'out', S.taps?.[me().pid] || '', T?.voted?.includes(me().pid), T?.stage, S.immunityId, meIdx, joinError,
    S.jury?.voted?.includes(me().pid), S.tappers?.includes(me().pid), S.finale?.pitchIndex, S.tribal?.readout?.index, S.merged, S.winnerId].join('|');
  if (key === lastKey) return;
  lastKey = key;
  if (!mine) {
    app.innerHTML = `<div class="card"><h2>Join the tribe</h2><p class="muted">Room <b>${esc(room)}</b> · ${esc(joinError || 'Pick a name and tap Join.')}</p>
      <input type="text" id="nm" maxlength="14" placeholder="Your name" value="${esc(me().name)}" />
      <div style="height:12px"></div><button class="btn" id="join">Join</button></div>`;
    $('#join').onclick = () => join(($('#nm').value || '').trim() || 'Castaway');
    return;
  }
  const t = mine.tribe && tribeOf(mine.tribe);
  const head = `<header><div class="me"><span class="dot" style="background:${mine.color}"></span>${esc(mine.name)}${S.immunityId === mine.id && S.phase !== 'lobby' && mine.status === 'active' ? ' 🛡️' : ''}
    ${t ? `<span class="pill" style="background:${t.color};color:#111">${esc(t.name)}</span>` : ''}${mine.status === 'juror' ? '<span class="pill">juror</span>' : mine.status === 'out' ? '<span class="pill">out</span>' : ''}</div>
    <span class="pill">${S.episode ? 'Ep ' + S.episode : 'Lobby'} · ${esc(room)}</span></header>`;
  app.innerHTML = head + body(mine);
  wire();
}

const card = (h, p = '') => `<div class="card center"><h2>${h}</h2>${p ? `<p class="muted">${p}</p>` : ''}</div>`;

function body(mine) {
  const meId = mine.id, T = S.tribal, F = S.finale;
  const isHeadset = S.headsetId === meId;
  const ch = CHALLENGE_META[S.run?.challengeId || S.challengeId];
  const watchWhy = mine.status !== 'active' ? (mine.status === 'juror' ? "You're on the jury - watch closely, you'll vote at the end." : "You're out of the game. Watch the TV.") :
    S.episodeType === 'team' && S.run && mine.tribe !== S.run.group ? "Your tribe is watching. No taps for you this run." : 'Watch the TV.';
  switch (S.phase) {
    case 'lobby': return card("You're in!", 'Waiting for the host to start…') + `<div class="center">${S.players.map((p) => `<span class="pill" style="margin:3px"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</span>`).join('')}</div>`;
    case 'tribes': { const tt = tribeOf(mine.tribe); return tt ? `<div class="card center" style="border-color:${tt.color}"><h2 style="color:${tt.color}">You are on ${esc(tt.name)}</h2><p>${S.players.filter((p) => p.tribe === tt.id).map((p) => esc(p.name)).join(', ')}</p></div>` : card('Welcome', 'One tribe. Every player for themselves.'); }
    case 'picker': return card('Waiting…', 'The host is picking the next challenge.');
    case 'turnReady': case 'countdown': case 'handoff': case 'running': {
      if (isHeadset) return card(S.phase === 'running' ? "🥽 You're in the headset!" : "🥽 You're up!", S.phase === 'running' ? 'Focus. Your tribe is deciding your fate…' : `${esc(ch?.name)}: ${esc(ch?.blurb)}`);
      const tapper = S.tappers.includes(meId);
      if (!tapper) return card(`${esc(nameOf(S.headsetId))} is playing`, watchWhy);
      const picked = S.taps?.[meId], open = S.phase === 'running' && !picked;
      const rule = S.episodeType === 'team' ? 'Relay: you may even sabotage a teammate. Nobody will know it was you.' : 'Exactly one tap per run.';
      return card(`${esc(nameOf(S.headsetId))} is ${S.phase === 'running' ? 'playing' : 'up'}`, esc(ch?.name || '')) + `<div class="big2">
        <button class="tap help ${picked === 'help' ? 'picked' : ''}" data-tap="help" ${open ? '' : 'disabled'}>✨ HELP</button>
        <button class="tap sabotage ${picked === 'sabotage' ? 'picked' : ''}" data-tap="sabotage" ${open ? '' : 'disabled'}>💥 SABOTAGE</button></div>
        <div class="center muted">${picked ? 'Tap locked in. Anonymous.' : S.phase !== 'running' ? 'Taps open when the run starts.' : rule}</div>`;
    }
    case 'turnResult': return card(esc(nameOf(S.headsetId)), `<span style="font-size:34px;font-weight:900;color:var(--fire2)">${esc(S.lastResult?.display ?? '')}</span>`);
    case 'roundResults':
      if (S.team) return card(`${esc(tribeOf(S.team.winning).name)} win!`, `${esc(tribeOf(S.team.losing).name)} goes to Tribal Council.${mine.tribe === S.team.losing ? ' <b>That is YOUR tribe.</b>' : mine.tribe ? ' Your tribe is safe.' : ''}`);
      return `<div class="card"><h2>Results</h2>${S.ranking.map((id, i) => `<div class="opt ${i === 0 ? 'sel' : ''}"><b>${i + 1}</b> <span class="dot" style="background:${playerOf(id)?.color}"></span>${esc(nameOf(id))}<span style="margin-left:auto">${esc(S.results[id]?.display)}</span></div>`).join('')}
        <p class="center">🛡️ <b>${esc(nameOf(S.immunityId))}</b> wins immunity${S.immunityId === meId ? ' - that is YOU!' : ''}.</p></div>`;
    case 'voting': return votingHtml(mine);
    case 'readout': return card('🔥 Eyes on the TV', 'Votes are being read aloud…');
    case 'tie': return card("It's a tie!", T.tied.includes(meId) ? 'You are tied. Watch the TV.' : 'Watch the TV.');
    case 'unanimous': {
      if (!T.voters2.includes(meId)) return card('Unanimous decision', T.tied.includes(meId) ? 'You are tied - you do not vote. Plead your case out loud!' : 'Watch the TV.');
      return `<div class="card"><h2>Unanimous decision</h2><p class="muted">Talk it out! Everyone left must pick the SAME player.</p>
        ${T.tied.map((id) => `<div class="opt ${myPick === id ? 'sel' : ''}" data-pick="${id}"><span class="dot" style="background:${playerOf(id)?.color}"></span>${esc(nameOf(id))}</div>`).join('')}</div>`;
    }
    case 'draw': return card('🎲 Random draw', 'Players who got no votes: equal chance. Watch the TV…');
    case 'tribalResult': return card(`${esc(nameOf(T.result.eliminated))} is voted out`, T.result.eliminated === meId ? 'Your torch is snuffed. Thanks for playing!' + (T.result.wasJuror ? ' You are now a juror.' : '') : 'The tribe has spoken.');
    case 'merge': return card('🤝 The tribes merge!', 'From now on, every player for themselves.');
    case 'finaleIntro': return card('🏝️ The finale', F.ids.includes(meId) ? 'You are a finalist-hopeful: you play all four challenges.' : 'Jurors: watch everything. You will vote for the winner.');
    case 'finaleScores': { const row = F.rows[F.rows.length - 1]; return `<div class="card"><h2>${esc(CHALLENGE_META[row.challengeId].name)}</h2>${row.entries.map((e) => `<div class="opt"><b>${e.rank}</b> ${esc(nameOf(e.id))}<span style="margin-left:auto">+${+e.points.toFixed(1)}</span></div>`).join('')}</div>`; }
    case 'finaleImmunity': return card(`🛡️ ${esc(nameOf(F.immunityId))} wins immunity`, F.immunityId === meId ? "You're safe - you can't lose the fire challenge." : F.ids.includes(meId) ? 'You face off in fire-making!' : 'The other two make fire.');
    case 'fireResult': return card(`🔥 ${esc(nameOf(F.fire.winner))} wins fire`, F.finalists.includes(meId) ? 'You are a FINALIST!' : `${esc(nameOf(F.fire.loser))} joins the jury.`);
    case 'pitch': return card(`🎤 ${esc(nameOf(F.pitchOrder[F.pitchIndex]))} is pitching`, 'Listen carefully, jurors.');
    case 'jury': {
      if (!S.jury.jurors.includes(meId)) return card('Jury is voting', 'Wait for the reveal on the TV.');
      if (S.jury.voted.includes(meId)) return card('✅ Vote locked in', 'Waiting for the other jurors…');
      return `<div class="card"><h2>🏆 Jury vote</h2><p class="muted">Who should be the Sole Survivor?</p>${F.finalists.map((id) => `<div class="opt" data-jury="${id}" style="font-size:22px"><span class="dot" style="background:${playerOf(id)?.color}"></span>${esc(nameOf(id))}</div>`).join('')}</div>`;
    }
    case 'juryReveal': return card('🏆 Jury reveal', 'Eyes on the TV…');
    case 'winner': return card(S.winnerId === meId ? '👑 YOU WON!' : `👑 ${esc(nameOf(S.winnerId))} wins!`, 'Thanks for playing.');
  }
  return card('…');
}

function votingHtml(mine) {
  const T = S.tribal, meId = mine.id;
  if (!T.voters.includes(meId)) return card('Tribal Council', S.episodeType === 'team' ? 'Your tribe is safe tonight. Watch the TV.' : mine.status === 'juror' ? "You're on the jury. Watch the TV." : 'Watch the TV.');
  if (T.voted.includes(meId)) return card('✅ Vote locked in', 'Waiting for the others…');
  const key = S.episode + ':' + T.stage;
  if (voteDraft.key !== key) voteDraft = { key, target: null, message: '' };
  const cands = T.targets.filter((id) => GAME.vote.allowSelfVote || id !== meId);
  const title = T.stage === 'revote' ? `🔥 TIE - REVOTE` : '🔥 Tribal Council';
  const sub = T.stage === 'revote' ? 'Everyone votes again, but only for the tied players. Say why in 1-2 sentences.' : `Pick who goes home${S.episodeType === 'individual' ? '. The immunity holder is safe' : ''}. Your message is read out anonymously.`;
  return `<div class="card"><h2>${title}</h2><p class="muted">${sub}</p>
    ${cands.map((id) => `<div class="opt ${voteDraft.target === id ? 'sel' : ''}" data-v="${id}"><span class="dot" style="background:${playerOf(id)?.color}"></span>${esc(nameOf(id))}</div>`).join('')}
    ${S.episodeType === 'individual' && S.immunityId ? `<div class="opt imm">🛡️ ${esc(nameOf(S.immunityId))} (immune)</div>` : ''}
    <textarea id="msg" maxlength="${GAME.vote.maxChars}" placeholder="Why? (1-${GAME.vote.maxSentences} sentences)">${esc(voteDraft.message)}</textarea>
    <div class="count" id="cnt"></div><button class="btn" id="cast">Cast vote</button></div>`;
}

function wire() {
  document.querySelectorAll('[data-tap]').forEach((b) => (b.onclick = () => send({ t: 'tap', pid: me().pid, kind: b.dataset.tap })));
  document.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => {
    voteDraft.target = b.dataset.v;
    document.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('sel', x === b));
    validate();
  }));
  document.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => {
    myPick = b.dataset.pick; send({ t: 'pick', pid: me().pid, target: myPick });
    document.querySelectorAll('[data-pick]').forEach((x) => x.classList.toggle('sel', x === b));
  }));
  document.querySelectorAll('[data-jury]').forEach((b) => (b.onclick = () => send({ t: 'jury', pid: me().pid, target: b.dataset.jury })));
  const ta = $('#msg');
  if (ta) ta.oninput = () => { voteDraft.message = ta.value; validate(); };
  const cast = $('#cast');
  if (cast) { cast.onclick = () => send({ t: 'vote', pid: me().pid, target: voteDraft.target, message: voteDraft.message }); validate(); }
}

function validate() {
  const cast = $('#cast'); if (!cast) return;
  const msg = voteDraft.message.trim(), n = countSentences(msg);
  cast.disabled = !(voteDraft.target && msg.length >= GAME.vote.minChars && n <= GAME.vote.maxSentences);
  $('#cnt').textContent = `${msg.length}/${GAME.vote.maxChars} · ${n}/${GAME.vote.maxSentences} sentences${n > GAME.vote.maxSentences ? ' - too many!' : ''}`;
}

// ---------- debug drawer ----------
$('#dbgbtn').onclick = () => { const d = $('#dbg'); d.style.display = d.style.display === 'block' ? 'none' : 'block'; renderDbg(); };
if (location.search.includes('debug')) $('#dbg').style.display = 'block';

function renderDbg() {
  const d = $('#dbg');
  if (d.style.display !== 'block') return;
  if (d.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
  const joined = (pid) => !!playerOf(pid);
  d.innerHTML = `<div class="muted" style="margin-bottom:8px">Debug: act as several fake players from this one tab.</div>
    <div class="row"><label>Acting as</label>
      <select id="who">${ids.map((x, i) => `<option value="${i}" ${i === meIdx ? 'selected' : ''}>${esc(x.name || '(me, not joined)')}${x.fake ? ' [fake]' : ''}${joined(x.pid) ? '' : ' - not joined'}</option>`).join('')}</select></div>
    <div class="row" style="margin-top:8px">
      <button class="btn" id="addfake">+ Add fake player</button><button class="btn" id="add5">+5</button>
      <button class="btn" id="joinall">Join all</button><button class="btn" id="randtap">Random tap (all)</button>
      <button class="btn" id="randvote">Auto-vote / pick / jury (all)</button></div>`;
  $('#who').onchange = (e) => { meIdx = +e.target.value; store.set('me', meIdx); lastKey = ''; myPick = null; voteDraft = { key: '', target: null, message: '' }; render(); renderDbg(); };
  const addFake = () => {
    const used = new Set(ids.map((x) => x.name));
    const name = fakeNames.find((n) => !used.has(n)) || 'Fake' + ids.length;
    const x = { pid: 'f_' + uid(), name, fake: true };
    ids.push(x); store.set('ids', ids); send({ t: 'join', pid: x.pid, name }); return x;
  };
  $('#addfake').onclick = () => { addFake(); meIdx = ids.length - 1; store.set('me', meIdx); lastKey = ''; render(); renderDbg(); };
  $('#add5').onclick = () => { for (let i = 0; i < 5; i++) addFake(); renderDbg(); };
  $('#joinall').onclick = () => { for (const x of ids) if (x.name && !joined(x.pid)) send({ t: 'join', pid: x.pid, name: x.name }); };
  $('#randtap').onclick = () => { for (const x of ids) send({ t: 'tap', pid: x.pid, kind: Math.random() < 0.5 ? 'help' : 'sabotage' }); };
  $('#randvote').onclick = () => {
    const lines = ['Too sneaky for my taste.', 'You are the biggest threat. Sorry!', 'Nothing personal, pure strategy.', 'I did not like that last move.'];
    for (const x of ids) {
      if (S.phase === 'jury') send({ t: 'jury', pid: x.pid, target: S.finale.finalists[Math.floor(Math.random() * 2)] });
      else if (S.phase === 'unanimous') send({ t: 'pick', pid: x.pid, target: S.tribal.tied[0] });
      else if (S.phase === 'voting') {
        const opts = S.tribal.targets.filter((id) => id !== x.pid); if (!opts.length) continue;
        send({ t: 'vote', pid: x.pid, target: opts[Math.floor(Math.random() * opts.length)], message: lines[Math.floor(Math.random() * lines.length)] });
      }
    }
  };
}

const urlRoom = new URLSearchParams(location.search).get('room');
const saved = urlRoom || store.get('room', '');
if (saved) connectRoom(saved); else render();
