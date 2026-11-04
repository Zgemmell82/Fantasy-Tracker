// Base class for headset challenges.
//
// Lifecycle (driven by main.js):
//   new X(ctx) -> setup(turn)  [player is getting ready; ready UI may show]
//              -> start()      [after the 3-2-1; clock begins]
//              -> update(dt, now) every frame (also while in setup, so previews animate)
//              -> finish(result) [calls ctx.finish -> game]
//              -> dispose()
//
// Effects: timed `mods` multipliers (read with this.mod('key')) and one-shot `action`s
// (implement `act_<type>(effect, state)` + optional `endAct_<type>(effect, state)`).
import * as THREE from 'three';
import { Ui3D } from '../ui3d.js';

export class Challenge {
  static meta = { id: 'base', name: 'Base', blurb: '', desktopHelp: '' };

  constructor(ctx) {
    this.ctx = ctx;                 // { stage, hands, hud, config, rng, finish(result), say(text, kind) }
    this.stage = ctx.stage;
    this.hands = ctx.hands;
    this.cfg = ctx.config;
    this.root = new THREE.Group();
    this.stage.content.add(this.root);
    this.ui = new Ui3D(this.root);
    this.active = [];               // active timed effects {def, until, state}
    this.t = 0;                     // seconds since start()
    this.running = false;
    this.finished = false;
    this.timeAdjust = 0;
    this.now = 0;
  }

  // ----- lifecycle -----
  setup(turn) { this.turn = turn; }
  start() { this.running = true; this.t = 0; this.active = []; }
  update(dt, now) {
    this.now = now;
    if (this.running) {
      this.t += dt;
      const t = this.t;
      for (const e of [...this.active]) if (t >= e.until) this._endEffect(e);
      if (this.cfg.timeLimit && this.t >= this.cfg.timeLimit) this.timeUp();
    }
  }
  timeUp() { this.finish({ value: this.cfg.timeLimit, dnf: false }); }
  finish(result) {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.ctx.finish(result);
  }
  dispose() {
    this.ui.clear();
    this.stage.content.remove(this.root);
    this.root.traverse((o) => {
      o.geometry?.dispose?.();
      const m = o.material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); });
    });
  }

  // ----- HUD/TV -----
  /** {label, value (seconds), mode:'up'|'down'} */
  elapsed() { return Math.max(0, this.t - this.timeAdjust); }
  getTimer() { return { label: 'TIME', value: this.elapsed(), mode: 'up' }; }
  /** short progress line for HUD/TV */
  getProgress() { return ''; }
  /** desktop-only extras (crosshair, charge bars) */
  isReady() { return true; }

  // ----- effects -----
  /** multiplier from all active effects for `key` */
  mod(key, base = 1) {
    let v = base;
    for (const e of this.active) if (e.def.mods && e.def.mods[key] != null) v *= e.def.mods[key];
    return v;
  }
  hasMod(key) { return this.active.some((e) => e.def.mods && e.def.mods[key] != null); }

  applyEffect(def, kind) {
    if (!this.running) return;
    const entry = { def, kind, until: def.duration ? this.t + def.duration : this.t, state: {} };
    if (def.action) {
      const fn = this['act_' + def.action.type];
      if (fn) fn.call(this, def, entry.state, def.action);
      else console.warn('no handler for action', def.action.type);
    }
    if (def.duration) { this.active.push(entry); this.onEffectStart?.(entry); }
    this.ctx.say(def.feed, kind);
  }

  _endEffect(e) {
    this.active = this.active.filter((x) => x !== e);
    if (e.def.action) this['endAct_' + e.def.action.type]?.call(this, e.def, e.state, e.def.action);
    this.onEffectEnd?.(e);
  }
}
