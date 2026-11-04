// Renderer / camera / XR session / TV-mirror capture.
import * as THREE from 'three';
import { GAME } from '../config/game.js';

export class Stage {
  constructor(container) {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    try { r.xr.setFoveation(1); } catch { /* older three */ }
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fdcef);
    this.scene.fog = new THREE.Fog(0x8fdcef, 28, 85);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xcdb07a, 1.15);
    this.sun = new THREE.DirectionalLight(0xfff1d0, 1.1);
    this.sun.position.set(-4, 9, 3);
    this.scene.add(this.hemi, this.sun);

    this.camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.05, 150);
    this.camera.position.set(0, 1.6, 0);
    this.lookTarget = new THREE.Vector3(0, 1.5, -3);
    this.camera.lookAt(this.lookTarget);

    // world = everything that must be offset so a seated player's eyes sit at design height
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.content = new THREE.Group();   // swapped per challenge
    this.world.add(this.content);

    this.designEyeHeight = 1.6;
    this.headY = 1.6;
    this.frameCbs = [];
    this.session = null;

    // TV mirror
    const mw = GAME.tv.mirrorWidth, mh = GAME.tv.mirrorHeight;
    this.mirrorRT = new THREE.WebGLRenderTarget(mw, mh, { colorSpace: THREE.SRGBColorSpace });
    this.mirrorCam = new THREE.PerspectiveCamera(60, mw / mh, 0.05, 150);
    this.mirrorBuf = new Uint8Array(mw * mh * 4);
    this._mirrorCanvas = document.createElement('canvas');
    this._mirrorCanvas.width = mw; this._mirrorCanvas.height = mh;
    this._mirrorTmp = document.createElement('canvas');
    this._mirrorTmp.width = mw; this._mirrorTmp.height = mh;
    this._lastMirror = 0;
    this.onMirror = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get isXR() { return this.renderer.xr.isPresenting; }

  resize() {
    if (this.isXR) return;
    const el = this.renderer.domElement.parentElement;
    const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setLook(x, y, z) {
    this.lookTarget.set(x, y, z);
    if (!this.isXR) this.camera.lookAt(this.lookTarget);
  }

  /** shift the world so the player's real head height matches the design eye height */
  calibrateHeight() {
    if (this.isXR) {
      const p = new THREE.Vector3();
      this.renderer.xr.getCamera().getWorldPosition(p);
      this.headY = THREE.MathUtils.clamp(p.y, 0.8, 2.1);
    } else this.headY = this.designEyeHeight;
    this.world.position.y = this.headY - this.designEyeHeight;
    return this.world.position.y;
  }

  async xrSupported() {
    return !!(navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)));
  }

  async enterVR() {
    if (this.session) { await this.session.end(); return; }
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    this.session = session;
    session.addEventListener('end', () => { this.session = null; this.resize(); this.camera.position.set(0, 1.6, 0); this.camera.lookAt(this.lookTarget); this.onXRChange?.(false); });
    await this.renderer.xr.setSession(session);
    this.onXRChange?.(true);
  }

  start() {
    const clock = new THREE.Clock();
    this.renderer.setAnimationLoop((t) => {
      const dt = Math.min(0.05, clock.getDelta());
      for (const cb of this.frameCbs) cb(dt, performance.now());
      this.renderer.render(this.scene, this.camera);
      this._maybeMirror(performance.now());
    });
  }

  _maybeMirror(now) {
    if (!this.onMirror) return;
    const fps = this.isXR ? GAME.tv.mirrorFpsInXR : GAME.tv.mirrorFps;
    if (now - this._lastMirror < 1000 / fps) return;
    this._lastMirror = now;
    const r = this.renderer;
    // spectator camera follows the player's head
    if (this.isXR) {
      const xrCam = r.xr.getCamera();
      xrCam.matrixWorld.decompose(this.mirrorCam.position, this.mirrorCam.quaternion, new THREE.Vector3());
    } else {
      this.mirrorCam.position.copy(this.camera.position);
      this.mirrorCam.quaternion.copy(this.camera.quaternion);
    }
    this.mirrorCam.updateMatrixWorld(true);
    const wasXR = r.xr.enabled;
    r.xr.enabled = false;
    r.setRenderTarget(this.mirrorRT);
    r.render(this.scene, this.mirrorCam);
    r.setRenderTarget(null);
    r.xr.enabled = wasXR;
    const w = this.mirrorRT.width, h = this.mirrorRT.height;
    r.readRenderTargetPixels(this.mirrorRT, 0, 0, w, h, this.mirrorBuf);
    const tg = this._mirrorTmp.getContext('2d');
    tg.putImageData(new ImageData(new Uint8ClampedArray(this.mirrorBuf.buffer.slice(0)), w, h), 0, 0);
    const og = this._mirrorCanvas.getContext('2d');
    og.save(); og.scale(1, -1); og.drawImage(this._mirrorTmp, 0, -h); og.restore();
    this.onMirror(this._mirrorCanvas.toDataURL('image/jpeg', GAME.tv.jpegQuality));
  }
}
