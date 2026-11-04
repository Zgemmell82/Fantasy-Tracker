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
import { CHALLENGE_CLASSES } from './challenges/index.js';
import { CHALLENGES } from '../config/challenges.js';
import { SCORING } from '../config/scoring.js';
import { GAME } from '../config/game.js';
import { connect } from '../shared/net.js';
import { mulberry32, clamp } from '../shared/util.js';

const $ = (s) => document.querySelector(s);
const stage = new Stage($('#stage'));
const world = buildWorld(stage.world);
const hands = new Hands(stage);
const hud = new Hud(stage.world);
const readyUi = new Ui3D(stage.world);
let readyBtn = null;
let current = null;           // active Challenge instance
let lastTick = 0, tvSeen = 0;
let ui = null;

// ---------- game <-> scene bridge ----------
const runner = {
  prepare(info) {
    disposeCurrent();
    const Cls = CHALLENGE_CLASSES[info.challengeId];
    stage.calibrateHeight();
    hands.originY = stage.world.position.y;
    const seed = (info.round * 7919 + info.turnIndex * 104729 + (Math.random() * 1e6 | 0)) >>> 0;
    current = new Cls({
      stage, hands, hud,
      config: CHALLENGES[info.challengeId],
      rng: mulberry32(seed),
      finish: (res) => game.finishTurn(res),
      say: (text, kind) => {
        hud.toast(text, kind, performance.now(), 4.5);
        if (kind === 'system') game.pushFeed('system', text);
      },
    });
    current.setup({ ...info, seed });
    hud.set({ title: Cls.meta.name.toUpperCase(), timer: '', big: 'READY?', line: game.player(info.playerId)?.name || '' });
    readyBtn = readyUi.addButton({
      text: 'READY!', sub: 'point + click / trigger', pos: current.readyPos || new THREE.Vector3(0, 1.75, -1.2), width: 0.6, height: 0.26,
      onSelect: () => game.beginTurn(),
    });
    hands.showLasers(true);
    $('#help').textContent = Cls.meta.desktopHelp;
  },
  start() {
    readyUi.clear(); readyBtn = null;
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
  readyUi.clear(); readyBtn = null;
  if (current) { current.dispose(); current = null; }
}

const game = new Game(runner);
window.__game = game;     // handy for debugging / automated tests
window.__hands = hands; window.__stage = stage;
Object.defineProperty(window, '__challenge', { get: () => current });

// ---------- networking ----------
const net = connect({
  role: 'host',
  onMessage: (m, from) => handle(m, from),
  onStatus: () => ui.render(),
});

function handle(m, from) {
  switch (m.t) {
    case 'hello': broadcastState(); break;
    case 'tv-ping': tvSeen = performance.now(); break;
    case 'join': {
      const r = game.join(m.pid, m.name);
      net.send({ t: 'joinResult', pid: m.pid, ok: r.ok, reason: r.reason });
      break;
    }
    case 'leave': game.removePlayer(m.pid); break;
    case 'tap': {
      const r = game.tap(m.pid, m.kind);
      net.send({ t: 'tapResult', pid: m.pid, ok: r.ok, reason: r.reason });
      break;
    }
    case 'vote': {
      const r = game.submitVote(m.pid, m.target, m.message);
      net.send({ t: 'voteResult', pid: m.pid, ok: r.ok, reason: r.reason });
      break;
    }
  }
}

let statePending = false;
function broadcastState() { net.send({ t: 'state', s: game.publicState() }); }
game.onChange = () => {
  ui?.render();
  if (statePending) return;
  statePending = true;
  queueMicrotask(() => { statePending = false; broadcastState(); });
};

stage.onMirror = (dataUrl) => {
  if (performance.now() - tvSeen < 10000 && net.mode !== 'connecting') net.send({ t: 'frame', d: dataUrl }, 'tv');
};

// ---------- panel ----------
ui = initPanel({
  game,
  api: {
    netMode: () => net.mode,
    tvAlive: () => performance.now() - tvSeen < 8000,
    abortRound: () => {
      disposeCurrent();
      game.phase = 'lobby'; game.headsetId = null; game.changed();
    },
    fakeResult: () => {
      const rule = SCORING[game.challengeId];
      const v = rule.better === 'lower' ? 18 + Math.random() * 50 : 8 + Math.random() * 60;
      if (current) { current.finished = true; current.running = false; }
      game.phase = 'running';
      game.finishTurn({ value: +v.toFixed(2), dnf: false, progress: 5 });
    },
  },
});

// links
fetch('/__info').then((r) => r.json()).then((info) => {
  const port = location.port || info.port;
  const hosts = info.addresses.length ? info.addresses : [location.hostname];
  const lines = hosts.map((a) => `Phones: <a href="http://${a}:${port}/phone.html" target="_blank">http://${a}:${port}/phone.html</a><br>TV: <a href="http://${a}:${port}/tv.html" target="_blank">http://${a}:${port}/tv.html</a>`);
  $('#links').innerHTML = lines.join('<hr>');
}).catch(() => {
  $('#links').innerHTML = `Phones: <a href="phone.html" target="_blank">phone.html</a> · TV: <a href="tv.html" target="_blank">tv.html</a><br>(no relay: tabs in this browser still sync via BroadcastChannel)`;
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
  game.update(dt);

  const rays = hands.pointerRays();
  if (game.phase === 'turnReady') {
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
  banner.style.display = p ? 'block' : 'none';
  if (p) banner.innerHTML = `<span class="dot" style="background:${p.color}"></span>${p.name} is in the headset` +
    (current && game.phase === 'running' ? ` · ${current.getProgress()}` : '');
  cd.style.display = game.phase === 'countdown' ? 'flex' : 'none';
  cd.textContent = game.countdown || 'GO';
  if (game.phase === 'countdown') hud.set({ big: String(game.countdown || 'GO') });

  // 5 Hz tick to TV
  if (now - lastTick > 200) {
    lastTick = now;
    if (current && (game.phase === 'running' || game.phase === 'countdown' || game.phase === 'turnResult')) {
      net.send({ t: 'tick', timer: current.getTimer(), progress: current.getProgress() }, 'tv');
    }
  }
});

stage.start();
