// Host page: owns the 3D scene (the "headset" view), the game state machine, the relay
// connection to phones + TV, and the DOM host/debug panel.
import * as THREE from 'three';
import { Stage } from './stage.js';
import { Hands } from './hands.js';
import { Hud } from './hud.js';
import { Ui3D } from './ui3d.js';
import { buildWorld } from './world.js';
import { Game } from './game.js';
import { initPanel } from './panel.js';
import { MicInput } from './mic.js';
import { FireGame } from './firegame/state.js';
import { FireMakingScene } from './firegame/scene.js';
import { initFirePanel } from './firepanel.js';
import { FIREGAME } from '../config/firegame.js';
import { CHALLENGE_CLASSES } from './challenges/index.js';
import { CHALLENGES } from '../config/challenges.js';
import { SCORING, fmtSeconds } from '../config/scoring.js';
import { GAME } from '../config/game.js';
import { connect } from '../shared/net.js';
import { mulberry32 } from '../shared/util.js';

const $ = (s) => document.querySelector(s);

// ---------- room code ----------
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function makeCode() { return Array.from({ length: GAME.roomCodeLength }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join(''); }
let code = (new URLSearchParams(location.search).get('room') || sessionStorage.getItem('svr-code') || makeCode()).toUpperCase();
try { sessionStorage.setItem('svr-code', code); } catch { /* ignore */ }

const stage = new Stage($('#stage'));
const world = buildWorld(stage.world);
const hands = new Hands(stage);
const hud = new Hud(stage.world);
const readyUi = new Ui3D(stage.world);
const mic = new MicInput();
let current = null;           // active Challenge instance
let lastTick = 0, tvSeen = 0;
let ui = null, fireUi = null;
let mode = 'menu';            // 'menu' | 'campaign' | 'fire'   (main menu first)
let fireScene = null;

// ---------- game <-> scene bridge ----------
const runner = {
  prepare(info) {
    disposeCurrent();
    const Cls = CHALLENGE_CLASSES[info.challengeId];
    stage.calibrateHeight();
    hands.originY = stage.world.position.y;
    const seed = (info.round * 7919 + info.turnIndex * 104729 + (Math.random() * 1e6 | 0)) >>> 0;
    current = new Cls({
      stage, hands, hud, mic,
      config: { ...CHALLENGES[info.challengeId], ...(info.cfg || {}) },
      rng: mulberry32(seed),
      finish: (res) => game.finishTurn(res),
      say: (text, kind) => {
        hud.toast(text, kind, performance.now(), 4.5);
        if (kind === 'system') game.pushFeed('system', text);
      },
    });
    current.setup({ ...info, seed });
    hud.timerFn = info.relay ? () => fmtSeconds(game.relayTotal()).replace('s', '') : null;
    hud.set({ title: Cls.meta.name.toUpperCase() + (info.relay ? ' · TRIBE ' + info.group : ''), timer: '', big: 'READY?', line: game.player(info.playerId)?.name || '' });
    readyUi.addButton({
      text: 'READY!', sub: 'point + click / trigger', pos: current.readyPos || new THREE.Vector3(0, 1.75, -1.2), width: 0.6, height: 0.26,
      onSelect: () => game.beginTurn(),
    });
    hands.showLasers(true);
    $('#help').textContent = Cls.meta.desktopHelp;
  },
  start() {
    readyUi.clear();
    current?.ui.clear();
    hands.showLasers(false);
    stage.calibrateHeight(); hands.originY = stage.world.position.y;
    hud.set({ big: '' });
    current?.start();
  },
  stop() { /* challenge already finished itself */ },
  applyEffect(effect, kind) { current?.applyEffect(effect, kind); },
};

function disposeCurrent() {
  readyUi.clear();
  if (current) { current.dispose(); current = null; }
}

const game = new Game(runner);
game.code = code;

// ---------- standalone Fire Making mini game ----------
const fireGame = new FireGame({
  prepare(n) {
    disposeFireScene();
    stage.calibrateHeight(); hands.originY = stage.world.position.y;
    hud.timerFn = null;
    fireScene = new FireMakingScene({
      stage, hands, hud, mic, config: FIREGAME, rng: mulberry32((Math.random() * 1e9) | 0),
      finish: (res) => fireGame.finish(res),
      onBegin: (name) => fireGame.begin(name),
    });
    fireScene.setup({ defaultName: `Player ${n}` });
    $('#help').textContent = 'FIRE: drag the knife along the branch to shave curls · drop curls in the nest · flick the knife over the nest to strike · hold Space to blow · drag fuel onto the fire';
  },
  begin(name) { fireScene?.begin(name); },
});
function disposeFireScene() { if (fireScene) { fireScene.dispose(); fireScene = null; } hud.timerFn = null; }

function setMode(m) {
  if (m === mode) return;
  if (mode === 'campaign') { disposeCurrent(); if (game.started) game.abortEpisode(); }
  if (mode === 'fire') { disposeFireScene(); fireGame.reset(); }
  mode = m;
  if (m === 'fire') fireGame.reset();
  hands.showLasers(false); readyUi.clear();
  $('#help').textContent = '';
  hud.timerFn = null; hud.set({ title: 'SURVIVOR VR', timer: '', big: m === 'menu' ? 'MAIN MENU' : '', line: '' });
  ui?.render(); fireUi?.render(); broadcastState();
}
window.__app = { setMode, getMode: () => mode, fireGame, getFireScene: () => fireScene };
window.__game = game;     // handy for debugging / automated tests
window.__hands = hands; window.__stage = stage;
Object.defineProperty(window, '__challenge', { get: () => current });

// ---------- networking (room = code) ----------
const net = connect({
  role: 'host', room: code,
  onMessage: (m) => handle(m),
  onStatus: () => ui?.render(),
});

function handle(m) {
  switch (m.t) {
    case 'hello': broadcastState(); break;
    case 'tv-ping': tvSeen = performance.now(); break;
    case 'join': {
      const r = game.join(m.pid, m.name);
      net.send({ t: 'joinResult', pid: m.pid, ok: r.ok, reason: r.reason });
      break;
    }
    case 'leave': game.removePlayer(m.pid); break;
    case 'tap': { const r = game.tap(m.pid, m.kind); net.send({ t: 'tapResult', pid: m.pid, ok: r.ok, reason: r.reason }); break; }
    case 'vote': { const r = game.submitVote(m.pid, m.target, m.message); net.send({ t: 'voteResult', pid: m.pid, ok: r.ok, reason: r.reason }); break; }
    case 'pick': { const r = game.unanimousPick(m.pid, m.target); net.send({ t: 'voteResult', pid: m.pid, ok: r.ok, reason: r.reason }); break; }
    case 'jury': { const r = game.submitJuryVote(m.pid, m.target); net.send({ t: 'voteResult', pid: m.pid, ok: r.ok, reason: r.reason }); break; }
  }
}

let statePending = false;
function publicAppState() {
  if (mode === 'menu') return { mode: 'menu', code };
  if (mode === 'fire') return { ...fireGame.publicState(), code };
  return { ...game.publicState(), mode: 'campaign' };
}
function broadcastState() { net.send({ t: 'state', s: publicAppState() }); }
const scheduleBroadcast = () => {
  if (statePending) return;
  statePending = true;
  queueMicrotask(() => { statePending = false; broadcastState(); });
};
game.onChange = () => { ui?.render(); if (mode === 'campaign') scheduleBroadcast(); };
fireGame.onChange = () => { fireUi?.render(); if (mode === 'fire') scheduleBroadcast(); };

stage.onMirror = (dataUrl) => {
  if (performance.now() - tvSeen < 10000 && net.mode !== 'connecting') net.send({ t: 'frame', d: dataUrl }, 'tv');
};

// ---------- panel ----------
ui = initPanel({
  game, mic, code,
  api: {
    mode: () => mode, toMenu: () => setMode('menu'),
    netMode: () => net.mode,
    tvAlive: () => performance.now() - tvSeen < 8000,
    abortEpisode: () => { disposeCurrent(); game.abortEpisode(); },
    fakeResult: () => {
      if (!game.run) return;
      if (current) { current.finished = true; current.running = false; }
      const id = game.run.challengeId, rule = SCORING[id];
      const v = rule.better === 'lower' ? 18 + Math.random() * 50 : 8 + Math.random() * 60;
      if (game.phase === 'turnReady' || game.phase === 'countdown' || game.phase === 'handoff') game.phase = 'running';
      game.finishTurn({ value: +v.toFixed(2), dnf: false, progress: 5 });
    },
  },
});

fireUi = initFirePanel({ fireGame, getScene: () => fireScene, setMode, getMode: () => mode, mic, disposeScene: disposeFireScene });
ui.render();

// links
fetch('/__info').then((r) => r.json()).then((info) => {
  const port = location.port || info.port;
  const hosts = info.addresses.length ? info.addresses : [location.hostname];
  const lines = hosts.map((a) => `Phones: <a href="http://${a}:${port}/phone.html?room=${code}" target="_blank">http://${a}:${port}/phone.html</a> (code <b>${code}</b>)<br>TV: <a href="http://${a}:${port}/tv.html?room=${code}" target="_blank">http://${a}:${port}/tv.html?room=${code}</a>`);
  $('#links').innerHTML = lines.join('<hr>') + `<br>On this PC: <a href="/tv.html?room=${code}" target="_blank">open TV</a> · <a href="/phone.html?room=${code}&debug=1" target="_blank">open phone (debug)</a>`;
}).catch(() => {
  $('#links').innerHTML = `<a href="tv.html?room=${code}" target="_blank">TV</a> · <a href="phone.html?room=${code}&debug=1" target="_blank">phone</a> (no relay: tabs in this browser still sync via BroadcastChannel)`;
});

// VR button
stage.xrSupported().then((ok) => {
  if (!ok) return;
  const b = $('#vrbtn'); b.style.display = 'block';
  b.onclick = () => stage.enterVR();
  stage.onXRChange = (on) => { b.textContent = on ? 'EXIT VR' : 'ENTER VR'; $('#panel').classList.toggle('collapsed', on); };
});

// ---------- frame loop ----------
const banner = $('#bigmsg'), cd = $('#cd');
let t = 0;
stage.frameCbs.push((dt, now) => {
  t += dt;
  hands.update(now);
  if (mode === 'fire') {
    const sdt = dt * (window.__fireSpeed || 1);
    fireGame.update(sdt);
    if (fireScene) {
      fireScene.ui.update(hands.pointerRays());
      for (let i = 0; i < (window.__fireSpeed || 1); i++) fireScene.update(dt, now);
    }
    world.tick(t); hud.update(now); hands.endFrame();
    banner.style.display = mode === 'fire' && fireGame.current && fireGame.phase !== 'setup' && fireGame.phase !== 'final' ? 'block' : 'none';
    banner.textContent = `${fireGame.current?.name || ''} · player ${fireGame.index + 1}/${fireGame.total}${fireScene && fireGame.phase === 'running' ? ' · ' + fireScene.getProgress() : ''}`;
    cd.style.display = 'none';
    if (now - lastTick > 200) {
      lastTick = now;
      if (fireScene && ['naming', 'running', 'result'].includes(fireGame.phase)) net.send({ t: 'tick', timer: fireScene.getTimer(), progress: fireScene.getProgress() }, 'tv');
    }
    return;
  }
  if (mode === 'menu') { world.tick(t); hud.update(now); hands.endFrame(); banner.style.display = 'none'; cd.style.display = 'none'; return; }
  game.update(dt);

  const rays = hands.pointerRays();
  if (game.phase === 'turnReady' || game.phase === 'handoff') {
    readyUi.update(rays);
    current?.ui.update(rays);
    if (hands.keysDown.has('enter') && current?.isReady()) game.beginTurn();
  }
  current?.update(dt, now);
  world.tick(t);
  hud.update(now);
  hands.endFrame();

  // overlay text (desktop)
  const p = game.player(game.headsetId);
  const inRun = p && ['turnReady', 'countdown', 'running', 'handoff', 'turnResult'].includes(game.phase);
  banner.style.display = inRun ? 'block' : 'none';
  if (inRun) {
    const tribe = game.run?.relay ? ` · tribe ${game.run.group} ${fmtSeconds(game.relayTotal())}` : '';
    banner.innerHTML = `<span class="dot" style="background:${p.color}"></span>${p.name} is in the headset${tribe}` + (current && game.phase === 'running' ? ` · ${current.getProgress()}` : '');
  }
  cd.style.display = game.phase === 'countdown' ? 'flex' : 'none';
  cd.textContent = game.countdown || 'GO';
  if (game.phase === 'countdown') hud.set({ big: String(game.countdown || 'GO') });

  // 5 Hz tick to TV
  if (now - lastTick > 200) {
    lastTick = now;
    if (current && ['running', 'countdown', 'turnResult', 'handoff'].includes(game.phase)) {
      const relay = game.run?.relay;
      net.send({
        t: 'tick',
        timer: relay ? { label: `TRIBE ${game.run.group}`, value: game.relayTotal(), mode: 'up' } : current.getTimer(),
        progress: current.getProgress(),
      }, 'tv');
    }
  }
});

stage.start();
