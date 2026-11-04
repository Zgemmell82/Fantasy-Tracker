// Unified input: two XR controllers (positions in "world-local" space, i.e. relative to
// the stage's floor offset) plus a mouse/keyboard fallback for desktop testing.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _f = new THREE.Vector3(0, 0, -1);

class HandState {
  constructor(side) {
    this.side = side;
    this.connected = false;
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.dir = new THREE.Vector3(0, 0, -1);   // pointing direction (controller -Z)
    this.up = new THREE.Vector3(0, 1, 0);     // controller +Y (thumbstick side)
    this.vel = new THREE.Vector3();
    this.trigger = false; this.triggerDown = false; this.triggerUp = false;
    this.grip = false; this.gripDown = false; this.gripUp = false;
    this.btnA = false; this.btnADown = false; this.btnB = false; this.btnBDown = false;
    this._hist = [];
  }
  /** average velocity over the last `ms` milliseconds (good for throws) */
  velocityOver(ms = 90) {
    const h = this._hist;
    if (h.length < 2) return new THREE.Vector3();
    const last = h[h.length - 1];
    let first = h[0];
    for (let i = h.length - 1; i >= 0; i--) { first = h[i]; if (last.t - h[i].t >= ms) break; }
    const dt = (last.t - first.t) / 1000;
    return dt > 0 ? last.p.clone().sub(first.p).divideScalar(dt) : new THREE.Vector3();
  }
}

export class Hands {
  constructor(stage) {
    this.stage = stage;
    this.left = new HandState('left');
    this.right = new HandState('right');
    this.mouse = { x: 0, y: 0, down: false, justDown: false, justUp: false, rightDown: false, rightJustDown: false, inside: false };
    this.keys = new Set();
    this.keysDown = new Set();
    this._xr = [];
    this.originY = 0;           // floor offset of the stage group (so hand coords match content coords)
    const r = stage.renderer;

    for (let i = 0; i < 2; i++) {
      const ray = r.xr.getController(i);
      const grip = r.xr.getControllerGrip(i);
      const rec = { ray, grip, gamepad: null, side: null, prev: {} };
      ray.addEventListener('connected', (e) => {
        rec.side = e.data.handedness === 'left' ? 'left' : 'right';
        rec.gamepad = e.data.gamepad || null;
        this[rec.side].connected = true;
      });
      ray.addEventListener('disconnected', () => { if (rec.side) this[rec.side].connected = false; rec.side = null; rec.gamepad = null; });
      // low-poly controller body
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.14), new THREE.MeshLambertMaterial({ color: 0x6b4a2b, flatShading: true }));
      body.position.z = 0.02;
      grip.add(body);
      const laser = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 1.5), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
      laser.position.z = -0.75; laser.visible = false;
      ray.add(laser);
      rec.laser = laser;
      stage.scene.add(ray, grip);
      this._xr.push(rec);
    }

    const el = stage.renderer.domElement;
    el.addEventListener('pointermove', (e) => {
      const b = el.getBoundingClientRect();
      this.mouse.x = ((e.clientX - b.left) / b.width) * 2 - 1;
      this.mouse.y = -(((e.clientY - b.top) / b.height) * 2 - 1);
      this.mouse.inside = true;
    });
    el.addEventListener('pointerleave', () => { this.mouse.inside = false; });
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2) { this.mouse.rightDown = true; this.mouse.rightJustDown = true; }
      else { this.mouse.down = true; this.mouse.justDown = true; }
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    el.addEventListener('pointerup', (e) => {
      if (e.button === 2) this.mouse.rightDown = false;
      else { this.mouse.down = false; this.mouse.justUp = true; }
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.keysDown.add(k);
      this.keys.add(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get xrActive() { return this.stage.isXR; }
  hand(side) { return this[side]; }

  /** call once per frame BEFORE challenge.update */
  update(now) {
    for (const rec of this._xr) {
      if (!rec.side) continue;
      const h = this[rec.side];
      rec.grip.getWorldPosition(h.pos); h.pos.y -= this.originY;
      rec.ray.getWorldQuaternion(h.quat);
      h.dir.copy(_f).applyQuaternion(h.quat);
      h.up.set(0, 1, 0).applyQuaternion(h.quat);
      h._hist.push({ t: now, p: h.pos.clone() });
      while (h._hist.length > 12) h._hist.shift();
      const gp = rec.gamepad;
      const b = gp ? gp.buttons : [];
      const trig = !!b[0]?.pressed, grip = !!b[1]?.pressed, a = !!b[4]?.pressed, bb = !!b[5]?.pressed;
      h.triggerDown = trig && !h.trigger; h.triggerUp = !trig && h.trigger; h.trigger = trig;
      h.gripDown = grip && !h.grip; h.gripUp = !grip && h.grip; h.grip = grip;
      h.btnADown = a && !h.btnA; h.btnA = a;
      h.btnBDown = bb && !h.btnB; h.btnB = bb;
      h.vel.copy(h.velocityOver(60));
    }
  }

  /** call once per frame AFTER challenge.update to clear edge flags */
  endFrame() {
    this.mouse.justDown = false; this.mouse.justUp = false; this.mouse.rightJustDown = false;
    this.keysDown.clear();
    this.left.triggerDown = this.left.triggerUp = this.left.gripDown = this.left.gripUp = this.left.btnADown = this.left.btnBDown = false;
    this.right.triggerDown = this.right.triggerUp = this.right.gripDown = this.right.gripUp = this.right.btnADown = this.right.btnBDown = false;
  }

  /** world-space rays used by 3D buttons: mouse on desktop, controller rays in XR */
  pointerRays() {
    const out = [];
    if (this.stage.isXR) {
      for (const rec of this._xr) {
        if (!rec.side) continue;
        const o = new THREE.Vector3(); rec.ray.getWorldPosition(o);
        rec.ray.getWorldQuaternion(_q);
        out.push({ ray: new THREE.Ray(o, _f.clone().applyQuaternion(_q)), clicked: this[rec.side].triggerDown, id: rec.side });
      }
    } else if (this.mouse.inside) {
      const rc = new THREE.Raycaster();
      rc.setFromCamera(new THREE.Vector2(this.mouse.x, this.mouse.y), this.stage.camera);
      out.push({ ray: rc.ray.clone(), clicked: this.mouse.justDown, id: 'mouse' });
    }
    return out;
  }

  showLasers(on) { for (const rec of this._xr) rec.laser.visible = on; }

  /** mouse ray in world space (desktop) */
  mouseRay() {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(this.mouse.x, this.mouse.y), this.stage.camera);
    return rc.ray;
  }
}
