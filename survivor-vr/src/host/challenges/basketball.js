// Challenge 1: Basketball - 5 hoops at increasing range, any order, fastest time to sink all five.
import * as THREE from 'three';
import { Challenge } from './base.js';
import { mat, makeCrowdMember } from '../world.js';
import { clamp, lerp } from '../../shared/util.js';
import { CHALLENGE_META } from '../../config/meta.js';

const HOOP_COLORS = [0xff6b3d, 0xffc83d, 0x58d68d, 0x4aa8ff, 0xc77dff];

/** Launch velocity that carries a ball from `from` to `to` in a pleasant downward-entering arc. */
export function solveShot(from, to, g = 9.81) {
  const d = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
  const horiz = d.length();
  const T = 0.8 + 0.1 * horiz;
  const v = new THREE.Vector3(d.x / T, (to.y - from.y) / T + 0.5 * g * T, d.z / T);
  return v;
}

function numberTexture(n, color) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#3a2412'; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118);
  g.fillStyle = '#fff6df'; g.font = 'bold 84px Trebuchet MS, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Basketball extends Challenge {
  static meta = CHALLENGE_META.basketball;

  setup(turn) {
    super.setup(turn);
    const c = this.cfg;
    this.stage.setLook(0, 2.6, -6);
    this.hoops = c.hoops.map((h, i) => this._buildHoop(h, i));
    this.sunk = 0;
    this.shots = 0;
    this.ballStart = new THREE.Vector3(0.0, 1.15, -0.55);

    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(c.ballRadius, 1), mat(0xe8742a));
    const seam = new THREE.Mesh(new THREE.TorusGeometry(c.ballRadius * 1.002, 0.008, 4, 10), mat(0x2b1606));
    this.ball.add(seam);
    this.root.add(this.ball);
    this.ballState = 'held';        // held | grabbed | flying | respawn
    this.ballVel = new THREE.Vector3();
    this.respawnAt = 0;
    this.ball.position.copy(this.ballStart);
    this.grabHand = null;
    this.charge = 0; this.charging = false;

    // aim reticle + power bar (desktop)
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.075, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 }));
    this.reticle.renderOrder = 10;
    this.root.add(this.reticle);
    this.powerBar = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.07), new THREE.MeshBasicMaterial({ color: 0x1d140c, depthTest: false }));
    this.powerFill = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.04), new THREE.MeshBasicMaterial({ color: 0xffcc4d, depthTest: false }));
    this.powerFill.position.z = 0.001; this.powerFill.geometry.translate(0.29, 0, 0); this.powerFill.position.x = -0.29;
    bg.renderOrder = 11; this.powerFill.renderOrder = 12;
    this.powerBar.add(bg, this.powerFill);
    this.powerBar.position.set(0, 0.62, -1.2);
    this.root.add(this.powerBar);
    this.powerBar.visible = false;

    // aim assist preview arc
    const pts = new Float32Array(40 * 3);
    this.arcGeo = new THREE.BufferGeometry(); this.arcGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.arc = new THREE.Line(this.arcGeo, new THREE.LineBasicMaterial({ color: 0xfff2a0 }));
    this.arc.frustumCulled = false; this.arc.visible = false;
    this.root.add(this.arc);

    this.crowd = [];
    this.ctx.hud.place(0, 5.0, -10.5, 3.0);
    this.ctx.hud.set({ title: 'TIKI HOOPS', timer: '0.0', line: '0 / 5 hoops' });
  }

  _buildHoop(h, i) {
    const c = this.cfg;
    const a = THREE.MathUtils.degToRad(h.angle);
    const dir = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));       // player -> hoop
    const side = new THREE.Vector3(dir.z * -1, 0, dir.x);               // perpendicular (sideways)
    const base = dir.clone().multiplyScalar(h.dist);
    const group = new THREE.Group();
    group.position.copy(base);
    group.rotation.y = -a;           // local -Z points back at the player's side
    this.root.add(group);

    const color = HOOP_COLORS[i % 5];
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, c.rimHeight + 0.5, 6), mat(0x7b5230));
    pole.position.set(0, (c.rimHeight + 0.5) / 2, -0.75); group.add(pole);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 0.06), [mat(0xd9b97a), mat(0xd9b97a), mat(0xd9b97a), mat(0xd9b97a), new THREE.MeshBasicMaterial({ map: numberTexture(i + 1, color) }), mat(0xd9b97a)]);
    board.position.set(0, c.rimHeight + 0.35, -0.55); group.add(board);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.3), mat(0x7b5230));
    arm.position.set(0, c.rimHeight - 0.02, -0.4); group.add(arm);

    const rim = new THREE.Group();
    rim.position.set(0, c.rimHeight, 0);
    const torus = new THREE.Mesh(new THREE.TorusGeometry(c.rimRadius, 0.035, 5, 14), new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: 0x000000 }));
    torus.rotation.x = Math.PI / 2; rim.add(torus);
    const net = new THREE.Mesh(new THREE.CylinderGeometry(c.rimRadius, c.rimRadius * 0.55, 0.38, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.8 }));
    net.position.y = -0.2; rim.add(net);
    group.add(rim);

    return { i, base, dir, side, group, rim, torus, board, sunk: false, offset: 0, target: 0, fx: 0, color,
      worldPos: new THREE.Vector3(), prevBall: null, flash: 0, backNormal: new THREE.Vector3() };
  }

  // ---------- helpers ----------
  rimRadius() { return this.cfg.rimRadius * this.mod('rimScale'); }
  hoopCenter(h, out = new THREE.Vector3()) {
    out.copy(h.base).addScaledVector(h.side, h.offset); out.y = this.cfg.rimHeight; return out;
  }
  elapsed() { return Math.max(0.0, this.t - this.timeAdjust); }
  getTimer() { return { label: 'TIME', value: this.elapsed(), mode: 'up' }; }
  getProgress() { return `${this.sunk} / ${this.hoops.length} hoops`; }

  // ---------- effects ----------
  act_shaveSeconds(def, st, a) { this.timeAdjust += a.seconds; }
  act_moveHoops(def, st, a) {
    const open = this.hoops.filter((h) => !h.sunk);
    const picks = open.sort(() => this.ctx.rng() - 0.5).slice(0, a.count);
    st.hoops = picks;
    for (const h of picks) h.target = (this.ctx.rng() < 0.5 ? -1 : 1) * (a.range * (0.6 + 0.4 * this.ctx.rng()));
  }
  endAct_moveHoops(def, st) { for (const h of st.hoops || []) h.target = 0; }
  act_crowdBlock(def, st, a) {
    const colors = [0xd24e3a, 0x3a86c8, 0x4caf6a, 0xe0a030, 0x9a55c4];
    st.members = [];
    for (let i = 0; i < a.count; i++) {
      const m = makeCrowdMember(colors[i % colors.length]);
      const x = (i - (a.count - 1) / 2) * 0.85 + (this.ctx.rng() - 0.5) * 0.2;
      m.position.set(x, -2, -2.4 - this.ctx.rng() * 0.5);
      m.userData.targetY = 0.0 + this.ctx.rng() * 0.2;
      m.userData.raise = 1.0 + this.ctx.rng() * 0.4;        // taller = blocks more view
      m.scale.setScalar(1.0 + this.ctx.rng() * 0.25);
      this.root.add(m); this.crowd.push(m); st.members.push(m);
    }
  }
  endAct_crowdBlock(def, st) { for (const m of st.members || []) m.userData.leaving = true; }

  // ---------- main loop ----------
  update(dt, now) {
    super.update(dt, now);
    const c = this.cfg;
    const xr = this.stage.isXR;

    // hoops: animate lateral offset + rim scale + flash
    for (const h of this.hoops) {
      h.offset = lerp(h.offset, h.target, 1 - Math.exp(-3 * dt));
      h.group.position.copy(h.base).addScaledVector(h.side, h.offset);
      const s = this.rimRadius() / c.rimRadius;
      h.rim.scale.set(s, 1, s);
      if (h.flash > 0) { h.flash -= dt; h.torus.material.emissive.setHex(h.flash > 0 ? 0xffffff : 0x000000); }
    }
    for (let i = this.crowd.length - 1; i >= 0; i--) {
      const m = this.crowd[i];
      if (m.userData.leaving) {
        m.position.y -= dt * 3;
        if (m.position.y < -2.2) { this.root.remove(m); this.crowd.splice(i, 1); }
      } else m.position.y = lerp(m.position.y, m.userData.targetY, 1 - Math.exp(-5 * dt));
    }

    if (this.running) this._handleBall(dt, now, xr);
    else { this.ball.position.copy(this.ballStart); this.reticle.visible = false; this.powerBar.visible = false; this.arc.visible = false; }

    const el = this.elapsed();
    this.ctx.hud.set({ timer: el.toFixed(1), line: `${this.sunk} / ${this.hoops.length} hoops` });
  }

  _handleBall(dt, now, xr) {
    const c = this.cfg;
    const D = c.desktop;
    this.reticle.visible = false;
    this.powerBar.visible = false;
    this.arc.visible = false;

    if (this.ballState === 'respawn') {
      if (this.t >= this.respawnAt) { this.ballState = 'held'; this.ball.position.copy(this.ballStart); this.ballVel.set(0, 0, 0); }
      else { this.ball.visible = false; return; }
    }
    this.ball.visible = true;

    if (this.ballState === 'held') {
      this.ball.position.copy(this.ballStart);
      this.ball.position.y += Math.sin(now / 400) * 0.01;
      if (xr) {
        for (const side of ['left', 'right']) {
          const h = this.hands[side];
          if (h.connected && h.triggerDown && h.pos.distanceTo(this.ball.position) < 0.45) {
            this.ballState = 'grabbed'; this.grabHand = h; break;
          }
        }
      } else {
        // desktop: aim with the mouse, hold to charge, release to throw
        const ray = this.hands.mouseRay();
        const aimPt = ray.at(5, new THREE.Vector3());
        this.reticle.visible = true;
        this.reticle.position.copy(ray.at(3, new THREE.Vector3()));
        this.reticle.lookAt(this.stage.camera.position);
        if (this.hands.mouse.justDown) { this.charging = true; this.charge = 0; }
        if (this.charging) {
          this.charge = Math.min(1, this.charge + dt / D.chargeTime);
          this.powerBar.visible = true;
          this.powerFill.scale.x = Math.max(0.001, this.charge);
          this.powerFill.material.color.setHex(this.charge > 0.85 ? 0xff7043 : 0xffcc4d);
        }
        const v = this._desktopVelocity(ray, this.charge);
        if (this.hasMod('aimAssist')) this._showArc(this._assist(v));
        if (this.charging && this.hands.mouse.justUp) {
          this.charging = false;
          if (this.charge > 0.05) this._launch(v);
        }
      }
    } else if (this.ballState === 'grabbed') {
      const h = this.grabHand;
      this.ball.position.copy(h.pos);
      if (h.triggerUp || !h.trigger) {
        const v = h.velocityOver(90).multiplyScalar(c.throwScaleXR);
        this._launch(v);
      }
      if (this.hasMod('aimAssist')) this._showArc(this._assist(h.velocityOver(90).multiplyScalar(c.throwScaleXR)));
    } else if (this.ballState === 'flying') {
      this._flyBall(dt);
    }
  }

  _desktopVelocity(ray, charge) {
    const D = this.cfg.desktop;
    const dir = ray.direction.clone();
    // tilt the aim ray upward by a fixed elevation: aiming "at" a hoop produces a lob
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    dir.applyAxisAngle(right, THREE.MathUtils.degToRad(D.elevationDeg));
    const speed = lerp(D.minSpeed, D.maxSpeed, Math.max(0.0, charge));
    return dir.multiplyScalar(speed);
  }

  _assist(v) {
    // blend toward a perfect shot at the unsunk hoop closest (in angle) to the current throw direction
    const flat = Math.atan2(v.x, -v.z);
    let best = null, bd = 1e9;
    const p = this.ball.position;
    for (const h of this.hoops) {
      if (h.sunk) continue;
      const c = this.hoopCenter(h);
      const ang = Math.atan2(c.x - p.x, -(c.z - p.z));
      const d = Math.abs(ang - flat);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best || bd > 0.5) return v;
    const ideal = solveShot(p, best, this.cfg.gravity);
    return v.clone().lerp(ideal, this.cfg.aimAssistStrength);
  }

  _showArc(v) {
    const pos = this.arcGeo.attributes.position;
    const p = this.ball.position.clone(), vv = v.clone();
    for (let i = 0; i < 40; i++) {
      pos.setXYZ(i, p.x, p.y, p.z);
      vv.y -= this.cfg.gravity * 0.04; p.addScaledVector(vv, 0.04);
    }
    pos.needsUpdate = true; this.arc.visible = true;
  }

  _launch(v) {
    if (this.hasMod('aimAssist')) v = this._assist(v);
    this.ballVel.copy(v);
    this.ballState = 'flying';
    this.shots++;
    this.flyDeadline = this.t + 3.5;
    this.despawnAt = Infinity;
  }

  _flyBall(dt) {
    const c = this.cfg;
    const sub = 3, sdt = dt / sub;
    const p = this.ball.position, v = this.ballVel;
    const wind = this.hasMod('wind') ? this._windStrength() : 0;
    for (let s = 0; s < sub; s++) {
      const prev = p.clone();
      v.y -= c.gravity * sdt;
      v.x += wind * sdt;
      p.addScaledVector(v, sdt);

      // ground
      if (p.y < c.ballRadius) {
        p.y = c.ballRadius;
        if (this.despawnAt === Infinity) this.despawnAt = this.t + 0.7;
        if (Math.abs(v.y) > 0.8) v.y = -v.y * c.bounce; else v.y = 0;
        v.x *= 0.85; v.z *= 0.85;
      }
      for (const h of this.hoops) this._collideHoop(h, p, prev, v);
      if (Math.abs(p.x) > 40 || p.z < -40 || p.z > 6) { this._despawn(); return; }
    }
    this.ball.rotation.x += v.length() * dt; this.ball.rotation.z += dt * 2;
    if (this.t >= Math.min(this.despawnAt, this.flyDeadline)) this._despawn();
  }

  _windStrength() {
    const e = this.active.find((x) => x.def.mods && x.def.mods.wind);
    return (e?.def.params?.strength || 3) * Math.sin(this.t * 2.2) * 0.4 + (e?.def.params?.strength || 3) * 0.75;
  }

  _despawn() { this.ballState = 'respawn'; this.ball.visible = false; this.respawnAt = this.t + this.cfg.respawnDelay; }

  _collideHoop(h, p, prev, v) {
    const c = this.cfg;
    const centre = this.hoopCenter(h, h.worldPos);
    const R = this.rimRadius(), tube = 0.035, br = c.ballRadius;

    // backboard (a plane facing the player, just behind the rim)
    const bz = new THREE.Vector3().copy(h.dir).multiplyScalar(0.55);   // behind the rim, away from player
    const boardC = centre.clone().add(bz);
    const toBoardPrev = prev.clone().sub(boardC).dot(h.dir);
    const toBoardNow = p.clone().sub(boardC).dot(h.dir);
    if (toBoardPrev < br && toBoardNow >= br - 0.02 && p.y > centre.y - 0.2 && p.y < centre.y + 1.0) {
      const lat = p.clone().sub(boardC).dot(h.side);
      if (Math.abs(lat) < 0.7) {
        const vn = v.dot(h.dir);
        if (vn > 0) { v.addScaledVector(h.dir, -(1 + 0.55) * vn); p.addScaledVector(h.dir, -(toBoardNow - br + 0.02)); }
      }
    }

    // rim ring collision (sphere vs circle)
    const dx = p.x - centre.x, dz = p.z - centre.z;
    const d = Math.hypot(dx, dz) || 1e-6;
    const q = new THREE.Vector3(centre.x + (dx / d) * R, centre.y, centre.z + (dz / d) * R);
    const n = p.clone().sub(q);
    const dist = n.length();
    if (dist < br + tube && dist > 1e-5) {
      n.divideScalar(dist);
      const vn = v.dot(n);
      if (vn < 0) v.addScaledVector(n, -(1 + 0.5) * vn);
      p.copy(q).addScaledVector(n, br + tube + 0.001);
    }

    // score: centre crosses the rim plane going down, inside the ring
    if (!h.sunk && prev.y >= centre.y && p.y < centre.y && v.y < 0) {
      const f = (prev.y - centre.y) / Math.max(1e-6, prev.y - p.y);
      const cx = lerp(prev.x, p.x, f), cz = lerp(prev.z, p.z, f);
      if (Math.hypot(cx - centre.x, cz - centre.z) < R - 0.01) this._score(h);
    }
    // net drag for any ball passing through
    if (prev.y >= centre.y - 0.05 && p.y < centre.y - 0.05 && Math.hypot(p.x - centre.x, p.z - centre.z) < R) {
      v.x *= 0.35; v.z *= 0.35; v.y *= 0.7;
    }
  }

  _score(h) {
    h.sunk = true; h.flash = 0.6;
    h.torus.material.color.setHex(0x4cd964);
    h.target = 0;
    this.sunk++;
    this.despawnAt = Math.min(this.despawnAt, this.t + 0.7);
    this.ctx.say(`Hoop ${h.i + 1} sunk! (${this.sunk}/${this.hoops.length})`, 'system');
    if (this.sunk >= this.hoops.length) {
      this.finish({ value: Math.max(0.5, this.elapsed()), dnf: false, progress: this.sunk });
    }
  }

  timeUp() {
    this.finish({ value: this.cfg.timeLimit, dnf: true, progress: this.sunk, progressText: `${this.sunk}/${this.hoops.length}` });
  }
}
