// Challenge 2: Endurance - idol held overhead in one hand, ball balanced on a stick in the other.
// Out if the idol sags/slips away or the ball rolls off. Longest time wins.
import * as THREE from 'three';
import { Challenge } from './base.js';
import { mat, makeTotem } from '../world.js';
import { clamp, lerp } from '../../shared/util.js';
import { CHALLENGE_META } from '../../config/meta.js';

export class Endurance extends Challenge {
  static meta = CHALLENGE_META.endurance;

  setup(turn) {
    super.setup(turn);
    const c = this.cfg;
    this.stage.setLook(0, 1.6, -1);
    this.idolSide = 'right';                    // which hand holds the idol (the other holds the stick)
    this.readyPos = new THREE.Vector3(0, 1.0, -0.95);
    this.phase = [Math.random() * 6, Math.random() * 6, Math.random() * 6, Math.random() * 6];

    // --- idol ---
    this.idol = makeTotem(0.32, 0xb5662e);
    this.idolMat = this.idol.children[0].material.clone();
    this.idol.children[0].material = this.idolMat;
    this.root.add(this.idol);
    this.idolHand = new THREE.Vector3();          // virtual / real hand position (world-local)
    this.idolRef = new THREE.Vector3();
    this.droop = 0;
    this.shake = new THREE.Vector2();

    // --- stick + platform + ball ---
    this.stick = new THREE.Group();
    this.root.add(this.stick);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, c.stickLength, 6), mat(0x8a5a33));
    rod.position.y = c.stickLength / 2; this.stick.add(rod);
    this.platform = new THREE.Group(); this.platform.position.y = c.stickLength; this.stick.add(this.platform);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(c.platformRadius, c.platformRadius, 0.02, 12), mat(0xd9b97a));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(c.platformRadius, 0.008, 4, 16), mat(0x5a3a1e));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.01;
    this.platform.add(disc, ring);
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(c.ballRadius, 1), mat(0xe2452f));
    this.platform.add(this.ball);
    this.bp = new THREE.Vector2(0.03, 0.0);       // ball position on the platform
    this.bv = new THREE.Vector2();
    this.tilt = new THREE.Vector2();
    this.refAxis = new THREE.Vector3(0, 1, 0);
    this.platScale = 1;
    this.stickHandPos = new THREE.Vector3();
    this.prevStickPos = null; this.stickVel = new THREE.Vector3();
    this.releaseGrace = 0;

    // --- storm rain ---
    const n = 220, arr = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 6, y = Math.random() * 4, z = -Math.random() * 5 + 0.5;
      arr.set([x, y, z, x - 0.05, y - 0.3, z], i * 6);
    }
    this.rainGeo = new THREE.BufferGeometry(); this.rainGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.rain = new THREE.LineSegments(this.rainGeo, new THREE.LineBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.6 }));
    this.rain.frustumCulled = false; this.rain.visible = false; this.root.add(this.rain);
    this.flash = 0;

    // --- hand choice UI ---
    const mk = (side, x) => this.ui.addButton({
      text: `IDOL: ${side.toUpperCase()}`, sub: side === this.idolSide ? '✔ chosen' : 'tap to choose', pos: new THREE.Vector3(x, 1.38, -0.95), width: 0.5, height: 0.22,
      onSelect: () => { this.idolSide = side; this._refreshButtons(); this._placeStatic(); },
    });
    this.btnL = mk('left', -0.38); this.btnR = mk('right', 0.38);
    this._refreshButtons();

    this.ctx.hud.place(0, 2.35, -2.3, 1.0);
    this.ctx.hud.set({ title: 'IDOL ENDURANCE', timer: '0.0', line: 'Choose your idol hand' });
    this._placeStatic();
  }

  _refreshButtons() {
    this.ui.setText(this.btnL, 'IDOL: LEFT', this.idolSide === 'left' ? '✔ chosen' : 'tap to choose');
    this.ui.setText(this.btnR, 'IDOL: RIGHT', this.idolSide === 'right' ? '✔ chosen' : 'tap to choose');
  }

  get idolHandObj() { return this.hands[this.idolSide]; }
  get stickHandObj() { return this.hands[this.idolSide === 'left' ? 'right' : 'left']; }

  /** desktop / pre-start resting positions */
  _placeStatic() {
    const s = this.idolSide === 'left' ? -1 : 1;
    this.idolHand.set(s * 0.35, this.stage.headY + 0.5, -1.1);
    this.idolRef.copy(this.idolHand);
    this.stickHandPos.set(-s * 0.35, 1.0, -0.9);
  }

  start() {
    super.start();
    this._placeStatic();
    const xr = this.stage.isXR;
    if (xr) {
      const ih = this.idolHandObj, sh = this.stickHandObj;
      if (ih.connected) { this.idolHand.copy(ih.pos); this.idolRef.copy(ih.pos); }
      if (sh.connected) { this.refAxis.copy(sh.dir); this.prevStickPos = sh.pos.clone(); }
    }
    this.bp.set(0.02, 0); this.bv.set(0, 0);
    this.releaseGrace = 1.2;
    this.ctx.hud.set({ line: 'Idol up! Keep the ball on!' });
  }

  getProgress() { return this.warn ? '⚠ ' + this.warn : `Idol: ${this.idolSide} hand`; }

  // ---- effects ----
  onEffectStart(e) {
    if (e.def.mods?.storm) { this.rain.visible = true; this.flash = 0.5; }
  }
  onEffectEnd() { if (!this.hasMod('storm')) this.rain.visible = false; }

  update(dt, now) {
    super.update(dt, now);
    const c = this.cfg;
    const xr = this.stage.isXR;
    const running = this.running;
    const t = this.t;
    const ph = this.phase;

    // ---------- idol ----------
    const droopBase = Math.min(c.idolDroopMax, c.idolDroopPerSecond * t);
    const droopTarget = clamp(droopBase * this.mod('idolDroop'), 0, 0.6);
    this.droop = lerp(this.droop, running ? droopTarget : 0, 1 - Math.exp(-2.2 * dt));
    const amp = (c.idolShakeBase + c.idolShakeGrowth * t) * this.mod('idolShake');
    const sx = amp * (0.6 * Math.sin(1.7 * t + ph[0]) + 0.4 * Math.sin(3.1 * t + ph[1]));
    const sy = amp * 0.7 * (0.6 * Math.sin(2.3 * t + ph[2]) + 0.4 * Math.sin(4.3 * t + ph[3]));
    this.shake.set(running ? sx : 0, running ? sy : 0);

    const ih = this.idolHandObj;
    if (xr && ih.connected) this.idolHand.copy(ih.pos);
    else {
      const k = this.hands.keys, sp = c.desktopHandSpeed * dt;
      if (k.has('w') || k.has('arrowup')) this.idolHand.y += sp;
      if (k.has('s') || k.has('arrowdown')) this.idolHand.y -= sp;
      if (k.has('a') || k.has('arrowleft')) this.idolHand.x -= sp;
      if (k.has('d') || k.has('arrowright')) this.idolHand.x += sp;
      this.idolHand.y = clamp(this.idolHand.y, this.stage.headY + 0.0, this.stage.headY + 0.8);
      this.idolHand.x = clamp(this.idolHand.x, this.idolRef.x - 0.6, this.idolRef.x + 0.6);
    }
    const eff = new THREE.Vector3(this.idolHand.x + this.shake.x, this.idolHand.y - this.droop + this.shake.y, this.idolHand.z);
    this.idol.position.set(eff.x, eff.y + 0.0, eff.z);
    this.idol.rotation.z = this.shake.x * 1.5;

    const minY = this.stage.headY + c.idolOverheadMargin;
    const marginY = eff.y - minY;
    const marginX = c.idolSideTolerance - Math.abs(eff.x - this.idolRef.x);
    const margin = Math.min(marginY, marginX);
    this.warn = running && margin < 0.07 ? 'idol slipping!' : '';
    this.idolMat.color.setHex(running && margin < 0.07 ? (Math.floor(now / 120) % 2 ? 0xff3030 : 0xb5662e) : 0xb5662e);

    // ---------- stick + ball ----------
    this.platScale = lerp(this.platScale, this.mod('platformScale'), 1 - Math.exp(-4 * dt));
    this.platform.scale.set(this.platScale, 1, this.platScale);

    const sh = this.stickHandObj;
    const wob = (c.wobbleBase + c.wobbleGrowth * t) * this.mod('stickWobble');
    const wx = running ? wob * (0.6 * Math.sin(1.3 * t + ph[1]) + 0.4 * Math.sin(2.9 * t + ph[3])) : 0;
    const wz = running ? wob * (0.6 * Math.sin(1.1 * t + ph[2]) + 0.4 * Math.sin(3.3 * t + ph[0])) : 0;
    const q = new THREE.Quaternion();
    let handAcc = new THREE.Vector3();
    if (xr && sh.connected) {
      this.stickHandPos.copy(sh.pos);
      q.setFromUnitVectors(this.refAxis, sh.dir);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      this.tilt.set(up.x, up.z);
      if (this.prevStickPos && dt > 0) {
        const v = sh.pos.clone().sub(this.prevStickPos).divideScalar(dt);
        handAcc.copy(v).sub(this.stickVel).divideScalar(Math.max(dt, 1e-3));
        this.stickVel.copy(v);
      }
      this.prevStickPos = sh.pos.clone();
      handAcc.clampLength(0, 12);
    } else {
      const m = this.hands.mouse, mt = THREE.MathUtils.degToRad(c.maxTiltDeg);
      this.tilt.set(m.x * mt, -m.y * mt);
    }
    this.tilt.x += wx; this.tilt.y += wz;
    const tiltLen = this.tilt.length();
    const axis = new THREE.Vector3(this.tilt.x, 1, this.tilt.y).normalize();
    this.stick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    this.stick.position.copy(this.stickHandPos);

    if (running) {
      const slip = this.hasMod('ballSlip');
      const g = c.gravityScale * (slip ? 1.9 : 1);
      const damp = c.rollDamping * (slip ? 0.12 : 1);
      let ax = g * this.tilt.x, az = g * this.tilt.y;
      if (xr) { ax -= handAcc.x * c.inertiaScaleXR; az -= handAcc.z * c.inertiaScaleXR; }
      const storm = this.active.find((e) => e.def.mods?.storm);
      if (storm) { const w = (storm.def.params?.wind ?? 1) * (0.5 + 0.5 * Math.sin(t * 1.7)); ax += w * 2.2; az += w * 0.6 * Math.sin(t * 2.3); }
      this.bv.x += ax * dt; this.bv.y += az * dt;
      this.bv.multiplyScalar(Math.exp(-damp * dt));
      this.bp.addScaledVector(this.bv, dt);
      const R = c.platformRadius * this.platScale;
      if (this.bp.length() > R - c.ballRadius * 0.2) return this._out('BALL FELL!');
    }
    this.ball.position.set(this.bp.x, c.ballRadius + 0.01, this.bp.y);

    // ---------- storm visuals ----------
    if (this.rain.visible) {
      const p = this.rainGeo.attributes.position;
      for (let i = 0; i < p.count; i += 2) {
        const dy = dt * 7;
        p.setY(i, p.getY(i) - dy); p.setY(i + 1, p.getY(i + 1) - dy);
        if (p.getY(i + 1) < 0) { p.setY(i, 4 + 0.3); p.setY(i + 1, 4); }
      }
      p.needsUpdate = true;
      this.flash = Math.max(0, this.flash - dt);
    }
    if (this.hasMod('storm')) {
      this.stage.scene.background.setHex(0x5b6b7a); this.stage.scene.fog.color.setHex(0x5b6b7a);
      if (Math.random() < dt * 0.6) this.flash = 0.18;
      this.stage.hemi.intensity = 0.55 + (this.flash > 0 ? 1.6 : 0);
    } else if (this._stormApplied) { this._resetSky(); }
    this._stormApplied = this.hasMod('storm');

    // ---------- XR grip checks ----------
    if (running && xr) {
      this.releaseGrace -= dt;
      if (this.releaseGrace <= 0) {
        if (ih.connected && !ih.grip) { this._gripLost = (this._gripLost || 0) + dt; if (this._gripLost > 0.35) return this._out('IDOL DROPPED!'); }
        else if (sh.connected && !sh.grip) { this._gripLost = (this._gripLost || 0) + dt; if (this._gripLost > 0.35) return this._out('STICK DROPPED!'); }
        else this._gripLost = 0;
      }
      if (margin < 0) return this._out('IDOL DROPPED!');
    } else if (running && margin < 0) return this._out('IDOL DROPPED!');

    this.ctx.hud.set({ timer: this.t.toFixed(1), line: running ? (this.warn || 'Hold on!') : `Idol: ${this.idolSide.toUpperCase()} hand · stick: ${this.idolSide === 'left' ? 'RIGHT' : 'LEFT'}` });
  }

  _resetSky() {
    this.stage.scene.background.setHex(0x8fdcef); this.stage.scene.fog.color.setHex(0x8fdcef); this.stage.hemi.intensity = 1.15;
  }

  _out(reason) {
    this.ctx.say(reason, 'system');
    this._resetSky();
    this.finish({ value: +this.t.toFixed(2), dnf: false, reason });
  }

  timeUp() { this._resetSky(); super.timeUp(); }
  dispose() { this._resetSky(); super.dispose(); }
}
