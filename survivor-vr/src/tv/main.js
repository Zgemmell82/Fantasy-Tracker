// TV view: mirrors the headset player's scene (JPEG frames from the host), shows the timer,
// the anonymous effect feed, then leaderboards and the tribal-council vote readout.
import { connect } from '../shared/net.js';
import { CHALLENGE_LIST } from '../config/meta.js';
import { SCORING } from '../config/scoring.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let S = null;            // latest public state
let tick = { timer: null, at: 0, progress: '' };
let lastFeedId = 0;

const net = connect({ role: 'tv', onMessage: (m) => {
  if (m.t === 'state') { S = m.s; render(); }
  else if (m.t === 'tick') { tick = { timer: m.timer, at: performance.now(), progress: m.progress }; }
  else if (m.t === 'frame') { $('#mirror').src = m.d; }
} });
const hello = () => { net.send({ t: 'tv-ping' }); if (!S) net.send({ t: 'hello' }); };
setInterval(hello, 2500); setTimeout(hello, 400);

const name = (id) => S.players.find((p) => p.id === id)?.name || '?';
const color = (id) => S.players.find((p) => p.id === id)?.color || '#fff';
const chName = () => CHALLENGE_LIST.find((c) => c.id === S.challengeId)?.name || '';
const fmt = (s) => { const m = Math.floor(s / 60); const r = (s - m * 60).toFixed(1).padStart(m ? 4 : 3, '0'); return m ? `${m}:${r}` : r; };

function show(id) {
  for (const el of document.querySelectorAll('.screen')) el.classList.toggle('on', el.id === id);
}

function render() {
  if (!S) return;
  const gamePhases = ['turnReady', 'countdown', 'running', 'turnResult'];
  if (gamePhases.includes(S.phase)) { show('screen-game'); renderGame(); return; }
  show('screen-other');
  const el = $('#screen-other');
  const base = location.origin;
  switch (S.phase) {
    case 'lobby':
      el.innerHTML = `<div><div class="big">🌴 SURVIVOR: VR ISLAND</div><div class="mid">${S.round ? 'Pick the next challenge on the host screen' : 'Waiting for the tribe...'}</div>
        <div class="urls">Join on your phone: <b>${esc(base)}/phone.html</b></div>
        <div style="margin-top:4vh">${S.players.map((p) => `<span class="p on" style="font-size:4vh;margin:0 1.5vw"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</span>`).join('') || '<span class="sm">no castaways yet</span>'}</div></div>`;
      break;
    case 'roundResults': {
      el.innerHTML = `<div><div class="mid">${esc(chName())} - results</div><div class="big">🛡️ ${esc(name(S.immunityId))} wins immunity!</div>
        <div class="board">${S.ranking.map((id, i) => `<div class="r ${i === 0 ? 'win' : ''}"><span>${i + 1}</span><span class="dot" style="background:${color(id)}"></span><b>${esc(name(id))}</b>
          <span class="v">${esc(S.results[id].display)}</span></div>`).join('')}</div>
        <div class="sm" style="margin-top:3vh">${SCORING[S.challengeId]?.label || ''}</div></div>`;
      break;
    }
    case 'voting':
      el.innerHTML = `<div><div class="fire">🔥</div><div class="big">TRIBAL COUNCIL</div>
        <div class="mid">Vote on your phones. <b>${esc(name(S.immunityId))}</b> has immunity.</div>
        <div style="margin-top:4vh">${S.players.filter((p) => !p.eliminated).map((p) => `<span class="p ${S.voted.includes(p.id) ? 'on' : ''}" style="font-size:3.6vh;margin:1vh 1.5vw">
          <span class="dot" style="background:${p.color}"></span>${esc(p.name)} ${S.voted.includes(p.id) ? '✔' : '…'}</span>`).join('')}</div></div>`;
      break;
    case 'readout': {
      const r = S.readout;
      el.innerHTML = `<div><div class="mid">Vote ${r.index + 1} of ${r.total}</div>
        <div class="parch"><div class="who">A castaway has written…</div><div class="to">${esc(name(r.current.target))}</div>
        <div class="msg">“${esc(r.current.message)}”</div></div>
        <div style="margin-top:3vh">${Object.entries(r.counts).map(([id, n]) => `<span class="p on" style="font-size:3vh;margin:0 1.2vw"><span class="dot" style="background:${color(id)}"></span>${esc(name(id))}: ${n}</span>`).join('')}</div></div>`;
      break;
    }
    case 'roundEnd': {
      const out = S.votedOut || [];
      const rows = Object.entries(S.tally || {}).sort((a, b) => b[1] - a[1]);
      el.innerHTML = `<div class="tally"><div class="mid">The votes are in…</div>
        <div class="big">${out.length ? `${esc(name(out[0]))}, the tribe has spoken.` : 'A tie - nobody goes home.'}</div>
        <div class="board">${rows.map(([id, n]) => `<div class="r ${out.includes(id) ? 'snuff' : ''}"><span class="dot" style="background:${color(id)}"></span><b>${esc(name(id))}</b><span class="v">${'🔥'.repeat(n)}</span></div>`).join('')}</div>
        <div class="sm" style="margin-top:3vh">🛡️ ${esc(name(S.immunityId))} was safe with immunity</div></div>`;
      break;
    }
  }
}

