// The standalone Fire Making challenge scene (stationary, hands/arms only).
//   1. shave tinder curls off a branch with the knife, drop the right amount into the nest on the fuel
//   2. strike the flint on the knife over the tinder (spark quality = speed x angle x dry tinder)
//   3. blow on the ember (headset mic, or fan with a controller / flick the mouse) and keep adding fuel
//   4. flame heats the rope above it; the heat buffer fills; the rope snaps and the flag pops up -> clock stops
import * as THREE from 'three';
import { Challenge } from '../challenges/base.js';
import { Grabber } from '../challenges/grab.js';
import { mat } from '../world.js';
import { FireSim } from './sim.js';
import { Keyboard } from './keyboard.js';
import { clamp, lerp } from '../../shared/util.js';

const PIT = new THREE.Vector3(0, 0.97, -0.8);
const BRANCH_A = new THREE.Vector3(-0.66, 1.0, -0.8), BRANCH_B = new THREE.Vector3(-0.3, 1.0, -0.8);
const POST_X = 1.05, FLAG_X = 0.6;
const TMP = new THREE.Vector3();

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function segDist(p, a, b) {
  const ab = TMP.copy(b).sub(a), t = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

export class FireMakingScene extends Challenge {
  setup(info = {}) {
    const C = this.cfg, xr = this.stage.isXR;
    this.name = '';
    this.phase = 'naming';                 // naming -> running -> over
    this.over = false; this.result = null;
    this.runT = 0;
    this.stage.setLook(0, 1.4, -0.8);
    this.sim = new FireSim(C, this.ctx.rng);
    this.items = []; this.fuelMeshes = new Map(); this.nestMeshes = [];
    this.curls = []; this.sparks = []; this.pile = { ...C.pile };
    this.branchMoist = C.shave.branchMoisture[0] + this.ctx.rng() * (C.shave.branchMoisture[1] - C.shave.branchMoisture[0]);
    this.shaveCd = 0; this.strikeCd = 0; this.toastT = 0;
    this.blowEnv = 0; this.prevMouse = null; this.mouseSpeed = 0;
    this.blowSource = 'FAN'; this.micHeard = 0; this.autopilot = null;
    this.snapAnim = 0; this.flagY = 0; this.giveUpArmed = 0; this.status = '';

    // ---- table ----
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.05, 0.08, 12), mat(0x8a5a33)); table.position.set(0, 0.9, -0.8); this.root.add(table);
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.05, 10), mat(0x4b4b45)); pit.position.set(PIT.x, 0.95, PIT.z); this.root.add(pit);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), mat(0x6d6d66)); s.position.set(PIT.x + Math.cos(a) * 0.25, 0.98, PIT.z + Math.sin(a) * 0.25); this.root.add(s); }

    // ---- shaving branch on two stumps ----
    this.branch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, BRANCH_B.x - BRANCH_A.x, 7), mat(0x9a6b3c));
    this.branch.rotation.z = Math.PI / 2; this.branch.position.set((BRANCH_A.x + BRANCH_B.x) / 2, 1.0, -0.8); this.root.add(this.branch);
    for (const x of [BRANCH_A.x + 0.04, BRANCH_B.x - 0.04]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.09, 6), mat(0x6b4a2b)); st.position.set(x, 0.975, -0.8); this.root.add(st); }
    const lab = this.label('SHAVE HERE', 0.3); lab.position.set((BRANCH_A.x + BRANCH_B.x) / 2, 1.13, -0.8); this.root.add(lab);
    const nlab = this.label('TINDER NEST', 0.3); nlab.position.set(0, 1.55, -0.8); nlab.visible = false; this.nestLabel = nlab; this.root.add(nlab);

    // ---- tools (items). XR: needs both; desktop: the flint is implied ----
    this.knife = this.makeTool('knife'); this.knife.rest = new THREE.Vector3(-0.1, 0.985, -0.66);
    this.flint = this.makeTool('flint'); this.flint.rest = new THREE.Vector3(0.16, 0.985, -0.66);
    for (const t of [this.knife, this.flint]) { t.mesh.position.copy(t.rest); this.root.add(t.mesh); this.items.push(t); }
    if (!xr) { this.flint.state = 'gone'; this.flint.mesh.visible = true; }           // decorative on desktop

    // ---- extra fuel pile ----
    this.pileItems = [];
    const px = 0.45;
    let k = 0;
    for (const [type, n] of Object.entries(C.pile)) for (let i = 0; i < n; i++) {
      const it = this.makeFuelItem(type);
      it.mesh.position.set(px + 0.14 * (k % 3), 0.99 + 0.045 * Math.floor(k / 3), -0.8 + 0.05 * ((k % 2) - 0.5));
      it.home = it.mesh.position.clone(); this.root.add(it.mesh); this.items.push(it); this.pileItems.push(it); k++;
    }
    const plab = this.label('EXTRA FUEL', 0.3); plab.position.set(0.55, 1.22, -0.8); this.root.add(plab);

    // ---- pit fuel from the sim ----
    this.sim.fuels.forEach((f, i) => this.addFuelMesh(f, i));

    // ---- rope, posts, flag ----
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.4, 6), mat(0x6b4a2b)); p.position.set(sx * POST_X, 1.6, -0.8); this.root.add(p); }
    const ropeY = PIT.y + C.rope.height;
    this.ropeY = ropeY;
    this.ropeMat = new THREE.MeshBasicMaterial({ color: 0xcaa86a });
    this.ropeL = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, POST_X, 6), this.ropeMat);
    this.ropeL.rotation.z = Math.PI / 2; this.ropeL.position.set(-POST_X / 2, ropeY, -0.8);
    // right half runs over the fire and DOWN to the flag, which it holds at the bottom of its pole
    const flagLow = 1.2, dir = new THREE.Vector3(FLAG_X, flagLow - ropeY, 0), len = dir.length();
    this.ropeR = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, len, 6), this.ropeMat);
    this.ropeR.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize().negate());
    this.ropeR.position.set(FLAG_X / 2, (ropeY + flagLow) / 2, -0.8); this.ropeRY = this.ropeR.position.y;
    const fpole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.95, 6), mat(0x6b4a2b)); fpole.position.set(FLAG_X, 1.42, -0.8); this.root.add(fpole);
    this.root.add(this.ropeL, this.ropeR);
    this.flag = new THREE.Group();
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), new THREE.MeshBasicMaterial({ color: 0xe2452f, side: THREE.DoubleSide })); fl.position.set(-0.17, 0, 0); this.flag.add(fl);
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.05, 5), new THREE.MeshBasicMaterial({ color: 0xffe08a, side: THREE.DoubleSide })); star.position.set(-0.17, 0, 0.002); this.flag.add(star);
    this.flag.position.set(FLAG_X - 0.03, flagLow, -0.8); this.flag.scale.y = 0.45; this.root.add(this.flag);
    this.flagLow = flagLow; this.flagHigh = 1.8; this.flagY = this.flagLow;

    // ---- gauges: heat, oxygen, rope heat ----
    this.gauges = {};
    [['heat', 'HEAT', 0xff8a2b, -0.95], ['air', 'AIR', 0x66ccff, -0.83], ['rope', 'ROPE', 0xffe066, -0.71]].forEach(([id, txt, col, x]) => {
      const g = new THREE.Group(); g.position.set(x, 1.28, -0.8);
      g.add(new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.4), new THREE.MeshBasicMaterial({ color: 0x1d140c })));
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.38), new THREE.MeshBasicMaterial({ color: col })); fill.geometry.translate(0, 0.19, 0); fill.position.set(0, -0.19, 0.001); g.add(fill);
      const l = this.label(txt, 0.09, 24); l.position.set(0, -0.26, 0); g.add(l);
      this.root.add(g); this.gauges[id] = fill;
    });

    // ---- particles: flame, ember glow, sparks ----
    this.NF = 70;
    const pos = new Float32Array(this.NF * 3), col = new Float32Array(this.NF * 3);
    this.fp = Array.from({ length: this.NF }, () => ({ life: 0, max: 1, v: new THREE.Vector3(), p: new THREE.Vector3() }));
    this.flameGeo = new THREE.BufferGeometry(); this.flameGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); this.flameGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.dot = dotTexture();
    this.flamePts = new THREE.Points(this.flameGeo, new THREE.PointsMaterial({ size: 0.13, map: this.dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flamePts.frustumCulled = false; this.root.add(this.flamePts);
    this.ember = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0 }));
    this.ember.position.set(PIT.x, PIT.y + 0.03, PIT.z); this.root.add(this.ember);
    for (let i = 0; i < 36; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0xffe08a })); m.visible = false; this.root.add(m);
      this.sparks.push({ mesh: m, v: new THREE.Vector3(), life: 0, q: 0 });
    }

    // ---- grabbing ----
    this.grabber = new Grabber(this, {
      items: () => this.items, holdZ: PIT.z, xrRadius: 0.17,
      canGrab: (it) => this.phase === 'running' && !this.over && it.state === 'free',
      onDrop: (it) => this.onDrop(it),
    });

    // props are hidden while the player types their name
    this.props = this.root.children.filter((c) => c !== this.ui.group);
    this.props.forEach((c) => { c.userData.vis = c.visible; c.visible = false; });

    // ---- keyboard (naming phase) ----
    this.kb = new Keyboard(this.ui, { max: C.nameMax, defaultName: info.defaultName || 'Player', onBegin: (n) => this.ctx.onBegin?.(n) });
    this.ctx.hud.place(0, 2.45, -1.9, 1.0);
    this.ctx.hud.set({ title: 'FIRE MAKING', timer: '', big: '', line: 'Type your name' });
    this.hudMode = 'naming';
  }

  label(text, w, size = 30) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d'); g.fillStyle = 'rgba(29,20,12,.8)'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#ffe9b0'; g.font = `bold ${size + 4}px Trebuchet MS, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
  }

  makeTool(kind) {
    const g = new THREE.Group();
    if (kind === 'knife') {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.008, 0.028), mat(0xc9d1d6)); blade.position.x = 0.09; g.add(blade);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.026, 0.03), mat(0x5a3a1e)); handle.position.x = -0.05; g.add(handle);
    } else {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.12, 6), mat(0x6e7477)); rod.rotation.z = Math.PI / 2; g.add(rod);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.03), mat(0x3a3a3a)); grip.position.x = -0.07; g.add(grip);
    }
    return { kind: 'tool', tool: kind, mesh: g, radius: 0.1, state: 'free', vel: new THREE.Vector3(), prev: null, rest: new THREE.Vector3() };
  }

  makeFuelItem(type) {
    const d = { twig: [0.22, 0.012, 0x8a6a3a], branch: [0.3, 0.022, 0x7a5a30], log: [0.32, 0.05, 0x6b4a2b] }[type];
    const m = new THREE.Mesh(new THREE.CylinderGeometry(d[1], d[1] * 1.1, d[0], 6), mat(d[2]));
    m.rotation.z = Math.PI / 2 + (this.ctx.rng() - 0.5) * 0.3;
    return { kind: 'fuel', type, mesh: m, radius: type === 'twig' ? 0.1 : 0.12, state: 'free' };
  }

  addFuelMesh(f, i) {
    const base = this.makeFuelItem(f.type);
    const m = base.mesh; m.material = m.material.clone(); m.userData.base = new THREE.Color(m.material.color);
    const lvl = f.type === 'log' ? 0 : f.type === 'branch' ? 1 : 2;
    const a = i * 2.4;
    m.position.set(PIT.x + Math.cos(a) * 0.07, 0.99 + lvl * 0.04 + (i % 3) * 0.012, PIT.z + Math.sin(a) * 0.07);
    m.rotation.set(0, a, Math.PI / 2); m.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), a);
    this.root.add(m); this.fuelMeshes.set(f.id, m);
  }

  // ---------------- events ----------------
  toast(text, kind = 'system') { this.ctx.hud.toast(text, kind, performance.now(), 2.5); }

  begin(name) {
    if (this.phase !== 'running') this.phase = 'running';
    this.name = name; this.runT = 0; this.running = true;
    this.kb.group.remove(this.kb.board); this.ui.clear();
    this.props.forEach((c) => { c.visible = c.userData.vis; });
    this.stage.setLook(0, 1.37, -0.8);
    this.nestLabel.visible = true;
    this.giveUp = this.ui.addButton({ text: 'GIVE UP', sub: 'tap twice', pos: new THREE.Vector3(-0.62, 0.86, -0.42), width: 0.22, height: 0.1, res: 256, fs: 0.8, fill: '#c8432b', onSelect: () => this.onGiveUp() });
    this.ui.group.rotation.x = 0; this.ui.group.position.set(0, 0, 0);
    this.ctx.hud.set({ big: '', line: 'Shave tinder · strike · blow!' });
    this.hudMode = 'running';
  }

  onGiveUp() {
    if (this.over || this.phase !== 'running') return;
    if (this.giveUpArmed > 0) return this.end({ dnf: true, reason: 'gave up' });
    this.giveUpArmed = 3; this.ui.setText(this.giveUp, 'CONFIRM?', 'tap again');
  }

  end(r) {
    if (this.over) return;
    this.over = true; this.running = false; this.phase = 'over';
    this.grabber.release();
    const time = +this.runT.toFixed(2);
    this.result = r.dnf ? { dnf: true, value: time, reason: r.reason } : { dnf: false, value: time };
    if (!r.dnf) this.snapAnim = 0.001;
    this.ctx.hud.set({ big: r.dnf ? 'DNF' : time.toFixed(1) + 's', line: r.dnf ? r.reason : 'Flag is up!' });
    this.ctx.finish(this.result);
  }

  // curl lifecycle
  spawnCurl(at) {
    if (this.curls.filter((c) => c.state !== 'gone').length >= this.cfg.shave.maxCurlsOnTray) return null;
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.006, 5, 10, Math.PI * 1.6), new THREE.MeshLambertMaterial({ color: 0xf0dfae, flatShading: true }));
    m.position.copy(at); m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.root.add(m);
    const sh = this.cfg.shave.branchMoisture, T = this.cfg.tinder;
    const dry = lerp(T.dryness[1], T.dryness[0], clamp((this.branchMoist - sh[0]) / (sh[1] - sh[0] || 1), 0, 1));
    const it = { kind: 'curl', mesh: m, radius: 0.07, state: 'fall', dry, vy: 0 };
    this.curls.push(it); this.items.push(it);
    this.branch.scale.set(1, 1, Math.max(0.6, this.branch.scale.z - 0.012)); this.branch.scale.x = this.branch.scale.y = this.branch.scale.z;
    return it;
  }

  nestHit(p) { return Math.hypot(p.x - PIT.x, p.z - PIT.z) < 0.2 && p.y > 0.85 && p.y < 1.7; }

  onDrop(it) {
    const p = it.mesh.position;
    if (it.kind === 'curl') {
      const T = this.sim.tinder;
      if (this.nestHit(p) && (T.state === 'none' || T.state === 'unlit')) { this.consumeCurl(it); }
      else it.state = 'fall';
    } else if (it.kind === 'fuel') {
      if (this.nestHit(p) && Math.hypot(p.x - PIT.x, p.z - PIT.z) < 0.26) {
        const f = this.sim.addFuel(it.type);
        if (f) { this.addFuelMesh(f, this.sim.fuels.length); this.pile[it.type]--; this.root.remove(it.mesh); it.state = 'gone'; this.toast('Added ' + it.type); }
        else { it.mesh.position.copy(it.home); this.toast('Pit is full'); }
      } else if (it.home) it.mesh.position.set(p.x, Math.max(0.99, p.y), p.z);
    } else if (it.kind === 'tool') {
      it.mesh.position.y = Math.max(it.mesh.position.y, 0.985);
    }
  }

  consumeCurl(it) {
    this.sim.addTinder(1, it.dry);
    it.state = 'gone'; this.root.remove(it.mesh);
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.007, 4, 8, Math.PI * 1.6), new THREE.MeshLambertMaterial({ color: 0xf0dfae, flatShading: true }));
    m.position.set(PIT.x + (Math.random() - 0.5) * 0.1, 1.03 + this.nestMeshes.length * 0.006, PIT.z + (Math.random() - 0.5) * 0.1);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0); this.root.add(m); this.nestMeshes.push(m);
    const a = this.sim.tinder.amount, T = this.cfg.tinder;
    this.toast(a < T.minCatch ? 'Tinder: a bit more…' : a > T.maxAmount ? 'Too much tinder - it will smother!' : 'Tinder looks good');
  }

  emitSparks(at, q, dir) {
    const [lo, hi] = this.cfg.strike.sparksPerStrike, n = Math.round(lerp(lo, hi, q));
    let used = 0;
    for (const s of this.sparks) {
      if (used >= n) break; if (s.life > 0) continue;
      s.life = 1.2; s.q = q; s.mesh.visible = true; s.mesh.position.copy(at);
      s.v.set((Math.random() - 0.5) * 0.9 + (dir ? dir.x * 0.3 : 0), 0.3 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5); used++;
    }
  }

  /** strike quality from relative speed (m/s) and angle (rad) to the knife spine */
  strikeQuality(speed, angle) {
    const S = this.cfg.strike, qs = clamp((speed - S.speedRange[0]) / (S.speedRange[1] - S.speedRange[0]), 0, 1);
    const deg = THREE.MathUtils.radToDeg(angle), [a0, a1] = S.angleIdealDeg;
    const off = deg < a0 ? a0 - deg : deg > a1 ? deg - a1 : 0;
    return qs * Math.exp(-Math.pow(off / S.angleFalloffDeg, 2));
  }

  doStrike(at, speed, angle, dir) {
    const q = this.strikeQuality(speed, angle);
    if (q < this.cfg.strike.minQuality) { this.toast(speed < this.cfg.strike.speedRange[0] ? 'Too slow - strike faster' : 'Bad angle - scrape at a slant'); return q; }
    this.emitSparks(at, q, dir); return q;
  }

  // ---------------- blowing ----------------
  blowInput(dt, now) {
    const B = this.cfg.blow, map = (v, [lo, hi]) => clamp((v - lo) / (hi - lo), 0, 1);
    let b = 0, src = 'FAN';
    const mic = this.ctx.mic;
    if (mic?.enabled) { const m = map(mic.level(), B.micRange); if (m > 0.05) this.micHeard = now; b = Math.max(b, m); src = 'MIC'; }
    if (this.autopilot) return this.autopilot.blow;
    if (this.dbgBlowLevel) b = Math.max(b, this.dbgBlowLevel);
    if (this.stage.isXR) {
      for (const s of ['left', 'right']) { const h = this.hands[s]; if (h.connected && h.pos.distanceTo(PIT) < 0.9 && !(this.grabber.held && this.grabber.held.hand === s)) b = Math.max(b, map(h.vel.length(), B.fanSpeedXR)); }
    } else {
      const m = this.hands.mouse;
      if (this.hands.keys.has(' ') || m.rightDown) b = Math.max(b, B.desktopKey);
      if (!this.grabber.held) b = Math.max(b, map(this.mouseSpeed, B.fanSpeedNdc));
    }
    this.blowSource = src;
    return b;
  }

  // ---------------- main loop ----------------
  update(dt, now) {
    this.now = now;
    if (this.phase === 'naming') {
      this.kb.poll(this.hands.keysDown);
      this.drawIdle(now);
      this.updateParticles(dt, now);
      return;
    }
    if (this.giveUpArmed > 0) { this.giveUpArmed -= dt; if (this.giveUpArmed <= 0 && this.giveUp && !this.over) this.ui.setText(this.giveUp, 'GIVE UP', 'tap twice'); }
    const m = this.hands.mouse;
    if (this.prevMouse && dt > 0) this.mouseSpeed += (Math.hypot(m.x - this.prevMouse.x, m.y - this.prevMouse.y) / dt - this.mouseSpeed) * (1 - Math.exp(-14 * dt));
    this.prevMouse = { x: m.x, y: m.y };

    if (this.running) {
      this.runT += dt;
      if (this.autopilot) this.autopilotStep(dt);
      else this.grabber.update();
      this.trackTools(dt);
      this.handleShaveStrike(dt);
      const b = this.blowInput(dt, now);
      this.blowEnv += (b - this.blowEnv) * (1 - Math.exp(-10 * dt));
      this.sim.step(dt, this.blowEnv);
      this.landSparks(dt);
      if (this.sim.snapped) this.end({ dnf: false });
      else if (this.sim.dead) this.end({ dnf: true, reason: 'fire died' });
      else if (this.runT >= this.cfg.timeLimit) this.end({ dnf: true, reason: 'time limit' });
    } else if (this.over) {
      this.sim.step(dt, 0);          // fire keeps living for show
      this.landSparks(dt);
    }
    this.fallCurls(dt);
    this.visuals(dt, now);
    this.updateParticles(dt, now);
    const S = this.sim;
    this.status = `Heat ${(S.H * 100) | 0}% · Air ${(Math.min(S.O, 1.7) * 100) | 0}% · Rope ${(S.rope * 100) | 0}%`;
    this.ctx.hud.set({ timer: this.runT.toFixed(1), line: this.over ? this.ctx.hud.data.line : this.hint() });
  }

  drawIdle(now) { this.emberVisual(0); }

  hint() {
    const S = this.sim, T = S.tinder, C = this.cfg.tinder;
    if (!S.lit) {
      if (T.state === 'none') return 'Shave curls from the branch, drop them in the nest';
      if (T.amount < C.minCatch) return 'Need more tinder';
      return T.amount > C.maxAmount ? 'Too much tinder!' : 'Strike flint on knife over the nest';
    }
    return `Blow (${this.blowSource}) · feed fuel · ${this.status}`;
  }

  getTimer() { return { label: this.phase === 'naming' ? 'NAMING' : 'TIME', value: this.runT, mode: this.running ? 'up' : 'fixed' }; }
  getProgress() { return this.phase === 'naming' ? '' : this.status; }
  snapshot() {
    const S = this.sim;
    return { H: S.H, O: S.O, rope: S.rope, lit: S.lit, dead: S.dead, snapped: S.snapped, tinder: S.tinder.amount, tinderState: S.tinder.state, warm: S.tinder.warm, smother: S.smother,
      tip: S.tip, fuels: S.fuels.map((f) => `${f.type}:${f.spent ? 'ash' : f.burning ? 'burn ' + f.mass.toFixed(2) : 'cold ' + f.temp.toFixed(2)}`), source: this.blowSource, t: this.runT };
  }

  trackTools(dt) {
    for (const t of [this.knife, this.flint]) {
      const p = t.mesh.position;
      if (t.prev && dt > 0) t.vel.lerp(p.clone().sub(t.prev).divideScalar(dt), 1 - Math.exp(-18 * dt));
      t.prev = p.clone();
      if (this.stage.isXR && t.state === 'held' && this.grabber.held?.item === t) {
        const h = this.hands[this.grabber.held.hand]; if (h?.quat) t.mesh.quaternion.copy(h.quat).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)));
      }
      if (t.state === 'free' && !this.grabber.held) { /* resting tools stay where dropped, above the table */ }
    }
    if (!this.stage.isXR && this.grabber.held?.item === this.knife) this.knife.mesh.rotation.set(0, 0, 0.25);
  }

  handleShaveStrike(dt) {
    const C = this.cfg, xr = this.stage.isXR;
    this.shaveCd -= dt; this.strikeCd -= dt;
    const k = this.knife;
    if (k.state !== 'held') return;
    const kp = k.mesh.position, spd = k.vel.length();
    const tip = kp.clone().add(new THREE.Vector3(0.09, 0, 0).applyQuaternion(k.mesh.quaternion));
    // shave
    if (segDist(tip, BRANCH_A, BRANCH_B) < C.shave.reach && spd > (xr ? C.shave.speedXR : C.shave.speedDesktop) && this.shaveCd <= 0) {
      this.shaveCd = C.shave.cooldown;
      const c = this.spawnCurl(tip); if (c) this.toast('Shaved a curl (' + this.curls.filter((x) => x.state !== 'gone').length + ')');
    }
    // strike
    if (this.strikeCd > 0) return;
    const nearNest = Math.hypot(tip.x - PIT.x, tip.z - PIT.z) < C.strike.nestRadius + 0.06 && tip.y > PIT.y && tip.y < PIT.y + 0.6;
    if (!nearNest) return;
    const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(k.mesh.quaternion);
    if (xr) {
      if (this.flint.state !== 'held') return;
      const fp = this.flint.mesh.position, mid = kp.clone().addScaledVector(axis, 0.07);
      if (fp.distanceTo(mid) > C.strike.contactDist + 0.05) return;
      const rel = this.flint.vel.clone().sub(k.vel), sp = rel.length();
      if (sp < C.strike.speedRange[0] * 0.8) return;
      this.strikeCd = C.strike.cooldown;
      const ang = Math.acos(clamp(Math.abs(rel.clone().normalize().dot(axis)), 0, 1));
      this.doStrike(mid, sp, ang, rel.clone().normalize());
    } else if (spd > C.strike.speedRange[0] * 0.8) {
      this.strikeCd = C.strike.cooldown;
      const dir = k.vel.clone().normalize();
      const ang = Math.acos(clamp(Math.abs(dir.dot(axis)), 0, 1));
      this.doStrike(tip, spd, ang, dir);
    }
  }

  landSparks(dt) {
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt; s.v.y -= 6.5 * dt; s.mesh.position.addScaledVector(s.v, dt);
      if (s.mesh.position.y <= PIT.y + 0.05) {
        const onNest = Math.hypot(s.mesh.position.x - PIT.x, s.mesh.position.z - PIT.z) < this.cfg.strike.nestRadius;
        if (onNest) { const r = this.sim.spark(s.q); if (r.ignited) this.toast('IT CATCHES! Now blow gently.', 'help'); }
        s.life = 0;
      }
      if (s.life <= 0) s.mesh.visible = false;
    }
  }

  fallCurls(dt) {
    for (const c of this.curls) {
      if (c.state !== 'fall') continue;
      c.vy -= 3 * dt; c.mesh.position.y += c.vy * dt;
      if (c.mesh.position.y <= 0.975) { c.mesh.position.y = 0.975; c.state = 'free'; c.vy = 0; }
    }
  }

  emberVisual(a) { this.ember.material.opacity = a; }

  visuals(dt, now) {
    const S = this.sim;
    // fuel pieces
    for (const f of S.fuels) {
      const m = this.fuelMeshes.get(f.id); if (!m) continue;
      const d = this.cfg.fuels[f.type], frac = clamp(f.mass / d.mass, 0.0, 1);
      m.scale.set(Math.max(0.3, frac), 1, Math.max(0.3, frac));
      if (f.spent) { m.material.color.setHex(0x2a2826); m.scale.set(0.5, 0.6, 0.5); }
      else if (f.burning) { const fl = 0.5 + 0.5 * Math.sin(now / 90 + f.id); m.material.color.setRGB(lerp(0.35, 1, fl * 0.7), lerp(0.18, 0.4, fl * 0.7), 0.05); }
      else m.material.color.copy(m.userData.base).lerp(new THREE.Color(0x3a2a1a), clamp(f.temp, 0, 1) * 0.6);
    }
    // tinder pile shrinks/burns
    const ta = S.tinder.amount, tot = Math.max(S.tinder.placed, 1e-6);
    this.nestMeshes.forEach((m, i) => { m.visible = i / Math.max(1, this.nestMeshes.length) < ta / tot; m.material.color.setHex(S.tinder.state === 'burning' ? 0xff7a2a : 0xf0dfae); });
    // ember glow
    const glow = clamp(S.H / 0.4, 0, 1) * (S.lit ? 1 : 0) + (S.tinder.state === 'unlit' ? S.tinder.warm * 0.5 : 0);
    this.ember.material.opacity = clamp(glow, 0, 0.6);
    this.ember.scale.setScalar(0.55 + S.H * 0.4 + 0.08 * Math.sin(now / 80));
    // gauges
    this.gauges.heat.scale.y = Math.max(0.001, clamp(S.H / this.cfg.flame.maxHeat, 0, 1));
    this.gauges.air.scale.y = Math.max(0.001, clamp(S.O / this.cfg.oxygen.max, 0, 1));
    this.gauges.rope.scale.y = Math.max(0.001, clamp(S.rope / this.cfg.rope.capacity, 0, 1));
    // rope glows as its buffer fills; snaps
    const rp = clamp(S.rope / this.cfg.rope.capacity, 0, 1);
    this.ropeMat.color.setRGB(lerp(0.79, 1, rp), lerp(0.66, 0.25, rp), lerp(0.42, 0.05, rp));
    if (S.snapped) {
      this.snapAnim += dt;
      const k = clamp(this.snapAnim / 0.6, 0, 1);
      this.ropeL.rotation.z = Math.PI / 2 + k * 1.2; this.ropeL.position.y = this.ropeY - k * 0.5;
      this.ropeR.position.y = this.ropeRY - k * 0.35; this.ropeR.scale.y = Math.max(0.3, 1 - k * 0.6);
      const f = clamp((this.snapAnim - 0.15) / 0.6, 0, 1), e = 1 - Math.pow(1 - f, 3);
      this.flagY = lerp(this.flagLow, this.flagHigh, e) + Math.sin(f * 12) * 0.03 * (1 - f);
      this.flag.position.y = this.flagY; this.flag.scale.y = lerp(0.45, 1, e); this.flag.rotation.y = Math.sin(now / 120) * 0.2 * e;
    }
  }

  updateParticles(dt, now) {
    const S = this.sim, pos = this.flameGeo.attributes.position, col = this.flameGeo.attributes.color;
    const intensity = clamp(S.H / 1.2, 0, 1) * (S.lit ? 1 : 0);
    const want = Math.floor(this.NF * intensity), Oeff = Math.min(S.O, 1.4);
    let alive = 0;
    for (let i = 0; i < this.NF; i++) {
      const p = this.fp[i];
      if (p.life <= 0) {
        if (alive < want && Math.random() < 0.5) {
          p.max = p.life = 0.45 + Math.random() * 0.5;
          const r = 0.03 + 0.05 * intensity;
          p.p.set(PIT.x + (Math.random() - 0.5) * 2 * r, PIT.y + 0.04, PIT.z + (Math.random() - 0.5) * 2 * r);
          p.v.set((Math.random() - 0.5) * 0.1, (0.35 + 0.8 * intensity) * (0.7 + 0.3 * Oeff), (Math.random() - 0.5) * 0.1);
        } else { pos.setXYZ(i, 0, -10, 0); continue; }
      }
      p.life -= dt; if (p.life <= 0) { pos.setXYZ(i, 0, -10, 0); continue; }
      alive++;
      p.p.addScaledVector(p.v, dt); p.p.x += Math.sin(now / 160 + i) * 0.1 * dt;
      const age = 1 - p.life / p.max;
      pos.setXYZ(i, p.p.x, p.p.y, p.p.z);
      // white-yellow -> orange -> dark red as it rises
      const dim = 0.5 * (1 - age * 0.6);
      col.setXYZ(i, dim, dim * lerp(0.9, 0.12, age), dim * lerp(0.45, 0.0, age * 1.3));
    }
    pos.needsUpdate = true; col.needsUpdate = true;
    this.flamePts.material.size = 0.06 + 0.07 * intensity;
  }

  // ---------------- debug + autopilot ----------------
  dbgShave(n = 5) { for (let i = 0; i < n; i++) { const c = this.spawnCurl(new THREE.Vector3(BRANCH_A.x + 0.1 + i * 0.03, 1.02, -0.8)); if (c) this.consumeCurl(c); } }
  dbgStrike(q = 0.85) { this.emitSparks(new THREE.Vector3(PIT.x, PIT.y + 0.2, PIT.z), q, null); }
  dbgAddFuel(type = 'twig') { const f = this.sim.addFuel(type); if (f) this.addFuelMesh(f, this.sim.fuels.length); return !!f; }
  dbgSnap() { this.sim.rope = this.cfg.rope.capacity; }
  dbgKill() { this.sim.lit = true; this.sim.H = 0; for (const f of this.sim.fuels) { f.spent = true; f.burning = false; } this.sim.tinder.state = 'spent'; }

  /** scripted player (uses the same sim + visuals, skips the pointing): for the debug panel and tests */
  startAutopilot(opts = {}) {
    this.autopilot = { stage: 0, t: 0, blow: 0, curls: opts.curls ?? 5, q: opts.q ?? 0.8, sloppy: !!opts.sloppy, feedT: 0 };
  }
  autopilotStep(dt) {
    const A = this.autopilot, S = this.sim; A.t += dt;
    if (A.stage === 0) { if (A.t > 0.8) { this.dbgShave(A.curls); A.stage = 1; A.t = 0; } }
    else if (A.stage === 1) {
      if (S.tinder.state === 'unlit' && A.t > 0.3) { A.t = 0; this.dbgStrike(A.q); }
      if (S.lit) A.stage = 2;
    } else {
      A.blow = A.sloppy ? (S.lit && S.tinder.state === 'spent' ? 1 : 0) : (S.H < 0.9 ? 0.45 : 0.2);
      A.feedT -= dt;
      if (A.feedT <= 0 && !A.sloppy) {
        A.feedT = 3;
        if (S.fuels.filter((f) => !f.spent).length < 6 && S.H > 0.3) for (const ty of S.H < 1 ? ['twig', 'branch', 'log'] : ['branch', 'log', 'twig']) if (this.pile[ty] > 0 && this.dbgAddFuel(ty)) { this.pile[ty]--; break; }
      }
    }
  }

  dispose() { this.dot?.dispose(); super.dispose(); }
}
