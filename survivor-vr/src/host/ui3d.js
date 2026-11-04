// Minimal in-world buttons (work with mouse on desktop and controller rays in XR).
import * as THREE from 'three';

function drawButton(canvas, text, hover, sub) {
  const g = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const k = w / 512;
  g.clearRect(0, 0, w, h);
  g.fillStyle = hover ? '#ffcc4d' : (canvas._fill || '#e08a2a');
  g.strokeStyle = '#4a2a10'; g.lineWidth = 8 * k;
  const r = 28 * k;
  const e = 4 * k;
  g.beginPath();
  g.moveTo(r, e); g.lineTo(w - r, e); g.quadraticCurveTo(w - e, e, w - e, r);
  g.lineTo(w - e, h - r); g.quadraticCurveTo(w - e, h - e, w - r, h - e);
  g.lineTo(r, h - e); g.quadraticCurveTo(e, h - e, e, h - r);
  g.lineTo(e, r); g.quadraticCurveTo(e, e, r, e); g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = '#2b1606'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${(sub ? 44 : 54) * k * (canvas._fs || 1)}px Trebuchet MS, sans-serif`;
  g.fillText(text, w / 2, sub ? h * 0.38 : h / 2);
  if (sub) { g.font = `${30 * k}px Trebuchet MS, sans-serif`; g.fillText(sub, w / 2, h * 0.7); }
}

export class Ui3D {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.buttons = [];
  }
  get active() { return this.buttons.length > 0; }

  addButton({ text, sub, pos, width = 0.5, height = 0.2, rotY = 0, onSelect, res = 512, fill, fs = 1 }) {
    const canvas = document.createElement('canvas');
    canvas.width = res; canvas.height = Math.round(res * height / width); canvas._fill = fill; canvas._fs = fs;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    mesh.position.copy(pos); mesh.rotation.y = rotY;
    this.group.add(mesh);
    const b = { mesh, canvas, tex, text, sub, hover: false, onSelect, selected: false };
    drawButton(canvas, text, false, sub); tex.needsUpdate = true;
    this.buttons.push(b);
    return b;
  }
  setText(b, text, sub) { b.text = text; b.sub = sub; drawButton(b.canvas, text, b.hover, sub); b.tex.needsUpdate = true; }
  remove(b) {
    this.group.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); b.tex.dispose();
    this.buttons = this.buttons.filter((x) => x !== b);
  }
  clear() { [...this.buttons].forEach((b) => this.remove(b)); }

  update(rays) {
    if (!this.buttons.length) return;
    const hit = new THREE.Vector3();
    const plane = new THREE.Plane(), nrm = new THREE.Vector3();
    const hovered = new Set();
    const clicks = [];
    for (const r of rays) {
      let best = null, bestD = Infinity;
      for (const b of this.buttons) {
        b.mesh.updateWorldMatrix(true, false);
        nrm.set(0, 0, 1).transformDirection(b.mesh.matrixWorld);
        plane.setFromNormalAndCoplanarPoint(nrm, b.mesh.getWorldPosition(new THREE.Vector3()));
        if (!r.ray.intersectPlane(plane, hit)) continue;
        const local = b.mesh.worldToLocal(hit.clone());
        const gp = b.mesh.geometry.parameters;
        if (Math.abs(local.x) <= gp.width / 2 && Math.abs(local.y) <= gp.height / 2) {
          const d = hit.distanceTo(r.ray.origin);
          if (d < bestD) { best = b; bestD = d; }
        }
      }
      if (best) { hovered.add(best); if (r.clicked) clicks.push(best); }
    }
    for (const b of this.buttons) {
      const h = hovered.has(b);
      if (h !== b.hover) { b.hover = h; drawButton(b.canvas, b.text, h, b.sub); b.tex.needsUpdate = true; }
    }
    for (const b of clicks) b.onSelect?.(b);
  }
}
