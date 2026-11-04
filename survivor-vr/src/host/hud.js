// In-world scoreboard: a tiki sign showing timer, progress and effect toasts.
// (Head-locked HUDs are uncomfortable in VR, so this is a fixed board in the scene.)
import * as THREE from 'three';

export class Hud {
  constructor(parent) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 768; this.canvas.height = 384;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: this.tex }));
    this.mesh.position.set(0, 2.55, -2.6);
    parent.add(this.mesh);
    this.data = { title: '', timer: '', line: '', big: '' };
    this.toastText = ''; this.toastUntil = 0; this.toastKind = 'help';
    this._sig = ''; this._last = 0;
  }
  place(x, y, z, scale = 1) { this.mesh.position.set(x, y, z); this.mesh.scale.setScalar(scale); this.mesh.lookAt(0, 1.6, 0); }
  set(d) { Object.assign(this.data, d); }
  toast(text, kind, now, seconds = 4) { this.toastText = text; this.toastKind = kind; this.toastUntil = now + seconds * 1000; }

  update(now) {
    if (now - this._last < 90) return;
    this._last = now;
    const showToast = now < this.toastUntil;
    const sig = JSON.stringify(this.data) + (showToast ? this.toastText : '');
    if (sig === this._sig) return;
    this._sig = sig;
    const g = this.canvas.getContext('2d'), w = 768, h = 384;
    g.fillStyle = '#5a3a1e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7b5230'; g.fillRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#1d140c'; g.fillRect(28, 28, w - 56, h - 56);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#e9c987'; g.font = 'bold 34px Trebuchet MS, sans-serif';
    g.fillText(this.data.title || '', w / 2, 64);
    g.fillStyle = '#ffcc4d'; g.font = 'bold 120px Trebuchet MS, sans-serif';
    g.fillText(this.data.big || this.data.timer || '', w / 2, 170);
    g.fillStyle = '#fdf3dc'; g.font = '36px Trebuchet MS, sans-serif';
    g.fillText(this.data.line || '', w / 2, 250);
    if (showToast) {
      g.fillStyle = this.toastKind === 'help' ? '#2f9e66' : this.toastKind === 'sabotage' ? '#c8432b' : '#3a6a8a';
      g.fillRect(40, 285, w - 80, 70);
      g.fillStyle = '#fff'; g.font = 'bold 30px Trebuchet MS, sans-serif';
      g.fillText(this.toastText, w / 2, 320, w - 110);
    }
    this.tex.needsUpdate = true;
  }
}
