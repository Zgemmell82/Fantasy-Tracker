// Finale challenge: Fire Making. Stationary, hands-only.
//  1) STRIKE the fire-steel (fast strokes) until the tinder glows into an ember.
//  2) Feed the ember: BLOW on the headset mic (if available) or FAN with the controllers / flick the mouse
//     to raise the heat, then drop kindling on in stages (twigs -> sticks -> logs) while the heat bar is high enough.
//  3) Done when the flame reaches the target size.
import * as THREE from 'three';
import { Challenge } from './base.js';
import { Grabber } from './grab.js';
import { mat } from '../world.js';
import { clamp, lerp } from '../../shared/util.js';
import { CHALLENGE_META } from '../../config/meta.js';

const FIRE = new THREE.Vector3(0, 0.98, -0.78);

export class Fire extends Challenge {
  static meta = CHALLENGE_META.fire;

  setup(turn) {
    super.setup(turn);
    const c = this.cfg;
    this.stage.setLook(0, 1.0, -0.75);
    this.readyPos = new THREE.Vector3(0, 0.62, -0.55);
    this.strikes = 0; this.ember = false; this.stageIdx = 0; this.fedInStage = 0;
    this.heat = 0; this.flame = 0.02; this.strikeCd = 0; this.sp = 0; this.spX = 0;
    this.prevM = null; this.sparks = [];
    this.warn = '';

    // table + fire pit
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.06, 10), mat(0x8a5a33)); table.position.set(0, 0.9, -0.75); this.root.add(table);
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.05, 9), mat(0x4b4b45)); pit.position.set(FIRE.x, 0.95, FIRE.z); this.root.add(pit);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, st = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), mat(0x6d6d66));
      st.position.set(FIRE.x + Math.cos(a) * 0.22, 0.98, FIRE.z + Math.sin(a) * 0.22); this.root.add(st);
    }
    // tinder
    this.tinder = new THREE.Group();
    for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035 + Math.random() * 0.02, 0), mat(0xc9a86a)); t.position.set((Math.random() - 0.5) * 0.1, 0.99 + Math.random() * 0.03, FIRE.z + (Math.random() - 0.5) * 0.1); this.tinder.add(t); }
    this.root.add(this.tinder);
    // fire-steel + striker
    const steel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.025), mat(0x9aa4aa)); steel.position.set(0, 1.0, -0.62); this.root.add(steel);
    this.striker = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.14), mat(0x3a3a3a)); this.striker.position.set(0, 1.07, -0.62); this.root.add(this.striker);
    // ember + flame
    this.emberMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 1), new THREE.MeshBasicMaterial({ color: 0xff5a1a })); this.emberMesh.position.set(FIRE.x, 1.0, FIRE.z); this.emberMesh.visible = false; this.root.add(this.emberMesh);
    this.flameGroup = new THREE.Group(); this.flameGroup.position.set(FIRE.x, 1.0, FIRE.z);
    [[0.11, 0xff6a1a, 0], [0.08, 0xffb020, 0.01], [0.05, 0xfff2a0, 0.02]].forEach(([r, col, z]) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, 1, 6), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.92 })); m.position.set(0, 0.5, z); this.flameGroup.add(m);
    });
    this.flameGroup.visible = false; this.root.add(this.flameGroup);
    this.logGroup = new THREE.Group(); this.root.add(this.logGroup);

    // gauge: heat bar (marker = heat needed for the next kindling) + flame bar
    const bar = (x, color) => {
      const g = new THREE.Group(); g.position.set(x, 1.25, -0.8);
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.4), new THREE.MeshBasicMaterial({ color: 0x1d140c })); g.add(bg);
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.38), new THREE.MeshBasicMaterial({ color })); fill.geometry.translate(0, 0.19, 0); fill.position.set(0, -0.19, 0.001); g.add(fill);
      this.root.add(g); return { g, fill };
    };
    this.heatBar = bar(0.55, 0xffcc4d); this.flameBar = bar(0.67, 0xff6a1a);
    this.marker = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.012), new THREE.MeshBasicMaterial({ color: 0xffffff })); this.marker.position.z = 0.002; this.heatBar.g.add(this.marker);
    const tgt = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.012), new THREE.MeshBasicMaterial({ color: 0x66ff99 })); tgt.position.set(0, -0.19 + 0.38 * c.finishSize, 0.002); this.flameBar.g.add(tgt);

    // kindling
    this.kind = [];
    this._spawnKindling();
    this.grabber = new Grabber(this, {
      items: () => this.kind, holdZ: FIRE.z + 0.02, xrRadius: 0.16,
      canGrab: (it) => this.running && this.ember && it.state === 'free',
      onDrop: (it) => this._feed(it),
    });

    // rain visual
    const n = 160, arr = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 3, y = Math.random() * 2.5, z = -Math.random() * 2.2; arr.set([x, y, z, x - 0.04, y - 0.25, z], i * 6); }
    this.rainGeo = new THREE.BufferGeometry(); this.rainGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.rain = new THREE.LineSegments(this.rainGeo, new THREE.LineBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.6 })); this.rain.frustumCulled = false; this.rain.visible = false; this.root.add(this.rain);

    // sparks pool
    for (let i = 0; i < 14; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0xffe08a })); s.visible = false; this.root.add(s); this.sparks.push({ mesh: s, v: new THREE.Vector3(), life: 0 }); }

    this.ctx.hud.place(0, 2.2, -2.0, 1.0);
    this.ctx.hud.set({ title: 'FIRE MAKING', timer: '0.0', line: 'Strike the fire-steel!' });
  }

  _spawnKindling() {
    for (const k of this.kind) this.root.remove(k.mesh);
    this.kind = [];
    const st = this.cfg.kindling[this.stageIdx];
    if (!st) return;
    for (let i = 0; i < st.count - this.fedInStage; i++) this.kind.push(this._makeKindle(st, i));
  }

  _makeKindle(st, i) {
    const len = st.name === 'twigs' ? 0.14 : st.name === 'sticks' ? 0.2 : 0.26, rad = st.name === 'twigs' ? 0.012 : st.name === 'sticks' ? 0.02 : 0.04;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 1.1, len, 6), mat(st.name === 'logs' ? 0x6b4a2b : 0x8a6a3a));
    mesh.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    this._place(mesh, i);
    this.root.add(mesh);
    return { mesh, state: 'free', radius: 0.12, stage: st };
  }

  _place(mesh, i) { mesh.position.set(-0.55 + (i % 3) * 0.07, 1.02 + Math.floor(i / 3) * 0.05 + 0.02 * (i % 2), -0.65 - (i % 2) * 0.06); }

  // ---- effects ----
  act_gust(def, st, a) { this.heat = Math.max(this.cfg.heatFloor, this.heat - a.heatLoss); }
  act_scatterKindling() {
    if (this.grabber.held) { this.grabber.held.item.state = 'free'; this.grabber.held = null; }
    for (const k of this.kind) k.mesh.position.set((Math.random() * 2 - 1) * 0.6, 1.0 + Math.random() * 0.45, -0.55 - Math.random() * 0.2);
  }
  act_autoFeed() {
    if (!this.ember) { this.strikes = Math.min(this.strikes + 2, this._need() - 1); return; }
    if (this.kind.length) this._accept(this.kind[0]);
  }
  onEffectStart(e) { if (e.def.mods?.rain) this.rain.visible = true; }
  onEffectEnd() { if (!this.hasMod('rain')) this.rain.visible = false; }

  _need() { return Math.max(1, Math.ceil(this.cfg.strikesNeeded * this.mod('strikeNeed'))); }

  _spark(n = 5) {
    for (const s of this.sparks.slice(0, n)) { s.life = 0.45; s.mesh.visible = true; s.mesh.position.set(FIRE.x + (Math.random() - 0.5) * 0.1, 1.02, FIRE.z + 0.1); s.v.set((Math.random() - 0.5) * 0.7, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5); }
    this.sparks.push(this.sparks.shift());
  }

  _feed(it) {
    const c = this.cfg, p = it.mesh.position;
    const near = Math.hypot(p.x - FIRE.x, p.z - FIRE.z) < c.feedRadius + 0.05 && Math.abs(p.y - 1.0) < 0.4;
    if (!near) { it.mesh.position.z = clamp(it.mesh.position.z, -0.85, -0.5); return; }
    const st = c.kindling[this.stageIdx];
    if (this.heat >= st.minHeat) this._accept(it);
    else {
      this.heat *= c.smotherPenalty;                    // too early: smothers the ember
      this.ctx.say('Too early! The fire smothers. Blow more first.', 'system');
      this._place(it.mesh, 0);
    }
  }

  _accept(it) {
    const st = this.cfg.kindling[this.stageIdx];
    it.state = 'gone'; this.root.remove(it.mesh); this.kind = this.kind.filter((k) => k !== it);
    this.fedInStage++;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * (this.stageIdx + 1), 0.02 * (this.stageIdx + 1), 0.2, 5), mat(0x6b4a2b));
    log.position.set(FIRE.x + (Math.random() - 0.5) * 0.1, 0.99 + this.logGroup.children.length * 0.012, FIRE.z + (Math.random() - 0.5) * 0.1);
    log.rotation.set(Math.PI / 2, 0, Math.random() * 3); this.logGroup.add(log);
    if (this.fedInStage >= st.count) { this.stageIdx++; this.fedInStage = 0; this.ctx.say(`${st.name} burning! Next stage.`, 'system'); this._spawnKindling(); }
  }

  /** 0..1 fan/blow strength from mic, controllers or mouse */
  _blow(dt) {
    const c = this.cfg;
    const map = (v, [lo, hi]) => clamp((v - lo) / (hi - lo), 0, 1);
    let b = 0;
    const mic = this.ctx.mic;
    if (mic?.enabled) b = Math.max(b, map(mic.level(), c.micThreshold));
    if (this.stage.isXR) { for (const s of ['left', 'right']) { const h = this.hands[s]; if (h.connected) b = Math.max(b, map(h.vel.length(), c.fanSpeedXR)); } }
    else b = Math.max(b, map(this.sp, c.fanSpeedNdc));
    return b;
  }

  update(dt, now) {
    super.update(dt, now);
    const c = this.cfg, xr = this.stage.isXR;

    // mouse speed (screen widths / s), smoothed
    const m = this.hands.mouse;
    if (this.prevM && dt > 0) {
      const dx = Math.abs(m.x - this.prevM.x) / dt, dy = Math.abs(m.y - this.prevM.y) / dt;
      const raw = Math.hypot(dx, dy);
      this.sp = lerp(this.sp, raw, 1 - Math.exp(-14 * dt)); this.spX = lerp(this.spX, dx, 1 - Math.exp(-14 * dt));
      this.rawX = dx;
    }
    this.prevM = { x: m.x, y: m.y };
    this.strikeCd -= dt;

    // striker visual
    if (xr) { const h = this.hands.right.connected ? this.hands.right : this.hands.left; if (h.connected) this.striker.position.set(h.pos.x, h.pos.y, h.pos.z); }
    else this.striker.position.set(clamp(m.x, -1, 1) * 0.2, 1.07, -0.62);

    if (this.running) {
      if (!this.ember) {
        // ---- STRIKE ----
        let stroke = false;
        if (xr) {
          for (const s of ['left', 'right']) { const h = this.hands[s]; if (h.connected && h.vel.length() > c.strikeSpeedXR * this.mod('strikeSpeed') && Math.hypot(h.pos.x - FIRE.x, h.pos.z - FIRE.z) < 0.5) stroke = true; }
        } else stroke = Math.max(this.spX, this.rawX || 0) > c.strikeSpeedNdc * this.mod('strikeSpeed') && m.inside;
        if (stroke && this.strikeCd <= 0) { this.strikes++; this.strikeCd = c.strikeCooldown; this._spark(5); }
        if (this.strikes >= this._need()) { this.ember = true; this.heat = 0.2; this.emberMesh.visible = true; this.ctx.say('Ember! Now feed it - blow or fan, then add kindling.', 'system'); }
      } else {
        // ---- FEED ----
        this.grabber.update();
        const B = this._blow(dt);
        const decay = c.heatDecay * (1 + c.decayPerStage * this.stageIdx) * this.mod('heatDecay');
        this.heat = clamp(this.heat + (c.blowGain * B * this.mod('blowGain') - decay) * dt, c.heatFloor, 1);
        const prevSize = this.stageIdx === 0 ? 0.05 : c.kindling[this.stageIdx - 1].size;
        const st = c.kindling[this.stageIdx];
        const unlocked = st ? lerp(prevSize, st.size, this.fedInStage / st.count) : c.kindling[c.kindling.length - 1].size;
        const target = unlocked * clamp(this.heat / c.fullHeat, 0, 1);
        this.flame += (target - this.flame) * (1 - Math.exp(-c.flameGrow * dt));
        if (!st && this.flame >= c.finishSize) return this.finish({ value: +this.elapsed().toFixed(2), dnf: false, progress: 4 });
      }
    }

    // visuals
    this.tinder.visible = !this.ember;
    const S = clamp(this.flame, 0.02, 1.1);
    this.flameGroup.visible = this.ember;
    this.flameGroup.scale.set(0.5 + S * 1.2, 0.08 + S * 0.7, 0.5 + S * 1.2);
    this.flameGroup.children.forEach((f, i) => { f.scale.y = 1 + Math.sin(now / (80 + i * 30) + i) * 0.12; });
    this.emberMesh.scale.setScalar(0.7 + this.heat * 0.8);
    this.emberMesh.material.color.setHSL(0.05 + this.heat * 0.07, 1, 0.35 + this.heat * 0.2);
    const st2 = c.kindling[this.stageIdx];
    this.heatBar.fill.scale.y = Math.max(0.001, this.heat);
    this.heatBar.fill.material.color.setHex(st2 && this.heat >= st2.minHeat ? 0x66ff99 : 0xffcc4d);
    this.marker.position.y = -0.19 + 0.38 * (st2 ? st2.minHeat : 1);
    this.marker.visible = !!st2 && this.ember;
    this.flameBar.fill.scale.y = Math.max(0.001, this.flame);
    for (const s of this.sparks) if (s.life > 0) { s.life -= dt; s.v.y -= 2.2 * dt; s.mesh.position.addScaledVector(s.v, dt); if (s.life <= 0) s.mesh.visible = false; }
    if (this.rain.visible) { const p = this.rainGeo.attributes.position; for (let i = 0; i < p.count; i += 2) { p.setY(i, p.getY(i) - dt * 7); p.setY(i + 1, p.getY(i + 1) - dt * 7); if (p.getY(i + 1) < 0.8) { p.setY(i, 2.8); p.setY(i + 1, 2.55); } } p.needsUpdate = true; }

    const line = !this.ember ? `Strike! ${this.strikes}/${this._need()}` : st2 ? `Heat ${(this.heat * 100) | 0}% · add ${st2.name} (needs ${(st2.minHeat * 100) | 0}%)` : `Flame ${(this.flame * 100) | 0}% / ${(c.finishSize * 100) | 0}%`;
    this.ctx.hud.set({ timer: this.elapsed().toFixed(1), line });
    this._line = line;
  }

  getProgress() { return this._line || ''; }
  timeUp() { this.finish({ value: this.cfg.timeLimit, dnf: true, progress: this.ember ? 1 + this.stageIdx : 0, progressText: this.ember ? `stage ${this.stageIdx}` : 'no ember' }); }
}
