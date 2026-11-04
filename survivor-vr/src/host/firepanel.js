// Host panel pieces for the main menu and the standalone Fire Making mini game (+ its debug panel).
import { FIREGAME } from '../config/firegame.js';
import { fmtSeconds } from '../config/scoring.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const JUMPS_FIRE = [['setup', 'Setup (player count)'], ['up', "Player 1, you're up"], ['naming', 'Typing the name (keyboard)'], ['running', 'Running (timer on)'],
  ['result', 'Result card'], ['scoreboard', 'Mid-game scoreboard'], ['final', 'Final: winner + scoreboard'], ['finalNone', 'Final: everyone DNF']];

export function initFirePanel({ fireGame, getScene, setMode, getMode, mic, disposeScene }) {
  let jump = 'running', jumpN = 4, n = FIREGAME.players.default;
  const menuEl = $('#menu'), fireEl = $('#firesec'), dbgEl = $('#firedebug');

  const startGame = async () => {
    if (FIREGAME.autoMic && !mic.enabled) await mic.enable();       // runs inside the click gesture
    fireGame.start(n);
  };

  function render() {
    const mode = getMode();
    menuEl.style.display = mode === 'menu' ? '' : 'none';
    fireEl.style.display = mode === 'fire' ? '' : 'none';
    dbgEl.style.display = mode === 'fire' ? '' : 'none';
    if (mode === 'menu') {
      menuEl.innerHTML = `<h3>Main menu</h3><div class="cards" style="grid-template-columns:1fr">
        <button class="card" id="m-camp"><b>🏝️ Survivor Campaign</b><small>Tribes, relays, tribal council, finale. Phones + headset + TV.</small></button>
        <button class="card" id="m-fire"><b>🔥 Fire Making</b><small>Mini game: headset + TV only. One attempt each, fastest time wins.</small></button></div>`;
      $('#m-camp').onclick = () => setMode('campaign');
      $('#m-fire').onclick = () => setMode('fire');
      return;
    }
    if (mode !== 'fire') return;
    const g = fireGame, S = getScene();
    let h = `<h3>🔥 Fire Making</h3>`;
    if (g.phase === 'setup') {
      h += `<div class="row">Players: <input id="fn" type="number" min="${FIREGAME.players.min}" max="${FIREGAME.players.max}" value="${n}" style="width:56px">
        <button class="btn" id="fstart">▶ Start</button></div><div class="muted">One headset, one attempt each. Phones are not used.</div>`;
    } else if (g.phase === 'final') {
      const w = g.winner();
      h += `<div class="card" style="margin:6px 0">${w ? `👑 <b>${esc(w.name)}</b> ${fmtSeconds(w.time)}` : 'Nobody lit it - all DNF'}</div>
        <div class="row"><button class="btn" id="fagain">🔁 Play again</button><button class="btn alt" id="fmenu">☰ Back to menu</button></div>`;
    } else {
      h += `<div class="row"><b>Player ${g.index + 1} of ${g.total}</b> <span class="pill">${g.phase}</span> ${esc(g.current?.name || '')}</div>`;
      if (g.phase === 'up') h += `<div class="row"><button class="btn" id="fnext">Headset is on → show keyboard</button></div>`;
      if (g.phase === 'naming') h += `<div class="muted">Player is typing their name… (BEGIN starts the clock)</div><div class="row"><button class="btn alt sm" id="fbegin">Begin with default name</button></div>`;
      if (g.phase === 'running') h += `<div class="row"><button class="btn alt sm" id="fdnf">Record DNF (give up)</button></div>`;
      if (g.phase === 'result') h += `<div class="row"><button class="btn" id="fnext">Next ▶</button></div>`;
    }
    const sb = g.scoreboard();
    if (sb.length) h += `<h3>Scoreboard</h3>` + sb.map((r) => `<div class="row"><b>${r.rank}.</b> ${esc(r.name)} <span class="pill">${r.dnf ? 'DNF' : fmtSeconds(r.time)}</span></div>`).join('');
    h += `<div class="row"><button class="btn alt sm" id="fback">☰ Back to menu</button><button class="btn alt sm" id="fmic">${mic.enabled ? '🎤 mic on' : '🎤 enable mic'}</button><span class="pill">${esc(mic.status)}</span></div>`;
    fireEl.innerHTML = h;
    const on = (id, fn) => { const e = $('#' + id); if (e) e.onclick = fn; };
    on('fstart', startGame); on('fnext', () => fireGame.next()); on('fagain', () => fireGame.playAgain());
    on('fmenu', () => setMode('menu')); on('fback', () => setMode('menu'));
    on('fbegin', () => fireGame.begin(''));
    on('fdnf', () => S?.end({ dnf: true, reason: 'gave up' }));
    on('fmic', async () => { if (mic.enabled) mic.disable(); else await mic.enable(); render(); });
    const fn = $('#fn'); if (fn) fn.onchange = () => { n = fireGame.setPlayers(fn.value); };
    renderDebug();
  }

  function renderDebug() {
    const g = fireGame, S = getScene();
    let h = `<div class="muted" style="margin:6px 0">Test without a headset: mouse works (drag the knife along the branch to shave, drop curls in the nest, flick the knife over the nest to strike, hold Space to blow).</div>
      <div class="row"><select id="fj">${JUMPS_FIRE.map(([k, l]) => `<option value="${k}" ${k === jump ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input id="fjn" type="number" min="1" max="${FIREGAME.players.max}" value="${jumpN}" style="width:48px"><button class="btn sm" id="fjump">Jump ▶</button></div>`;
    const run = g.phase === 'running' && S && !S.over, ses = S && (g.phase === 'running' || g.phase === 'naming' || g.phase === 'up');
    const b = (id, label, en) => `<button class="btn alt sm" id="${id}" ${en ? '' : 'disabled'}>${label}</button>`;
    h += `<div class="row">${b('d-name', 'Auto name + begin', !!ses && g.phase !== 'running')} ${b('d-auto', 'Autopilot (good)', run)} ${b('d-sloppy', 'Autopilot (blows wrong → DNF)', run)}</div>
      <div class="row">${b('d-shave', 'Place 5 tinder', run)} ${b('d-strike', 'Spark', run)} ${b('d-blow', 'Blow 50%', run)} ${b('d-blow0', 'Stop blow', run)}</div>
      <div class="row">${b('d-twig', '+twig', run)} ${b('d-branch', '+branch', run)} ${b('d-log', '+log', run)} ${b('d-snap', 'Force rope snap', run)} ${b('d-kill', 'Kill fire', run)}</div>
      <div class="row">Speed ×<select id="d-speed">${[1, 2, 4].map((x) => `<option ${x === (window.__fireSpeed || 1) ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <pre id="fsim" style="font-size:11px;white-space:pre-wrap;background:#0f1f17;padding:6px;border-radius:8px;margin:6px 0">${S ? '' : 'no scene'}</pre>`;
    dbgEl.innerHTML = h;
    const on = (id, fn) => { const e = $('#' + id); if (e) e.onclick = fn; };
    $('#fj').onchange = (e) => { jump = e.target.value; }; $('#fjn').onchange = (e) => { jumpN = +e.target.value; };
    on('fjump', () => jumpTo(jump, jumpN));
    on('d-name', () => { if (g.phase === 'up') g.toNaming(); g.begin('Tester ' + (1 + Math.floor(Math.random() * 90))); });
    on('d-auto', () => S.startAutopilot({ curls: 5, q: 0.8 })); on('d-sloppy', () => S.startAutopilot({ curls: 5, q: 0.8, sloppy: true }));
    on('d-shave', () => S.dbgShave(5)); on('d-strike', () => S.dbgStrike(0.85)); on('d-blow', () => { S.dbgBlowLevel = 0.5; }); on('d-blow0', () => { S.dbgBlowLevel = 0; });
    on('d-twig', () => S.dbgAddFuel('twig')); on('d-branch', () => S.dbgAddFuel('branch')); on('d-log', () => S.dbgAddFuel('log'));
    on('d-snap', () => S.dbgSnap()); on('d-kill', () => S.dbgKill());
    $('#d-speed').onchange = (e) => { window.__fireSpeed = +e.target.value; };
  }

  /** debug: build a state without a headset */
  function jumpTo(t, nn) {
    const g = fireGame, total = Math.max(1, nn || 4);
    disposeScene();
    g.reset(); g.total = total;
    const fakeAll = (dnfAll) => {
      g.silent = true; g.start(total);
      for (let i = 0; i < total; i++) {
        g.begin(['Ash', 'Ember', 'Flint', 'Cinder', 'Spark', 'Blaze', 'Torch', 'Kindle', 'Smoke', 'Coal', 'Char', 'Flare'][i] + '');
        g.finish(dnfAll || i === 2 ? { dnf: true, value: 90, reason: i % 2 ? 'fire died' : 'gave up' } : { value: +(30 + Math.random() * 90).toFixed(2) });
        if (i < total - 1) g.next(); else g.next();
      }
      g.silent = false;
    };
    switch (t) {
      case 'setup': break;
      case 'up': g.start(total); break;
      case 'naming': g.start(total); g.toNaming(); break;
      case 'running': g.start(total); g.toNaming(); g.begin('Debug'); break;
      case 'result': g.start(total); g.toNaming(); g.begin('Debug'); g.finish({ value: 47.3 }); break;
      case 'scoreboard': {
        g.silent = true; g.start(Math.max(3, total));
        for (let i = 0; i < 2; i++) { g.begin('Ash' + i); g.finish(i ? { dnf: true, value: 80, reason: 'gave up' } : { value: 62.4 }); g.next(); }
        g.silent = false; g.runner.prepare(g.index + 1); break;
      }
      case 'final': fakeAll(false); break;
      case 'finalNone': fakeAll(true); break;
    }
    g.changed();
  }

  setInterval(() => {
    const S = getScene(), el = $('#fsim');
    if (el && S) { const s = S.snapshot(); el.textContent = `t ${s.t.toFixed(1)}s  lit ${s.lit}  dead ${s.dead}\nheat ${s.H.toFixed(2)} (tip ${s.tip.toFixed(2)}m)  air ${s.O.toFixed(2)}  rope ${s.rope.toFixed(2)}\ntinder ${s.tinder.toFixed(2)} ${s.tinderState} warm ${s.warm.toFixed(2)} smother ${s.smother.toFixed(2)}\nblow src ${s.source}\n${s.fuels.join('  ')}`; }
  }, 300);
  let pending = false;
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; if (!(document.activeElement && ['SELECT', 'INPUT'].includes(document.activeElement.tagName))) render(); }); } };
  render();
  return { render: schedule };
}
