// Virtual keyboard (3D buttons) for typing a player name. Pointer = controller ray (XR) or mouse (desktop);
// a physical keyboard also works on desktop. Max length comes from config.
import * as THREE from 'three';

const ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

export class Keyboard {
  constructor(ui, { max = 12, onChange, onBegin, defaultName = 'Player' }) {
    this.ui = ui; this.max = max; this.name = ''; this.onChange = onChange; this.onBegin = onBegin; this.defaultName = defaultName;
    this.buttons = [];
    this.group = ui.group;
    this.group.position.set(0, 1.28, -0.9);
    this.group.rotation.x = -0.3;                     // tilted back like a real keyboard, towards the player
    const kw = 0.075, gap = 0.008;
    ROWS.forEach((row, r) => {
      [...row].forEach((ch, i) => {
        const x = (i - (row.length - 1) / 2) * (kw + gap) + (r === 2 ? 0.0 : 0);
        this.buttons.push(ui.addButton({ text: ch, pos: new THREE.Vector3(x, 0.17 - r * (kw + gap), 0), width: kw, height: kw, res: 128, fs: 3.6, onSelect: () => this.type(ch) }));
      });
    });
    const y = 0.17 - 4 * (kw + gap);
    this.buttons.push(ui.addButton({ text: 'SPACE', pos: new THREE.Vector3(-0.16, y, 0), width: 0.24, height: kw, res: 256, fs: 1.1, onSelect: () => this.type(' ') }));
    this.buttons.push(ui.addButton({ text: 'DEL', pos: new THREE.Vector3(0.05, y, 0), width: 0.12, height: kw, res: 160, fs: 1.1, onSelect: () => this.backspace() }));
    this.begin = ui.addButton({ text: 'BEGIN!', sub: 'timer starts', pos: new THREE.Vector3(0.22, y, 0), width: 0.2, height: kw + 0.02, res: 256, fs: 0.9, fill: '#58d68d', onSelect: () => this.onBegin?.(this.value()) });
    this.buttons.push(this.begin);

    // name display
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    this.canvas = c; this.tex = new THREE.CanvasTexture(c); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.board = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshBasicMaterial({ map: this.tex }));
    this.board.position.set(0, 0.29, 0); this.group.add(this.board);
    this.draw();
  }

  value() { const v = this.name.trim(); return v || this.defaultName; }

  type(ch) { if (this.name.length < this.max) { this.name += ch; this.draw(); this.onChange?.(this.name); } }
  backspace() { if (this.name) { this.name = this.name.slice(0, -1); this.draw(); this.onChange?.(this.name); } }

  /** physical keyboard (desktop): pass hands.keysDown */
  poll(keysDown) {
    for (const k of keysDown) {
      if (k === 'backspace') this.backspace();
      else if (k === 'enter') this.onBegin?.(this.value());
      else if (k.length === 1 && /[a-z0-9 ]/i.test(k)) this.type(k.toUpperCase());
    }
  }

  draw(now = performance.now()) {
    const g = this.canvas.getContext('2d');
    g.fillStyle = '#1d140c'; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#7b5230'; g.lineWidth = 8; g.strokeRect(4, 4, 504, 120);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 60px Trebuchet MS, sans-serif';
    const blank = !this.name;
    g.fillStyle = blank ? '#7a6a55' : '#ffcc4d';
    g.fillText(blank ? this.defaultName : this.name, 256, 58, 470);
    g.font = '22px Trebuchet MS, sans-serif'; g.fillStyle = '#b8c9a8';
    g.fillText(`${this.name.length}/${this.max} · type your name, then BEGIN`, 256, 106);
    this.tex.needsUpdate = true;
  }
}
