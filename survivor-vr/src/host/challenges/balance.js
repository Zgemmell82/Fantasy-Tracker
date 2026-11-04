// Challenge 4: Balance - hold a tray; a new block lands on the stack every few seconds.
// Longest time before any block falls off wins. Real rigid-body physics (cannon-es).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Challenge } from './base.js';
import { mat } from '../world.js';
import { clamp, lerp } from '../../shared/util.js';
import { CHALLENGE_META } from '../../config/meta.js';

const COLORS = [0xe2452f, 0xf2b134, 0x3fbf7f, 0x3aa3d9, 0xb06ad6, 0xec7fb4, 0xff8a2b];

export class Balance extends Challenge {
  static meta = CHALLENGE_META.balance;

  setup(turn) {
    super.setup(turn);
    const c = this.cfg;
    this.stage.setLook(0, 1.45, -0.8);
    this.readyPos = new THREE.Vector3(0.0, 0.8, -0.8);
    this.base = new THREE.Vector3(0, 1.05, -0.7);       // tray rest position (desktop)
    this.phaseN = [Math.random() * 6, Math.random() * 6, Math.random() * 6, Math.random() * 6];
    this.trayHand = 'right';

    // physics
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.solver.iterations = 14;
    this.world.allowSleep = false;
    this.mTray = new CANNON.Material('tray');
    this.mBlock = new CANNON.Material('block');
    this.mSlip = new CANNON.Material('slip');
    const cm = (a, b, f) => { const x = new CANNON.ContactMaterial(a, b, { friction: f, restitution: 0.0 }); this.world.addContactMaterial(x); return x; };
    this.cTrayBlock = cm(this.mTray, this.mBlock, c.friction);
    this.cBlockBlock = cm(this.mBlock, this.mBlock, c.friction);
    this.cTraySlip = cm(this.mTray, this.mSlip, c.slipperyFriction);
    this.cBlockSlip = cm(this.mBlock, this.mSlip, c.slipperyFriction);
    this.cSlipSlip = cm(this.mSlip, this.mSlip, c.slipperyFriction);

    const half = c.trayHalf;
    this.trayBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: this.mTray });
    this.trayBody.addShape(new CANNON.Box(new CANNON.Vec3(half, 0.02, half)));
    this.trayBody.position.set(this.base.x, this.base.y, this.base.z);
    this.world.addBody(this.trayBody);

    // visuals
    this.tray = new THREE.Group();
    const plank = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.04, half * 2), mat(0xb0823f));
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(half * 1.6, 0.045, half * 1.6), mat(0xd9b97a));
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.16), mat(0x7b5230));
    handle.position.set(0, -0.03, half + 0.05);
    this.tray.add(plank, inlay, handle);
    this.stickyGlow = new THREE.Mesh(new THREE.BoxGeometry(half * 2.02, 0.05, half * 2.02), new THREE.MeshBasicMaterial({ color: 0xffdf5a, transparent: true, opacity: 0.0 }));
    this.tray.add(this.stickyGlow);
    this.root.add(this.tray);
    this.tray.position.copy(this.base);

    this.blocks = [];
    this.nextDrop = c.firstDrop;
    this.dropInterval = c.dropInterval;
    this.nextBlock = { scale: 1, slippery: false };
    this.gust = null;
    this.trayQ = new THREE.Quaternion();
    this.trayP = this.base.clone();
    this.refUp = new THREE.Vector3(0, 1, 0);
    this.prevHandOk = false;
    this.lastColor = 0;

    this.ctx.hud.place(0, 1.95, -2.2, 0.9);
    this.ctx.hud.set({ title: 'TRAY BALANCE', timer: '0.0', line: 'Keep the stack on the tray!' });
  }

  getProgress() { return `${this.blocks.length} blocks`; }

  // ---------- effects ----------
  act_nextBlock(def, st, a) {
    if (a.scale) this.nextBlock.scale = a.scale;
    if (a.slippery) this.nextBlock.slippery = true;
  }
  act_gust(def, st, a) {
    const ang = this.ctx.rng() * Math.PI * 2;
    this.gust = { until: this.t + a.seconds, force: a.force, dir: new THREE.Vector3(Math.cos(ang), 0.1, Math.sin(ang)), total: a.seconds };
  }

  _spawnBlock() {
    const c = this.cfg;
    const [lo, hi] = c.blockSize;
    const s = this.nextBlock.scale, slip = this.nextBlock.slippery;
    this.nextBlock = { scale: 1, slippery: false };
    const w = (lo + (hi - lo) * this.ctx.rng()) * s, h = (lo + (hi - lo) * this.ctx.rng()) * s * 0.55, d = (lo + (hi - lo) * this.ctx.rng()) * s;
    const vol = (w * h * d) / Math.pow((lo + hi) / 2, 3);
    const body = new CANNON.Body({ mass: c.blockMass * vol, material: slip ? this.mSlip : this.mBlock, linearDamping: 0.15, angularDamping: 0.6 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
    const jitter = () => (this.ctx.rng() - 0.5) * 0.012;
    const top = this._topBlock();
    const local = new THREE.Vector3(top.x + jitter(), top.y + 0.04 + h / 2, top.z + jitter()).applyQuaternion(this.trayQ);
    body.position.set(this.trayP.x + local.x, this.trayP.y + local.y, this.trayP.z + local.z);
    body.quaternion.setFromEuler(0, (this.ctx.rng() - 0.5) * 0.7, 0);
    this.world.addBody(body);
    const color = slip ? 0xcfeaff : COLORS[this.lastColor++ % COLORS.length];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    if (slip) mesh.material = new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: 0x335566 });
    this.root.add(mesh);
    this.blocks.push({ body, mesh, slip });
    this.ctx.say(s > 1.2 ? 'A giant block drops!' : s < 0.8 ? 'A tiny block drops.' : slip ? 'A slick block drops!' : 'New block!', 'system');
  }

  /** tray-local position of the highest block (so new blocks land on top of the stack) */
  _topBlock() {
    let best = { x: 0, y: 0.05, z: 0 };
    for (const b of this.blocks) {
      const l = new THREE.Vector3(b.body.position.x - this.trayP.x, b.body.position.y - this.trayP.y, b.body.position.z - this.trayP.z).applyQuaternion(this.trayQ.clone().invert());
      if (Math.hypot(l.x, l.z) < 0.12 && l.y + 0.05 > best.y) best = { x: l.x * 0.5, y: l.y + 0.05, z: l.z * 0.5 };
    }
    best.y = Math.min(best.y, 1.5);
    return best;
  }

  // ---------- tray pose ----------
  _computeTray(dt) {
    const c = this.cfg, t = this.t, ph = this.phaseN, xr = this.stage.isXR;
    const running = this.running;
    // fatigue: slow positional drift + a little tilt noise; both grow with time
    const driftAmp = running ? Math.min(0.12, 0.012 + 0.0016 * t) : 0;
    const dx = driftAmp * (0.6 * Math.sin(0.55 * t + ph[0]) + 0.4 * Math.sin(1.1 * t + ph[1]));
    const dz = driftAmp * 0.6 * (0.6 * Math.sin(0.5 * t + ph[2]) + 0.4 * Math.sin(1.3 * t + ph[3]));
    const tiltN = running ? Math.min(c.fatigueTiltMax, c.fatigueTiltBase + c.fatigueTiltGrowth * t) : 0;
    const tx = tiltN * Math.sin(0.9 * t + ph[1]), tz = tiltN * Math.sin(0.7 * t + ph[2]);

    const q = new THREE.Quaternion();
    const pos = this.base.clone();
    const side = this.trayHand;
    const h = this.hands[side];
    if (xr && h.connected) {
      pos.copy(h.pos); pos.addScaledVector(new THREE.Vector3(h.dir.x, 0, h.dir.z).normalize(), 0.14); pos.y += 0.03;
      q.setFromUnitVectors(this.refUp, h.up);
    } else {
      const m = this.hands.mouse, mt = THREE.MathUtils.degToRad(c.desktopMaxTiltDeg);
      q.setFromEuler(new THREE.Euler(-m.y * mt * 0.8, 0, -m.x * mt));
    }
    const wob = new THREE.Quaternion().setFromEuler(new THREE.Euler(tx, 0, tz));
    q.multiply(wob);
    pos.x += dx; pos.z += dz;
    return { pos, q };
  }

  start() {
    super.start();
    if (this.stage.isXR) {
      // whichever controller is gripping/triggering becomes the tray hand
      const R = this.hands.right, L = this.hands.left;
      this.trayHand = (L.connected && (L.grip || L.trigger) && !(R.grip || R.trigger)) ? 'left' : 'right';
      const h = this.hands[this.trayHand];
      if (h.connected) this.refUp.copy(h.up);
    }
    this.ctx.hud.set({ line: 'Hold steady!' });
  }

  update(dt, now) {
    super.update(dt, now);
    const c = this.cfg;
    const { pos, q } = this._computeTray(dt);
    // smooth a touch so mouse jumps don't launch blocks
    this.trayP.lerp(pos, 1 - Math.exp(-18 * dt));
    this.trayQ.slerp(q, 1 - Math.exp(-18 * dt));
    this.tray.position.copy(this.trayP); this.tray.quaternion.copy(this.trayQ);

    if (this.running) {
      const scale = this.mod('timeScale');
      const simDt = dt * scale;
      // kinematic tray: drive velocity toward target pose so friction/inertia work
      const b = this.trayBody;
      const inv = 1 / Math.max(dt, 1e-4);
      b.velocity.set((this.trayP.x - b.position.x) * inv, (this.trayP.y - b.position.y) * inv, (this.trayP.z - b.position.z) * inv);
      const cur = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      const dq = this.trayQ.clone().multiply(cur.invert());
      if (dq.w < 0) { dq.x *= -1; dq.y *= -1; dq.z *= -1; dq.w *= -1; }
      const ang = 2 * Math.acos(clamp(dq.w, -1, 1));
      const s = Math.sqrt(Math.max(1e-9, 1 - dq.w * dq.w));
      const w = ang > 2e-3 ? ang * inv : 0;
      b.angularVelocity.set((dq.x / s) * w, (dq.y / s) * w, (dq.z / s) * w);

      // sticky tray: raise contact friction while the effect is active
      const grip = this.mod('trayGrip');
      this.cTrayBlock.friction = c.friction * grip;
      this.cBlockBlock.friction = c.friction * (1 + (grip - 1) * 0.3);
      this.stickyGlow.material.opacity = grip > 1 ? 0.25 + 0.1 * Math.sin(now / 150) : 0;

      // wind gust
      if (this.gust) {
        if (this.t >= this.gust.until) this.gust = null;
        else {
          const k = Math.sin(((this.gust.until - this.t) / this.gust.total) * Math.PI);
          for (const bl of this.blocks) bl.body.applyForce(new CANNON.Vec3(this.gust.dir.x * this.gust.force * k * bl.body.mass, this.gust.dir.y * 0, this.gust.dir.z * this.gust.force * k * bl.body.mass));
        }
      }

      // block schedule (runs on slowed time too)
      this.nextDrop -= simDt;
      if (this.nextDrop <= 0) {
        this._spawnBlock();
        this.dropInterval = Math.max(c.dropIntervalMin, this.dropInterval - c.dropIntervalDecay * this.dropInterval);
        this.nextDrop = this.dropInterval;
      }
      this.world.step(1 / 60, simDt, 5);
      b.position.set(this.trayP.x, this.trayP.y, this.trayP.z);
      b.quaternion.set(this.trayQ.x, this.trayQ.y, this.trayQ.z, this.trayQ.w);
    }

    for (const bl of this.blocks) { bl.mesh.position.copy(bl.body.position); bl.mesh.quaternion.copy(bl.body.quaternion); }

    // failure: a block drops below the tray
    if (this.running) {
      for (const bl of this.blocks) {
        if (bl.body.position.y < this.trayP.y - c.fallBelow) {
          this.ctx.say('A block fell! Stack collapsed.', 'system');
          return this.finish({ value: +this.t.toFixed(2), dnf: false, blocks: this.blocks.length });
        }
      }
    }
    this.ctx.hud.set({ timer: this.t.toFixed(1), line: this.running ? `${this.blocks.length} blocks stacked` : 'Hold the tray level' });
  }

  dispose() {
    for (const b of [...this.world.bodies]) this.world.removeBody(b);
    super.dispose();
  }
}
