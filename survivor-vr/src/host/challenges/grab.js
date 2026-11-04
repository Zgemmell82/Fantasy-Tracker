// Shared "pick things up with the hand" helper: mouse drag on desktop, trigger-grab in XR.
// items: [{ mesh, radius, state }]  - anything with state 'gone' or 'locked' is ignored.
import * as THREE from 'three';

export class Grabber {
  /**
   * @param {object} ch     the challenge (for stage/hands)
   * @param {object} o      { items:()=>[], holdZ:number, xrRadius, canGrab(item), onDenied(item), onGrab(item), onDrop(item), planeZ(item) }
   */
  constructor(ch, o) { this.ch = ch; this.o = o; this.held = null; }

  update() {
    const { ch, o } = this;
    const hands = ch.hands, items = o.items().filter((i) => i.state !== 'gone');
    if (ch.stage.isXR) {
      for (const side of ['left', 'right']) {
        const h = hands[side]; if (!h.connected) continue;
        if (h.triggerDown && !this.held) {
          let best = null, bd = o.xrRadius ?? 0.16;
          for (const it of items) { if (it.state === 'held') continue; const d = it.mesh.position.distanceTo(h.pos); if (d < bd) { bd = d; best = it; } }
          if (best) this._try(best, side, new THREE.Vector3());
        }
        if (this.held && this.held.hand === side) {
          this.held.item.mesh.position.copy(h.pos);
          if (!h.trigger) this._drop();
        }
      }
      return;
    }
    const m = hands.mouse;
    const ray = hands.mouseRay();
    if (m.justDown && !this.held) {
      let best = null, bd = Infinity, bh = null;
      for (const it of items) {
        if (it.state === 'held') continue;
        const z = it.mesh.position.z, t = (z - ray.origin.z) / ray.direction.z;
        const hit = ray.at(t, new THREE.Vector3());
        const d = Math.hypot(hit.x - it.mesh.position.x, hit.y - it.mesh.position.y);
        if (d < (it.radius ?? 0.08) && d < bd) { bd = d; best = it; bh = hit; }
      }
      if (best) this._try(best, 'mouse', new THREE.Vector3(best.mesh.position.x - bh.x, best.mesh.position.y - bh.y, 0));
    }
    if (this.held) {
      const it = this.held.item;
      const z = o.holdZ ?? it.mesh.position.z;
      const t = (z - ray.origin.z) / ray.direction.z;
      const hit = ray.at(t, new THREE.Vector3());
      it.mesh.position.set(hit.x + this.held.off.x, hit.y + this.held.off.y, z);
      if (m.justUp || !m.down) this._drop();
    }
  }

  _try(item, hand, off) {
    if (this.o.canGrab && !this.o.canGrab(item)) { this.o.onDenied?.(item); return; }
    item.prevState = item.state; item.state = 'held';
    this.held = { item, hand, off };
    this.o.onGrab?.(item);
  }

  _drop() {
    const it = this.held.item; this.held = null;
    if (it.state === 'held') it.state = it.prevState === 'held' ? 'free' : (it.prevState || 'free');
    this.o.onDrop?.(it);
  }

  release() { if (this.held) this._drop(); }
  get item() { return this.held?.item || null; }
}
