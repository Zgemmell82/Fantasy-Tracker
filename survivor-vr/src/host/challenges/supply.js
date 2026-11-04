// Relay challenge: Supply Sort - drag each item from the floating pile into the matching basket.
import * as THREE from 'three';
import { Challenge } from './base.js';
import { Grabber } from './grab.js';
import { mat } from '../world.js';
import { clamp, lerp } from '../../shared/util.js';
import { CHALLENGE_META } from '../../config/meta.js';

const TYPES = [
  { id: 'coconut', label: 'COCONUTS', color: 0x8a5a33 },
  { id: 'fish', label: 'FISH', color: 0x3aa3d9 },
  { id: 'torch', label: 'TORCHES', color: 0xe2452f },
  { id: 'fruit', label: 'FRUIT', color: 0xf2b134 },
];
const Z = -0.8;

function makeItem(type) {
  const g = new THREE.Group();
  if (type === 'coconut') {
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), mat(0x7a4a26)));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 4), mat(0x2b1606)); eye.position.set(0.02, 0.05, 0.055); g.add(eye);
    const eye2 = eye.clone(); eye2.position.x = -0.02; g.add(eye2);
  } else if (type === 'fish') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 5), mat(0x3aa3d9)); b.scale.set(1.5, 0.8, 0.5); g.add(b);
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 3), mat(0x2a7fb0)); t.rotation.z = -Math.PI / 2; t.position.x = -0.12; g.add(t);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 4, 4), mat(0xffffff)); e.position.set(0.07, 0.015, 0.035); g.add(e);
  } else if (type === 'torch') {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.17, 5), mat(0x6b4a2b)); g.add(p);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 5), new THREE.MeshBasicMaterial({ color: 0xff9a1a })); f.position.y = 0.12; g.add(f);
  } else {
    const a = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), mat(0xf2b134)); g.add(a);
    const l = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 3), mat(0x3fb85a)); l.position.set(0.02, 0.07, 0); l.rotation.z = -0.5; g.add(l);
  }
  return g;
}

