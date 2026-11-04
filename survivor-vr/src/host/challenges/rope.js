// Relay challenge: Tangled Rope (simplified) - coloured loops hang on pegs in layers.
// A loop can only slide off when nothing lies on top of it on any peg it hooks. Free the rope!
import * as THREE from 'three';
import { Challenge } from './base.js';
import { Grabber } from './grab.js';
import { mat } from '../world.js';
import { clamp } from '../../shared/util.js';
import { CHALLENGE_META } from '../../config/meta.js';

const COLORS = [0xe2452f, 0xf2b134, 0x3fbf7f, 0x3aa3d9, 0xb06ad6, 0xec7fb4, 0xff8a2b, 0x8fd14f, 0x4fd1c5, 0xe8e0a0];
const BOARD_Z = -0.95, BOARD_Y = 1.4;

export class Rope extends Challenge {
  static meta = CHALLENGE_META.rope;

  setup(turn) {
    super.setup(turn);
    const c = this.cfg;
    this.stage.setLook(0, 1.4, -0.9);
    this.readyPos = new THREE.Vector3(0, 0.88, -0.75);
    this.removed = 0;
    const N = c.loops;
    this.maxLayer = N - 1;

    // board + pegs
    const bw = (c.pegCols - 1) * c.pegSpacingX + 0.5, bh = (c.pegRows - 1) * c.pegSpacingY + 0.45;
    const board = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.04), mat(0x7b5230)); board.position.set(0, BOARD_Y, BOARD_Z); this.root.add(board);
    const pegLen = (N + 3) * c.layerGap + 0.1;
    this.pegPos = [];
    for (let r = 0; r < c.pegRows; r++) for (let col = 0; col < c.pegCols; col++) {
      const x = (col - (c.pegCols - 1) / 2) * c.pegSpacingX, y = BOARD_Y + ((c.pegRows - 1) / 2 - r) * c.pegSpacingY;
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, pegLen, 6), mat(0xd9b97a));
      peg.rotation.x = Math.PI / 2; peg.position.set(x, y, BOARD_Z + 0.02 + pegLen / 2); this.root.add(peg);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), mat(0xffd27a)); cap.position.set(x, y, BOARD_Z + 0.02 + pegLen); this.root.add(cap);
    }

    // loops: random pegs, unique layers (so a valid order always exists)
    const layers = [...Array(N).keys()].sort(() => this.ctx.rng() - 0.5);
    this.loops = [];
    for (let i = 0; i < N; i++) {
      const row = Math.floor(this.ctx.rng() * c.pegRows);
      const span = this.ctx.rng() < 0.5 ? 2 : 1;
      const col = Math.floor(this.ctx.rng() * (c.pegCols - span + 1));
      this._addLoop(i, row, col, span, layers[i]);
    }

    this.grabber = new Grabber(this, {
      items: () => this.loops,
      canGrab: (l) => this.running && l.state === 'free' && this._free(l),
      onDenied: (l) => { if (this.running && l.state === 'free' && !this._free(l)) this._clunk(l); },
      onGrab: () => {},
      onDrop: (l) => { if (l.state === 'free') l.anim = { kind: 'back', t: 0, from: l.mesh.position.clone(), dur: 0.25 }; },
      xrRadius: 0.14,
    });
    this.ctx.hud.place(0, 2.45, -2.3, 1.0);
    this.ctx.hud.set({ title: 'TANGLED ROPE', timer: '0.0', line: `${N} loops left` });
  }

  _addLoop(i, row, col, span, layer) {
    const c = this.cfg;
    const xs = [], x0 = (col - (c.pegCols - 1) / 2) * c.pegSpacingX;
    const cx = x0 + (span - 1) * c.pegSpacingX / 2;
    const y = BOARD_Y + ((c.pegRows - 1) / 2 - row) * c.pegSpacingY;
    const rad = 0.075;
    const m = new THREE.MeshLambertMaterial({ color: COLORS[i % COLORS.length], flatShading: true, emissive: 0x000000 });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.014, 6, 22), m);
    mesh.scale.x = span === 2 ? (c.pegSpacingX + rad * 2) / (rad * 2) : 1;
    const loop = { id: i, row, col, span, layer, mesh, mat: m, state: 'free', radius: 0.1, anim: null,
      home: new THREE.Vector3(cx, y, BOARD_Z + 0.05 + layer * c.layerGap), phase: Math.random() * 6, lockedBy: null };
    mesh.position.copy(loop.home);
    this.root.add(mesh);
    this.loops.push(loop);
    return loop;
  }

  _present() { return this.loops.filter((l) => l.state !== 'gone' && l.state !== 'sliding'); }
  _shares(a, b) { return a.row === b.row && a.col < b.col + b.span && b.col < a.col + a.span; }
  /** nothing lies above it on any shared peg */
  _free(l) { return !this._present().some((o) => o !== l && o.layer > l.layer && this._shares(o, l)); }

  getProgress() { return `${this._present().length} loops left`; }

  _clunk(l) {
    if ((l.clunkAt || 0) > this.t - 0.8) return;
    l.clunkAt = this.t; l.shake = 0.4;
    this.timeAdjust -= this.cfg.blockedPenalty;
    this.ctx.say(`Stuck! That loop is covered. +${this.cfg.blockedPenalty}s`, 'system');
  }

  _slideOff(l) {
    if (this.grabber.held?.item === l) this.grabber.held = null;
    l.state = 'sliding';
    l.anim = { kind: 'off', t: 0, from: l.mesh.position.clone(), dur: 0.55 };
  }

  // ---- effects ----
  act_unhookLoop() {
    const f = this.loops.filter((l) => l.state === 'free' && this._free(l) && this.grabber.item !== l);
    if (f.length) this._slideOff(f[Math.floor(this.ctx.rng() * f.length)]);
  }
  act_reHookLoop() {
    const g = this.loops.filter((l) => l.state === 'gone');
    if (!g.length) return;
    const l = g[Math.floor(this.ctx.rng() * g.length)];
    this.maxLayer++;
    l.layer = this.maxLayer;
    l.home.z = BOARD_Z + 0.05 + l.layer * this.cfg.layerGap;
    l.state = 'free'; l.mesh.visible = true; l.mesh.position.copy(l.home); l.mesh.scale.y = 1; l.mesh.rotation.set(0, 0, 0);
    l.anim = { kind: 'in', t: 0, dur: 0.4 };
    this.removed--;
  }
  act_tightenLoop(def, st) {
    const f = this.loops.filter((l) => l.state === 'free' && this._free(l) && this.grabber.item !== l);
    if (!f.length) return;
    const l = f[Math.floor(this.ctx.rng() * f.length)];
    l.state = 'locked'; st.loop = l; l.mat.color.setHex(0x777777);
  }
  endAct_tightenLoop(def, st) { const l = st.loop; if (l && l.state === 'locked') { l.state = 'free'; l.mat.color.setHex(COLORS[l.id % COLORS.length]); } }

  update(dt, now) {
    super.update(dt, now);
    const c = this.cfg;
    if (this.running) {
      this.grabber.update();
      const g = this.grabber.item;
      if (g && g.mesh.position.distanceTo(g.home) >= c.pullDistance * this.mod('pullScale')) this._slideOff(g);
    }
    const glow = this.hasMod('glowFree'), jit = this.hasMod('jitter');
    for (const l of this.loops) {
      if (l.state === 'gone') continue;
      const pulse = 0.25 + 0.2 * Math.sin(now / 150);
      l.mat.emissive.setScalar(glow && l.state === 'free' && this._free(l) ? pulse : 0);
      if (l.anim) {
        l.anim.t += dt; const k = clamp(l.anim.t / l.anim.dur, 0, 1);
        if (l.anim.kind === 'back') l.mesh.position.lerpVectors(l.anim.from, l.home, k);
        else if (l.anim.kind === 'in') l.mesh.scale.y = k;
        else if (l.anim.kind === 'off') {
          l.mesh.position.set(l.anim.from.x, l.anim.from.y - 0.5 * k * k, l.anim.from.z + 0.25 * k); l.mesh.rotation.x = k * 1.2; l.mesh.scale.setScalar(Math.max(0.05, 1 - k * 0.5));
          if (k >= 1) { l.state = 'gone'; l.mesh.visible = false; this.removed++; l.anim = null; if (!this._present().length) this.finish({ value: +this.elapsed().toFixed(2), dnf: false, progress: this.loops.length }); continue; }
        }
        if (k >= 1) l.anim = null;
      } else if (l.state === 'free' && this.grabber.item !== l) {
        const j = jit ? 0.022 : 0, sk = (l.shake || 0) > 0 ? 0.02 : 0;
        l.mesh.position.set(l.home.x + Math.sin(now / 90 + l.phase) * (j + sk), l.home.y + Math.cos(now / 110 + l.phase) * (j + sk), l.home.z);
        if (l.shake > 0) l.shake -= dt;
      }
    }
    this.ctx.hud.set({ timer: this.elapsed().toFixed(1), line: `${this._present().length} loops left` });
  }

  timeUp() { const left = this._present().length; this.finish({ value: this.cfg.timeLimit, dnf: true, progress: this.loops.length - left, progressText: `${this.loops.length - left}/${this.loops.length}` }); }
}
