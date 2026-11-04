// State machine for the standalone Fire Making mini game (headset + TV only, no phones, no taps).
//   setup (host picks player count) -> up -> naming -> running -> result -> ... -> final (Play Again / Back to Menu)
// Exactly ONE attempt per player. Pure logic (no three.js) so it can be tested in Node.
import { FIREGAME } from '../../config/firegame.js';

export class FireGame {
  /** runner: { prepare(n), begin(name) } - scene hooks supplied by main.js */
  constructor(runner, cfg = FIREGAME) {
    this.runner = runner; this.cfg = cfg; this.onChange = () => {};
    this.reset();
  }

  reset() {
    this.phase = 'setup'; this.total = this.cfg.players.default; this.index = 0; this.players = [];
    this.timer = 0; this.last = null; this.version = (this.version || 0) + 1;
  }

  changed() { this.version++; this.onChange(); }
  setPlayers(n) { this.total = Math.max(this.cfg.players.min, Math.min(this.cfg.players.max, Math.round(+n) || this.cfg.players.default)); this.changed(); return this.total; }

  start(n) {
    if (n != null) this.setPlayers(n);
    this.players = Array.from({ length: this.total }, (_, i) => ({ n: i + 1, name: `Player ${i + 1}`, done: false, dnf: false, time: null, reason: '' }));
    this.index = 0; this.last = null;
    this.enterUp();
  }

  enterUp() {
    this.phase = 'up'; this.timer = this.cfg.upSeconds;
    if (!this.silent) this.runner.prepare(this.index + 1);
    this.changed();
  }

  get current() { return this.players[this.index]; }

  /** "Player N, you're up" -> keyboard in the headset */
  toNaming() { if (this.phase === 'up') { this.phase = 'naming'; this.changed(); } }

  /** the player pressed BEGIN: name is fixed, the clock starts NOW */
  begin(name) {
    if (this.phase !== 'up' && this.phase !== 'naming') return false;
    const n = String(name ?? '').trim().slice(0, this.cfg.nameMax);
    this.current.name = n || `Player ${this.current.n}`;
    this.phase = 'running';
    if (!this.silent) this.runner.begin(this.current.name);
    this.changed();
    return true;
  }

  /** the scene reports the end of the single attempt: { dnf, value, reason } */
  finish(r) {
    if (this.phase !== 'running') return;
    const p = this.current;
    p.done = true; p.dnf = !!r.dnf; p.time = r.dnf ? null : r.value; p.reason = r.reason || ''; p.elapsed = r.value;
    this.last = { ...p };
    this.phase = 'result'; this.timer = this.cfg.resultSeconds;
    this.changed();
  }

  next() {
    if (this.phase === 'up') return this.toNaming();
    if (this.phase !== 'result') return;
    this.index++;
    if (this.index >= this.total) { this.phase = 'final'; this.changed(); }
    else this.enterUp();
  }

  update(dt) {
    if (this.phase === 'up') { this.timer -= dt; if (this.timer <= 0) this.toNaming(); }
    else if (this.phase === 'result') { this.timer -= dt; if (this.timer <= 0) this.next(); }
  }

  playAgain() { if (this.phase === 'final') this.start(this.total); }

  /** finished players, fastest first, DNFs at the bottom (in the order they finished) */
  scoreboard() {
    const done = this.players.filter((p) => p.done);
    const ok = done.filter((p) => !p.dnf).sort((a, b) => a.time - b.time || a.n - b.n);
    const bad = done.filter((p) => p.dnf);
    return [...ok, ...bad].map((p, i) => ({ rank: i + 1, n: p.n, name: p.name, time: p.time, dnf: p.dnf, reason: p.reason }));
  }

  winner() { const s = this.scoreboard()[0]; return s && !s.dnf ? s : null; }

  publicState() {
    return {
      mode: 'fire', v: this.version, phase: this.phase, total: this.total, n: this.index + 1,
      current: this.players[this.index] ? { n: this.current.n, name: this.current.name } : null,
      last: this.last, scoreboard: this.scoreboard(), remaining: this.players.filter((p) => !p.done).length,
      winner: this.phase === 'final' ? this.winner() : null,
      phaseTimer: this.phase === 'up' || this.phase === 'result' ? Math.max(0, this.timer) : 0,
    };
  }
}
