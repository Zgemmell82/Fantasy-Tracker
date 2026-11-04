// Challenge 3: Jigsaw - pieces float in front of the player; grab and snap them into the frame.
// Each player gets a different picture (same grid = equal difficulty). Fastest wins.
import * as THREE from 'three';
import { Challenge } from './base.js';
import { mat } from '../world.js';
import { makePicture, makeTabs, drawPiece, PICTURES } from './jigsaw.js';
import { clamp, lerp, mulberry32 } from '../../shared/util.js';
import { CHALLENGE_META } from '../../config/meta.js';

const FRAME_Z = -0.8;
const FRAME_Y = 1.38;

export class Puzzle extends Challenge {
  static meta = CHALLENGE_META.puzzle;

  setup(turn) {
    super.setup(turn);
    const c = this.cfg;
    this.stage.setLook(0, 1.45, -0.8);
    this.readyPos = new THREE.Vector3(0, 0.98, -0.8);
    this.picIndex = ((turn.round || 0) + (turn.turnIndex || 0)) % PICTURES.length;
    this.pictureCanvas = makePicture(this.picIndex);
    this.tabs = makeTabs(c.cols, c.rows, 900 + this.picIndex * 31);
    this.cell = c.cellSize;
    this.placed = 0;
    this.held = null;
    this.highlight = null;
    this.pieces = [];
    this.total = c.cols * c.rows;
    this.srng = mulberry32((turn.seed || 1) ^ 0x9e3779b9);

    // frame: bamboo border + faint slot grid
    const fw = c.cols * this.cell, fh = c.rows * this.cell;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshBasicMaterial({ color: 0x2a3b2f, transparent: true, opacity: 0.55 }));
    back.position.set(0, FRAME_Y, FRAME_Z - 0.01); this.root.add(back);
    const bar = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), mat(0xb0823f)); m.position.set(x, FRAME_Y + y, FRAME_Z - 0.01); this.root.add(m); };
    bar(fw + 0.08, 0.04, 0, fh / 2 + 0.02); bar(fw + 0.08, 0.04, 0, -fh / 2 - 0.02); bar(0.04, fh, -fw / 2 - 0.02, 0); bar(0.04, fh, fw / 2 + 0.02, 0);
    const lines = [];
    for (let i = 1; i < c.cols; i++) lines.push(-fw / 2 + i * this.cell, -fh / 2, FRAME_Z - 0.005, -fw / 2 + i * this.cell, fh / 2, FRAME_Z - 0.005);
    for (let i = 1; i < c.rows; i++) lines.push(-fw / 2, -fh / 2 + i * this.cell, FRAME_Z - 0.005, fw / 2, -fh / 2 + i * this.cell, FRAME_Z - 0.005);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const grid = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x8fb89c, transparent: true, opacity: 0.5 }));
    grid.position.y = FRAME_Y; this.root.add(grid);

    // reference picture card
    const tex = new THREE.CanvasTexture(this.pictureCanvas); tex.colorSpace = THREE.SRGBColorSpace;
    const ref = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.18), new THREE.MeshBasicMaterial({ map: tex }));
    ref.position.set(0, FRAME_Y + fh / 2 + 0.2, FRAME_Z - 0.01); this.root.add(ref);
    const refFrame = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.2), new THREE.MeshBasicMaterial({ color: 0x5a3a1e }));
    refFrame.position.set(0, FRAME_Y + fh / 2 + 0.2, FRAME_Z - 0.015); this.root.add(refFrame);

    // highlight helpers
    this.hlSlot = new THREE.Mesh(new THREE.PlaneGeometry(this.cell * 1.15, this.cell * 1.15), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.6, depthWrite: false }));
    this.hlPiece = this.hlSlot.clone(); this.hlPiece.material = this.hlSlot.material.clone();
    this.hlSlot.visible = this.hlPiece.visible = false;
    this.root.add(this.hlSlot, this.hlPiece);

    // pieces
    for (let r = 0; r < c.rows; r++) for (let col = 0; col < c.cols; col++) this._makePiece(col, r, false);
    this._scatter();

    this.ctx.hud.place(0, 2.85, -2.2, 1.0);
    this.ctx.hud.set({ title: 'JUNGLE JIGSAW', timer: '0.0', line: `0 / ${this.total}` });
  }

  // ---------- pieces ----------
  _faceTex(p, face) {
    if (!p.tex[face]) {
      const src = p.decoy ? p.pic : this.pictureCanvas;
      const t = new THREE.CanvasTexture(drawPiece(face, src, p.tabs, p.col, p.row, this.cfg.cols, this.cfg.rows));
      t.colorSpace = THREE.SRGBColorSpace; p.tex[face] = t;
    }
    return p.tex[face];
  }

  _makePiece(col, row, decoy) {
    const c = this.cfg, cell = this.cell;
    const p = { col, row, decoy, state: 'free', rot: 0, flipped: false, blankUntil: 0, tex: {}, face: '', bob: Math.random() * 6, tabs: this.tabs, pic: null,
      home: new THREE.Vector3((col - (c.cols - 1) / 2) * cell, FRAME_Y + ((c.rows - 1) / 2 - row) * cell, FRAME_Z), zBase: FRAME_Z, anim: null };
    if (decoy) {
      p.pic = makePicture(this.picIndex + 1 + Math.floor(this.srng() * (PICTURES.length - 1)));
      p.tabs = makeTabs(c.cols, c.rows, 555 + Math.floor(this.srng() * 999));
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cell * 1.5, cell * 1.5),
      new THREE.MeshBasicMaterial({ map: null, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }));
    p.mesh = mesh; this.root.add(mesh);
    this.pieces.push(p);
    this._applyFace(p);
    return p;
  }

  _applyFace(p) {
    const face = p.flipped ? 'back' : (p.blankUntil > this.t || (p.blankUntil === Infinity) ? 'blank' : 'img');
    if (face !== p.face) { p.face = face; p.mesh.material.map = this._faceTex(p, face); p.mesh.material.needsUpdate = true; }
    p.mesh.rotation.z = (p.rot * Math.PI) / 2;
  }

  _scatter() {
    const placedPts = [];
    const free = this.pieces.filter((p) => p.state === 'free');
    for (const p of free) this._place(p, placedPts);
  }

  _place(p, avoid = []) {
    for (let tries = 0; tries < 80; tries++) {
      const x = (this.srng() * 2 - 1) * 0.66;
      const y = 0.98 + this.srng() * 0.95;
      const inFrame = Math.abs(x) < this.cfg.cols * this.cell / 2 + 0.12 && y > FRAME_Y - this.cfg.rows * this.cell / 2 - 0.14 && y < FRAME_Y + this.cfg.rows * this.cell / 2 + 0.38;
      if (inFrame && tries < 70) continue;
      const near = this.pieces.some((q) => q !== p && q.state === 'free' && q.mesh.position.lengthSq() > 0 && Math.hypot(q.mesh.position.x - x, q.mesh.position.y - y) < this.cell * 1.15);
      if (near && tries < 60) continue;
      const z = FRAME_Z + 0.06 + 0.9 * x * x * 0.55;   // gentle curve toward the player at the sides (reachable)
      p.zBase = z + this.pieces.indexOf(p) * 0.0015;
      p.mesh.position.set(x, y, p.zBase);
      p.rot = 0;
      this._applyFace(p);
      return;
    }
  }

  _free() { return this.pieces.filter((p) => p.state === 'free' && !p.decoy); }
  _pick(list) { return list.length ? list[Math.floor(this.ctx.rng() * list.length)] : null; }

  // ---------- effects ----------
  act_blankPieces(def, st) {
    const cand = this._free().filter((p) => p.blankUntil <= this.t && p !== this.held?.piece).sort(() => this.ctx.rng() - 0.5).slice(0, this.cfg.blankCount);
    for (const p of cand) { p.blankUntil = this.t + (def.duration || this.cfg.blankSeconds); this._applyFace(p); }
  }
  act_scramblePiece() { const p = this._pick(this._free().filter((x) => x !== this.held?.piece)); if (p) { p.rot = 1 + Math.floor(this.ctx.rng() * 3); this._applyFace(p); } }
  act_flipPiece() { const p = this._pick(this._free().filter((x) => x !== this.held?.piece)); if (p) { p.flipped = true; this._applyFace(p); } }
  act_decoyPiece() {
    const p = this._makePiece(Math.floor(this.ctx.rng() * this.cfg.cols), Math.floor(this.ctx.rng() * this.cfg.rows), true);
    this._place(p);
  }
  act_highlightPiece(def) {
    const p = this._pick(this._free().filter((x) => x !== this.held?.piece));
    if (p) this.highlight = { piece: p, until: this.t + (def.duration || this.cfg.highlightSeconds) };
  }
  act_lockPiece() {
    const p = this._pick(this._free().filter((x) => x !== this.held?.piece));
    if (p) { p.rot = 0; p.flipped = false; p.blankUntil = 0; this._applyFace(p); this._snap(p, true); }
  }
  onEffectEnd(e) { /* blank pieces expire by timestamp */ }

  // ---------- interaction ----------
  _snapOk(p) {
    return !p.decoy && p.rot % 4 === 0 && !p.flipped && p.mesh.position.distanceTo(new THREE.Vector3(p.home.x, p.home.y, p.mesh.position.z)) < this.cfg.snapDistance;
  }

  _snap(p, animate) {
    p.state = 'placed'; p.blankUntil = 0; this._applyFace(p);
    p.anim = { from: p.mesh.position.clone(), to: new THREE.Vector3(p.home.x, p.home.y, FRAME_Z + 0.004 + this.placed * 0.0002), t: 0, dur: animate ? 0.5 : 0.12 };
    if (this.highlight?.piece === p) this.highlight = null;
    this.placed++;
    if (this.held?.piece === p) this.held = null;
    if (this.placed >= this.total) this.finish({ value: +this.t.toFixed(2), dnf: false, progress: this.placed });
  }

  _twist(p) {
    if (!p || p.state === 'placed') return;
    if (p.flipped) p.flipped = false; else p.rot = (p.rot + 1) % 4;
    this._applyFace(p);
  }

  _grab(p, hand) { p.state = 'held'; this.held = { piece: p, hand, dz: 0 }; }
  _release() {
    const h = this.held; if (!h) return;
    const p = h.piece; this.held = null; p.state = 'free';
    if (this._snapOk(p)) this._snap(p, false);
    else { p.mesh.position.z = clamp(p.mesh.position.z, FRAME_Z + 0.02, FRAME_Z + 0.5); p.zBase = p.mesh.position.z; }
  }

  _pieceAtMouse() {
    const ray = this.hands.mouseRay();
    let best = null, bd = Infinity;
    for (const p of this.pieces) {
      if (p.state === 'placed') continue;
      const z = p.mesh.position.z;
      const t = (z - ray.origin.z) / ray.direction.z;
      const hit = ray.at(t, new THREE.Vector3());
      const d = Math.hypot(hit.x - p.mesh.position.x, hit.y - p.mesh.position.y);
      const score = d - z * 0.05;            // prefer nearer/top pieces on ties
      if (d < this.cell * 0.6 && score < bd) { bd = score; best = { p, hit }; }
    }
    return best;
  }

  update(dt, now) {
    super.update(dt, now);
    const xr = this.stage.isXR;
    const frameZ = FRAME_Z + 0.07;

    if (this.running) {
      if (xr) this._updateXR();
      else this._updateMouse(frameZ);
      // expire blanks
      for (const p of this.pieces) if (p.state !== 'placed' && p.blankUntil && p.blankUntil !== Infinity && p.blankUntil <= this.t) { p.blankUntil = 0; this._applyFace(p); }
    }

    // gentle bobbing + placement animation
    for (const p of this.pieces) {
      if (p.state === 'free') p.mesh.position.y += Math.sin(now / 700 + p.bob) * 0.00025;
      if (p.anim) {
        p.anim.t += dt;
        const k = clamp(p.anim.t / p.anim.dur, 0, 1), e = 1 - (1 - k) * (1 - k);
        p.mesh.position.lerpVectors(p.anim.from, p.anim.to, e);
        if (k >= 1) p.anim = null;
      }
    }

    // highlight glow
    const hl = this.highlight;
    if (hl && (this.t >= hl.until || hl.piece.state === 'placed')) this.highlight = null;
    if (this.highlight) {
      const pulse = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(now / 160));
      this.hlPiece.visible = this.hlSlot.visible = true;
      this.hlPiece.material.opacity = this.hlSlot.material.opacity = pulse;
      this.hlPiece.position.copy(hl.piece.mesh.position); this.hlPiece.position.z -= 0.002;
      this.hlSlot.position.set(hl.piece.home.x, hl.piece.home.y, FRAME_Z + 0.001);
    } else this.hlPiece.visible = this.hlSlot.visible = false;

    this.ctx.hud.set({ timer: this.t.toFixed(1), line: `${this.placed} / ${this.total} placed` });
  }

  _updateMouse(frameZ) {
    const m = this.hands.mouse;
    if (m.justDown && !this.held) {
      const hit = this._pieceAtMouse();
      if (hit) { this._grab(hit.p, 'mouse'); this.held.off = new THREE.Vector2(hit.p.mesh.position.x - hit.hit.x, hit.p.mesh.position.y - hit.hit.y); }
    }
    const ray = this.hands.mouseRay();
    if (this.held) {
      const p = this.held.piece;
      const t = (frameZ - ray.origin.z) / ray.direction.z;
      const hit = ray.at(t, new THREE.Vector3());
      p.mesh.position.set(hit.x + this.held.off.x, hit.y + this.held.off.y, frameZ);
      if (m.justUp || !m.down) this._release();
    }
    if (this.hands.keysDown.has('r') || m.rightJustDown) {
      const target = this.held?.piece || this._pieceAtMouse()?.p;
      this._twist(target);
    }
  }

  _updateXR() {
    for (const side of ['left', 'right']) {
      const h = this.hands[side]; if (!h.connected) continue;
      if (h.triggerDown && !this.held) {
        let best = null, bd = 0.14;
        for (const p of this.pieces) { if (p.state === 'placed') continue; const d = p.mesh.position.distanceTo(h.pos); if (d < bd) { bd = d; best = p; } }
        if (best) this._grab(best, side);
      }
      if (this.held && this.held.hand === side) {
        this.held.piece.mesh.position.copy(h.pos);
        if (!h.trigger) this._release();
      }
      if (h.btnADown || h.btnBDown || h.gripDown) {
        let target = this.held?.hand === side ? this.held.piece : null;
        if (!target) { let bd = 0.16; for (const p of this.pieces) { if (p.state === 'placed') continue; const d = p.mesh.position.distanceTo(h.pos); if (d < bd) { bd = d; target = p; } } }
        this._twist(target);
      }
    }
  }
}