function renderGame() {
  const p = S.players.find((x) => x.id === S.headsetId);
  $('#who').innerHTML = `<span class="dot" style="background:${p?.color}"></span>${esc(p?.name)} <small>${esc(chName())} · turn ${S.turnIndex + 1}/${S.order.length}</small>`;
  $('#cdbig').style.display = S.phase === 'countdown' ? 'flex' : 'none';
  $('#cdbig').textContent = S.countdown || 'GO!';
  const card = $('#card');
  if (S.phase === 'turnReady') {
    card.style.display = 'flex';
    card.innerHTML = `<div class="mid">Headset on, please…</div><div class="big">${esc(p?.name)}</div><div class="sm">${esc(chName())} · get ready!</div>`;
  } else if (S.phase === 'turnResult') {
    card.style.display = 'flex';
    const r = S.results[S.headsetId];
    card.innerHTML = `<div class="mid">${esc(p?.name)}</div><div class="big">${esc(r?.display ?? '')}</div>`;
  } else card.style.display = 'none';

  // anonymous effect feed
  const feed = $('#feed');
  if (!S.feed.length || S.feed[S.feed.length - 1].id < lastFeedId) { feed.innerHTML = ''; lastFeedId = 0; }
  for (const f of S.feed) {
    if (f.id <= lastFeedId) continue;
    lastFeedId = f.id;
    const li = document.createElement('li');
    li.className = f.kind;
    li.innerHTML = `<small>${f.kind === 'help' ? '✨ Help' : f.kind === 'sabotage' ? '💥 Sabotage' : '📣'}</small>${esc(f.text)}`;
    feed.prepend(li);
  }
  $('#tapinfo').textContent = S.phase === 'running' ? `${S.tapCount} tap${S.tapCount === 1 ? '' : 's'} so far - ${S.tapsLeft} still to decide…` : '';
  $('#tribe').innerHTML = S.players.map((x) => `<span class="p ${x.id === S.headsetId ? 'on' : ''}"><span class="dot" style="background:${x.color}"></span>${esc(x.name)}${S.results[x.id] ? ' ✔' : ''}</span>`).join('');
}

// smooth timer between 5 Hz ticks
function loop() {
  if (S && tick.timer && ['countdown', 'running', 'turnResult'].includes(S.phase)) {
    let v = tick.timer.value;
    if (S.phase === 'running' && tick.timer.mode === 'up') v += (performance.now() - tick.at) / 1000;
    $('#timer').innerHTML = `${fmt(Math.max(0, v))}<small>${esc(tick.timer.label)}</small>`;
    $('#progress').textContent = tick.progress || '';
  } else if (S && S.phase === 'turnReady') { $('#timer').innerHTML = ''; $('#progress').textContent = ''; }
  requestAnimationFrame(loop);
}
loop();
