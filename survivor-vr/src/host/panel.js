// DOM host panel: players, challenge picker, round controls and the debug panel.
import { GAME } from '../config/game.js';
import { SCORING } from '../config/scoring.js';
import { CHALLENGE_LIST } from '../config/meta.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SAMPLE_VOTES = [
  'You have been coasting all game. Time to go.', 'Too strong, too smooth. Gotta cut the threat!',
  'I just do not trust you. Sorry.', 'Your shady alliance talk was obvious. Bye!', 'Nothing personal, it is just strategy.',
  'You sabotaged me and I know it.', 'Pretty sure you are the final-three goat. Cut early.',
];

export function initPanel({ game, api }) {
  $('#collapse').onclick = () => $('#panel').classList.toggle('collapsed');
  const playersEl = $('#players'), flowEl = $('#flow'), debugEl = $('#debug'), statusEl = $('#status');

  function render() {
    const g = game;
    const challengeName = CHALLENGE_LIST.find((c) => c.id === g.challengeId)?.name || '-';
    statusEl.innerHTML = `Phase: <span class="pill">${g.phase}</span> Round ${g.round || '-'} · ${esc(challengeName)}
      ${g.headsetId ? `<br>In headset: <b>${esc(g.player(g.headsetId)?.name)}</b> (turn ${g.turnIndex + 1}/${g.order.length})` : ''}
      <br>Link: <span class="pill">${api.netMode()}</span> TV: <span class="pill">${api.tvAlive() ? 'connected' : 'not seen'}</span>`;

    // players
    const editable = g.phase === 'lobby' || g.phase === 'roundEnd';
    playersEl.innerHTML = g.players.map((p) => `
      <div class="row"><span class="dot" style="background:${p.color}"></span><b>${esc(p.name)}</b>
        ${p.bot ? '<span class="pill">bot</span>' : '<span class="pill">phone</span>'}
        ${g.immunityId === p.id ? '🛡️' : ''}${p.eliminated ? '💀' : ''}
        ${editable ? `<button class="btn alt sm" data-rm="${p.id}">✕</button>` : ''}</div>`).join('') || '<span class="muted">No players yet - open phone.html on phones, or add bots.</span>';
    playersEl.insertAdjacentHTML('beforeend', `<div class="row"><button class="btn alt sm" id="addbot" ${editable && g.players.length < GAME.maxPlayers ? '' : 'disabled'}>+ Bot</button>
      <span class="muted">${g.active.length} players (need ${GAME.minPlayers}-${GAME.maxPlayers})</span></div>`);
    $('#addbot').onclick = () => g.addBot();
    playersEl.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => g.removePlayer(b.dataset.rm)));

    // flow controls
    let h = '';
    if (g.phase === 'lobby' || g.phase === 'roundEnd') {
      if (g.phase === 'roundEnd') h += roundEndSummary();
      h += `<h3>Challenge picker</h3><div class="cards">${CHALLENGE_LIST.map((c) => `
        <button class="card" data-ch="${c.id}" ${g.canStart() ? '' : 'disabled'}><b>${c.icon} ${c.name}</b><small>${esc(c.blurb)}</small></button>`).join('')}</div>`;
      if (!g.canStart()) h += `<div class="muted">Add ${GAME.minPlayers}-${GAME.maxPlayers} players to start a round.</div>`;
    } else {
      h += `<h3>Round ${g.round}: ${esc(challengeName)}</h3>`;
      if (g.phase === 'turnReady') h += `<div class="row"><b>${esc(g.player(g.headsetId)?.name)}</b> puts on the headset.</div>
        <div class="row"><button class="btn" id="begin">▶ Begin run (3-2-1)</button></div>
        <div class="muted">Or press the READY sign in the scene / Enter.</div>`;
      if (g.phase === 'countdown' || g.phase === 'running') h += `<div class="row muted">Taps used: ${g.order.length - 1 - g.tapsLeft()}/${g.order.length - 1}</div>`;
      if (g.phase === 'turnResult') h += `<div class="row"><button class="btn" id="nextturn">Next ▶</button></div>`;
      if (g.phase === 'roundResults') h += `<div class="row"><button class="btn" id="tribal">🔥 Tribal Council</button></div>`;
      if (g.phase === 'voting') h += `<div class="row muted">Votes in: ${g.active.filter((p) => g.votes[p.id]).length}/${g.active.length}</div>
        <div class="row"><button class="btn" id="readout">Read the votes ▶</button></div>`;
      if (g.phase === 'readout') h += `<div class="row"><button class="btn" id="nextvote">Next vote ▶</button></div>`;
      h += `<div class="row"><button class="btn alt sm" id="abort">Abort round</button></div>`;
    }
    flowEl.innerHTML = h;
    flowEl.querySelectorAll('[data-ch]').forEach((b) => (b.onclick = () => { const r = g.startRound(b.dataset.ch); if (!r.ok) alert(r.reason); }));
    const on = (id, fn) => { const e = $('#' + id); if (e) e.onclick = fn; };
    on('begin', () => g.beginTurn()); on('nextturn', () => g.skipTurnResult()); on('tribal', () => g.startVoting());
    on('readout', () => g.startReadout()); on('nextvote', () => g.nextReadout()); on('abort', () => api.abortRound());

    renderDebug();
  }

  function roundEndSummary() {
    const g = game;
    const nm = (id) => esc(g.player(id)?.name || '?');
    return `<div class="card" style="margin:8px 0"><b>Round ${g.round} over</b>
      🛡️ Immunity: ${nm(g.immunityId)}<br>
      ${g.votedOut.length ? `🔥 Voted out: ${g.votedOut.map(nm).join(', ')}${GAME.eliminateVotedOut ? '' : ' (stays in - prototype)'}` : '🤝 Tie - nobody voted out'}</div>
      <div class="row"><button class="btn" id="nextround">Next round ▶</button></div>`;
  }

  function renderDebug() {
    const g = game;
    let h = `<div class="muted" style="margin:6px 0">Simulate phone players without a phone. Real phones use <code>/phone.html</code> (which also has its own debug drawer).</div>`;
    if (g.players.length) {
      h += g.players.map((p) => {
        const tapped = g.taps[p.id];
        const can = g.phase === 'running' && p.id !== g.headsetId && !tapped;
        return `<div class="row"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}
          <button class="btn sm" data-tap="help:${p.id}" ${can ? '' : 'disabled'} style="background:var(--help)">Help</button>
          <button class="btn sm" data-tap="sabotage:${p.id}" ${can ? '' : 'disabled'} style="background:var(--sab)">Sabotage</button>
          ${tapped ? `<span class="pill">tapped</span>` : ''}${g.phase === 'voting' && g.votes[p.id] ? '<span class="pill">voted</span>' : ''}</div>`;
      }).join('');
    }
    h += `<div class="row">
      <button class="btn alt sm" id="dbgresult" ${['running', 'countdown', 'turnReady'].includes(g.phase) ? '' : 'disabled'}>Skip run → random result</button>
      <button class="btn alt sm" id="dbgvote" ${g.phase === 'voting' ? '' : 'disabled'}>Bots vote</button>
      <button class="btn alt sm" id="dbgtapall" ${g.phase === 'running' ? '' : 'disabled'}>All tap (random)</button></div>`;
    debugEl.innerHTML = h;
    debugEl.querySelectorAll('[data-tap]').forEach((b) => (b.onclick = () => { const [k, id] = b.dataset.tap.split(':'); g.tap(id, k); }));
    const on = (id, fn) => { const e = $('#' + id); if (e) e.onclick = fn; };
    on('dbgresult', () => api.fakeResult());
    on('dbgvote', () => {
      for (const p of g.active) {
        if (g.votes[p.id]) continue;
        const targets = g.votableTargets(p.id);
        if (!targets.length) continue;
        g.submitVote(p.id, targets[Math.floor(Math.random() * targets.length)].id, SAMPLE_VOTES[Math.floor(Math.random() * SAMPLE_VOTES.length)]);
      }
    });
    on('dbgtapall', () => {
      for (const p of g.players) if (p.id !== g.headsetId && !g.taps[p.id]) g.tap(p.id, Math.random() < 0.5 ? 'help' : 'sabotage');
    });
    on('nextround', () => g.nextRound());
  }

  let pending = false;
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; render(); }); } };
  render();
  setInterval(render, 1500);
  return { render: schedule };
}
