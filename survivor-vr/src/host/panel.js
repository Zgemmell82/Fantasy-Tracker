// DOM host panel: lobby, challenge picker, "continue" controls and the debug panel.
import { GAME } from '../config/game.js';
import { CHALLENGE_META } from '../config/meta.js';
import { createDebug, JUMPS } from './debug.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// what the host's Continue button does in each phase
const CONTINUE = {
  tribes: 'Continue to challenge pick', roundResults: '🔥 Go to Tribal Council', tie: 'Continue (revote / next tie-break)', tribalResult: 'Continue',
  merge: 'Continue', turnResult: 'Next ▶', finaleIntro: 'Start the finale challenges', finaleScores: 'Next ▶', finaleImmunity: 'Start fire-making',
  fireResult: 'Finalist pitches', pitch: 'Next / end pitch', voting: 'Read the votes ▶', readout: 'Next vote ▶', unanimous: 'Declare deadlock → draw', draw: 'Skip draw reveal',
  jury: 'Reveal jury votes', juryReveal: 'Next reveal', turnReady: '▶ Begin run (3-2-1)', handoff: 'Skip handoff wait',
};

export function initPanel({ game, api, mic, code }) {
  const D = createDebug(game, { onJump: () => render() });
  window.__debug = D;
  $('#collapse').onclick = () => $('#panel').classList.toggle('collapsed');
  const playersEl = $('#players'), flowEl = $('#flow'), debugEl = $('#debug'), statusEl = $('#status');
  let jumpChoice = 'lobby', jumpN = 12;

  const tribeChip = (p) => (p.tribe ? `<span class="pill" style="background:${GAME.tribes.find((t) => t.id === p.tribe).color};color:#111">${p.tribe}</span>` : '');

  function render() {
    const g = game;
    $('#camp').style.display = api.mode() === 'campaign' ? '' : 'none';
    $('#debug').style.display = api.mode() === 'campaign' ? '' : 'none';
    const meta = CHALLENGE_META[g.challengeId];
    const mode = !g.started ? 'lobby' : g.episodeType === 'finale' ? 'FINALE' : g.twoTribes && !g.merged ? 'two tribes' : g.twoTribes ? 'merged' : 'one tribe';
    if (api.mode() !== 'campaign') {
      statusEl.innerHTML = `Room code <span class="pill" style="font-size:18px;font-weight:800;letter-spacing:.2em">${code}</span> · ${api.mode() === 'menu' ? 'main menu' : 'fire making'}
        <br>Link: <span class="pill">${api.netMode()}</span> TV: <span class="pill">${api.tvAlive() ? 'connected' : 'not seen'}</span> Mic: <span class="pill">${esc(mic.status)}</span>`;
      return;
    }
    statusEl.innerHTML = `Room code <span class="pill" style="font-size:18px;font-weight:800;letter-spacing:.2em">${code}</span>
      <br>Phase: <span class="pill">${g.phase}</span> · ${mode} · ep ${g.episode || '-'} ${meta ? '· ' + esc(meta.name) : ''}
      ${g.headsetId ? `<br>In headset: <b>${esc(g.name(g.headsetId))}</b>${g.run?.relay ? ` · tribe ${g.run.group} clock ${g.relayTotal().toFixed(1)}s` : ''}` : ''}
      <br>Link: <span class="pill">${api.netMode()}</span> TV: <span class="pill">${api.tvAlive() ? 'connected' : 'not seen'}</span> Mic: <span class="pill">${esc(mic.status)}</span>`;

    // players
    const lobby = g.phase === 'lobby';
    playersEl.innerHTML = g.players.map((p) => `
      <div class="row"><span class="dot" style="background:${p.color}"></span><b style="${p.status !== 'active' ? 'opacity:.5' : ''}">${esc(p.name)}</b>
        ${tribeChip(p)}${p.bot ? '<span class="pill">bot</span>' : '<span class="pill">phone</span>'}
        ${g.immunityId === p.id ? '🛡️' : ''}${p.status === 'juror' ? '<span class="pill">juror</span>' : p.status === 'out' ? '<span class="pill">out</span>' : ''}
        ${g.winnerId === p.id ? '👑' : ''}
        ${lobby ? `<button class="btn alt sm" data-rm="${p.id}">✕</button>` : ''}</div>`).join('') || '<span class="muted">No players yet - phones join with the room code, or add bots.</span>';
    playersEl.insertAdjacentHTML('beforeend', `<div class="row"><button class="btn alt sm" id="addbot" ${lobby && g.players.length < GAME.maxPlayers ? '' : 'disabled'}>+ Bot</button>
      <button class="btn alt sm" id="add5" ${lobby ? '' : 'disabled'}>+ 5 Bots</button>
      <span class="muted">${g.players.length} players (${GAME.minPlayers}-${GAME.maxPlayers}; ${GAME.twoTribeMinPlayers}+ = two tribes)</span></div>`);
    $('#addbot').onclick = () => g.addBot();
    $('#add5').onclick = () => { for (let i = 0; i < 5; i++) g.addBot(); };
    playersEl.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => g.removePlayer(b.dataset.rm)));

    // flow
    let h = '';
    if (g.phase === 'lobby') {
      h += `<div class="row"><button class="btn" id="start" ${g.canStart() ? '' : 'disabled'}>▶ Start game (${g.players.length >= GAME.twoTribeMinPlayers ? 'two tribes' : g.players.length <= GAME.finaleAt ? 'straight to finale' : 'one tribe'})</button></div>`;
    } else if (g.phase === 'tribes') {
      for (const t of GAME.tribes) h += `<div class="card" style="margin:6px 0;border-color:${t.color}"><b style="color:${t.color}">${t.name} tribe</b> ${g.members(t.id).map((id) => esc(g.name(id))).join(', ')}</div>`;
    } else if (g.phase === 'picker') {
      const team = g.twoTribes && !g.merged;
      h += `<h3>${team ? 'Pick a TEAM relay challenge' : 'Pick an individual challenge'}</h3><div class="cards">${g.pickable().map((id) => { const c = CHALLENGE_META[id]; return `
        <button class="card" data-ch="${id}"><b>${c.icon} ${c.name}</b><small>${esc(c.blurb)}</small></button>`; }).join('')}
        <button class="card" id="rand"><b>🎲 Random</b><small>Let fate pick</small></button></div>`;
    }
    if (g.phase === 'roundResults' && g.team) h += `<div class="card" style="margin:6px 0">Losing tribe: <b>${g.team.losing}</b> → tribal. Winners ${g.team.winning} are safe.</div>`;
    if (g.phase === 'roundResults' && g.immunityId) h += `<div class="card" style="margin:6px 0">🛡️ Immunity: <b>${esc(g.name(g.immunityId))}</b></div>`;
    if (g.phase === 'tribalResult') h += `<div class="card" style="margin:6px 0">Voted out: <b>${esc(g.name(g.tribal.result.eliminated))}</b> (${g.tribal.result.how})</div>`;
    if (g.phase === 'voting') h += `<div class="row muted">${g.tribal.stage.toUpperCase()}: votes in ${Object.keys(g.tribal.votes).length}/${g.tribal.voters.length}</div>`;
    if (g.phase === 'unanimous') h += `<div class="row muted">Picks: ${Object.keys(g.tribal.picks).length}/${g.tribal.voters2.length} · ${Math.ceil(g.tribal.deadline)}s left</div>`;
    if (g.phase === 'jury') h += `<div class="row muted">Jury votes in ${Object.keys(g.jury.votes).length}/${g.jury.jurors.length}</div>`;
    if (g.phase === 'running') h += `<div class="row muted">Taps used: ${g.tappers().length - g.tapsLeft()}/${g.tappers().length}</div>`;
    if (CONTINUE[g.phase]) h += `<div class="row"><button class="btn" id="cont">${CONTINUE[g.phase]}</button></div>`;
    h += `<div class="row"><button class="btn alt sm" id="tomenu">☰ Main menu</button></div>`;
    if (g.started) h += `<div class="row"><button class="btn alt sm" id="abort">Abort episode</button><button class="btn alt sm" id="reset">New game</button></div>`;
    h += `<div class="row"><button class="btn alt sm" id="mic">${mic.enabled ? '🎤 Mic on (click to turn off)' : '🎤 Enable mic for blowing (fire challenge)'}</button></div>`;
    flowEl.innerHTML = h;
    const on = (id, fn) => { const e = $('#' + id); if (e) e.onclick = fn; };
    on('tomenu', () => api.toMenu());
    on('start', () => { const r = g.startGame(); if (!r.ok) alert(r.reason); });
    on('cont', () => g.next());
    on('abort', () => api.abortEpisode());
    on('reset', () => { if (confirm('Start a new game? Keeps the players.')) g.resetGame(), g.changed(); });
    on('mic', async () => { if (mic.enabled) mic.disable(); else await mic.enable(); render(); });
    on('rand', () => { const ids = g.pickable(); g.startEpisode(ids[Math.floor(Math.random() * ids.length)]); });
    flowEl.querySelectorAll('[data-ch]').forEach((b) => (b.onclick = () => { const r = g.startEpisode(b.dataset.ch); if (!r.ok) alert(r.reason); }));
    renderDebug();
  }

  function renderDebug() {
    const g = game;
    let h = `<div class="muted" style="margin:6px 0">Simulate phones and skip ahead. Real phones use <code>/phone.html</code> + the room code.</div>`;
    h += `<div class="row"><select id="jumpsel">${JUMPS.map(([k, l]) => `<option value="${k}" ${k === jumpChoice ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input id="jumpn" type="number" min="3" max="${GAME.maxPlayers}" value="${jumpN}" style="width:52px" title="players"><button class="btn sm" id="jump">Jump ▶</button></div>`;
    const tappers = g.tappers ? g.tappers() : [];
    if (g.phase === 'running') {
      h += g.players.map((p) => {
        const can = tappers.includes(p.id) && !g.taps[p.id];
        return `<div class="row"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}
          <button class="btn sm" data-tap="help:${p.id}" ${can ? '' : 'disabled'} style="background:var(--help)">Help</button>
          <button class="btn sm" data-tap="sabotage:${p.id}" ${can ? '' : 'disabled'} style="background:var(--sab)">Sab</button>
          ${g.taps[p.id] ? '<span class="pill">tapped</span>' : tappers.includes(p.id) ? '' : '<span class="pill">no tap</span>'}</div>`;
      }).join('');
    }
    const b = (id, label, en = true) => `<button class="btn alt sm" id="${id}" ${en ? '' : 'disabled'}>${label}</button>`;
    h += `<div class="row">${b('d-skip', 'Skip run → random', !!g.run && ['turnReady', 'countdown', 'running', 'handoff'].includes(g.phase))}
      ${b('d-runall', 'Run all remaining', !!g.run && ['turnReady', 'countdown', 'running', 'handoff', 'turnResult'].includes(g.phase))}
      ${b('d-tap', 'Bots tap', g.phase === 'running')}</div>
      <div class="row">${b('d-vote', 'Bots vote', g.phase === 'voting')} ${b('d-tie', 'Bots vote (force tie)', g.phase === 'voting')}
      ${b('d-skiprd', 'Skip readout', g.phase === 'voting' || g.phase === 'readout')}</div>
      <div class="row">${b('d-agree', 'Bots agree (unanimous)', g.phase === 'unanimous')} ${b('d-split', 'Bots disagree', g.phase === 'unanimous')}
      ${b('d-jury', 'Bots jury vote', g.phase === 'jury')}</div>`;
    debugEl.innerHTML = h;
    const on = (id, fn) => { const e = $('#' + id); if (e) e.onclick = fn; };
    $('#jumpsel').onchange = (e) => { jumpChoice = e.target.value; };
    $('#jumpn').onchange = (e) => { jumpN = +e.target.value; };
    on('jump', () => { api.abortEpisode(); D.jump(jumpChoice, jumpN); });
    debugEl.querySelectorAll('[data-tap]').forEach((bt) => (bt.onclick = () => { const [k, id] = bt.dataset.tap.split(':'); g.tap(id, k); }));
    on('d-skip', () => api.fakeResult()); on('d-runall', () => { g.simulating = true; D.runAll(); g.simulating = false; g.reprepare(); g.changed(); });
    on('d-tap', () => D.botsTap()); on('d-vote', () => D.botsVote('random')); on('d-tie', () => D.botsVote('tie'));
    on('d-skiprd', () => g.skipReadout()); on('d-agree', () => D.botsPick('agree')); on('d-split', () => D.botsPick('split')); on('d-jury', () => D.botsJury());
  }

  let pending = false;
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; render(); }); } };
  render();
  setInterval(() => { if (!document.activeElement || !['SELECT', 'INPUT'].includes(document.activeElement.tagName)) render(); }, 1500);
  return { render: schedule };
}