function labelTex(text, color, hidden) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#2b1606'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 88);
  g.fillStyle = '#fff6df'; g.font = 'bold 44px Trebuchet MS, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(hidden ? '???' : text, 128, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Supply extends Challenge {
  static meta = CHALLENGE_META.supply;

  setup(turn) {
    super.setup(turn);
    const c = this.cfg;
    this.stage.setLook(0, 1.4, -0.8);
    this.readyPos = new THREE.Vector3(0, 0.62, -0.7);
    this.sorted = 0; this.penalty = 0;
    this.hidden = false;

    // baskets
    this.baskets = TYPES.map((t, i) => {
      const g = new THREE.Group();
      const w = c.basketWidth, d = 0.22, h = 0.2;
      const wall = (sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(0xb98a4a)); m.position.set(x, y, z); g.add(m); };
      wall(w, 0.025, d, 0, 0, 0); wall(w, h, 0.025, 0, h / 2, d / 2); wall(w, h, 0.025, 0, h / 2, -d / 2); wall(0.025, h, d, w / 2, h / 2, 0); wall(0.025, h, d, -w / 2, h / 2, 0);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, 0.02, d + 0.03), mat(t.color)); rim.position.y = h; g.add(rim);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), new THREE.MeshBasicMaterial({ map: labelTex(t.label, t.color, false) }));
      label.position.set(0, h + 0.13, d / 2 + 0.01); g.add(label);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.25, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff08a, transparent: true, opacity: 0.0, depthWrite: false }));
      glow.position.set(0, h * 0.6, d / 2 + 0.02); g.add(glow);
      g.position.set((i - 1.5) * c.basketSpacing, c.basketY, Z);
      this.root.add(g);
      return { type: t.id, def: t, group: g, label, glow, x: g.position.x, targetX: g.position.x, scale: 1, shown: false };
    });

    // items
    this.items = [];
    for (const t of TYPES) for (let k = 0; k < c.itemsPerType; k++) {
      const mesh = makeItem(t.id);
      const tag = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: 0.0, depthWrite: false }));
      tag.position.z = -0.05; mesh.add(tag);
      this.root.add(mesh);
      this.items.push({ type: t.id, mesh, tag, radius: 0.1, state: 'free', bob: Math.random() * 6, anim: null });
    }
    this.total = this.items.length;
    for (const it of this.items) this._scatter(it);

    this.grabber = new Grabber(this, {
      items: () => this.items, holdZ: Z + 0.03, xrRadius: c.xrGrabRadius,
      canGrab: (it) => it.state === 'free' && this.running,
      onDrop: (it) => this._drop(it),
    });
    this.ctx.hud.place(0, 2.45, -2.2, 1.0);
    this.ctx.hud.set({ title: 'SUPPLY SORT', timer: '0.0', line: `0 / ${this.total} sorted` });
  }

  _scatter(it) {
    for (let tries = 0; tries < 60; tries++) {
      const x = (this.ctx.rng() * 2 - 1) * 0.62, y = 1.25 + this.ctx.rng() * 0.7;
      if (this.items.some((o) => o !== it && o.state === 'free' && o.placed && Math.hypot(o.mesh.position.x - x, o.mesh.position.y - y) < 0.17) && tries < 50) continue;
      it.mesh.position.set(x, y, Z + 0.05 + 0.5 * x * x);
      it.mesh.rotation.set(0, 0, (this.ctx.rng() - 0.5) * 1.2);
      it.placed = true; return;
    }
  }

  getProgress() { return `${this.sorted} / ${this.total} sorted`; }

  // ---- effects ----
  act_autoSort(def, st, a) {
    const free = this.items.filter((i) => i.state === 'free').sort(() => this.ctx.rng() - 0.5).slice(0, a.count);
    for (const it of free) this._sink(it, true);
  }
  act_swapBaskets() {
    const a = this.baskets[Math.floor(this.ctx.rng() * 4)];
    let b; do { b = this.baskets[Math.floor(this.ctx.rng() * 4)]; } while (b === a);
    [a.targetX, b.targetX] = [b.targetX, a.targetX];
  }
  act_scatterPile() {
    if (this.grabber.held) { this.grabber.held.item.state = 'free'; this.grabber.held = null; }
    for (const it of this.items) if (it.state === 'free') this._scatter(it);
  }

  _basketAt(p) {
    const c = this.cfg;
    for (const b of this.baskets) {
      const half = c.basketWidth * b.scale / 2 + 0.05;
      if (Math.abs(p.x - b.group.position.x) < half && p.y > c.basketY - 0.1 && p.y < c.basketY + 0.55 && Math.abs(p.z - Z) < 0.4) return b;
    }
    return null;
  }

  _drop(it) {
    const b = this._basketAt(it.mesh.position);
    if (!b) { it.mesh.position.z = clamp(it.mesh.position.z, Z, Z + 0.5); return; }
    if (b.type === it.type) this._sink(it, false);
    else { this.timeAdjust -= this.cfg.wrongPenalty; this.ctx.say(`Wrong basket! +${this.cfg.wrongPenalty}s`, 'system'); this._bounce(it); }
  }

  _sink(it, fancy) {
    const b = this.baskets.find((x) => x.type === it.type);
    if (this.grabber.held?.item === it) this.grabber.held = null;
    it.state = 'sinking';
    it.anim = { kind: 'sink', t: 0, from: it.mesh.position.clone(), basket: b, dur: fancy ? 0.6 : 0.3 };
  }
  _bounce(it) {
    it.state = 'returning';
    const from = it.mesh.position.clone(); this._scatter(it); const to = it.mesh.position.clone(); it.mesh.position.copy(from);
    it.anim = { kind: 'bounce', t: 0, from, to, dur: 0.4 };
  }

  update(dt, now) {
    super.update(dt, now);
    const c = this.cfg;
    this.hidden = this.hasMod('hideLabels');
    const scaleT = this.mod('basketScale');
    for (const b of this.baskets) {
      b.x = lerp(b.x, b.targetX, 1 - Math.exp(-6 * dt)); b.group.position.x = b.x;
      b.scale = lerp(b.scale, scaleT, 1 - Math.exp(-5 * dt)); b.group.scale.set(b.scale, 1, 1);
      if (b.shown !== this.hidden) { b.shown = this.hidden; b.label.material.map = labelTex(b.def.label, b.def.color, this.hidden); b.label.material.needsUpdate = true; }
      b.glow.material.opacity = 0;
    }
    if (this.running) this.grabber.update();
    const hint = this.hasMod('hint');
    const heldItem = this.grabber.item;
    if (hint && heldItem) { const b = this.baskets.find((x) => x.type === heldItem.type); b.glow.material.opacity = 0.35 + 0.25 * Math.sin(now / 130); }
    for (const it of this.items) {
      if (it.state === 'gone') continue;
      it.tag.material.opacity = hint && it.state === 'free' ? 0.75 : 0;
      if (it.state === 'free') it.mesh.position.y += Math.sin(now / 650 + it.bob) * 0.0003;
      if (it.anim) {
        it.anim.t += dt; const k = clamp(it.anim.t / it.anim.dur, 0, 1);
        if (it.anim.kind === 'sink') {
          const b = it.anim.basket, tgt = new THREE.Vector3(b.group.position.x, c.basketY + 0.12, Z);
          it.mesh.position.lerpVectors(it.anim.from, tgt, k); it.mesh.scale.setScalar(1 - 0.5 * k);
          if (k >= 1) { it.state = 'gone'; it.mesh.visible = false; it.anim = null; this.sorted++; if (this.sorted >= this.total) this.finish({ value: +this.elapsed().toFixed(2), dnf: false, progress: this.sorted }); }
        } else {
          it.mesh.position.lerpVectors(it.anim.from, it.anim.to, k);
          if (k >= 1) { it.state = 'free'; it.anim = null; }
        }
      }
    }
    this.ctx.hud.set({ timer: this.elapsed().toFixed(1), line: `${this.sorted} / ${this.total} sorted` });
  }

  timeUp() { this.finish({ value: this.cfg.timeLimit, dnf: true, progress: this.sorted, progressText: `${this.sorted}/${this.total}` }); }
}
