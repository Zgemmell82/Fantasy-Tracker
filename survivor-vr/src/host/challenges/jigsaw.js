// Procedural jigsaw art + piece-shape drawing (all canvas, no assets).
import { mulberry32 } from '../../shared/util.js';

export const PICTURES = [
  { name: 'Sunset Cove',   sky: ['#ff9a4a', '#ffd86b'], sea: ['#1d6a9c', '#3fb0d9'], subject: 'sun' },
  { name: 'Tiki Mask',     sky: ['#2f6b3f', '#6cc072'], sea: ['#7a4a22', '#b5703a'], subject: 'mask' },
  { name: 'Jungle Parrot', sky: ['#2fa05a', '#a8e08a'], sea: ['#1f6a3a', '#3f9c58'], subject: 'parrot' },
  { name: 'Coral Reef',    sky: ['#1f7fbf', '#7fd8f0'], sea: ['#12527f', '#2a9bc9'], subject: 'fish' },
  { name: 'Lava Night',    sky: ['#1b1740', '#5a2f6a'], sea: ['#3a1f2a', '#7a2f2f'], subject: 'volcano' },
  { name: 'Treasure Isle', sky: ['#7fd0ef', '#f4f0c8'], sea: ['#2a8fc0', '#58c4e0'], subject: 'treasure' },
];

const W = 512, H = 384;

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** low-poly triangulated backdrop + a subject, so every cell of the picture has detail */
export function makePicture(index) {
  const P = PICTURES[index % PICTURES.length];
  const rng = mulberry32(1234 + index * 97);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const cols = 10, rows = 8, cw = W / cols, ch = H / rows;
  const pts = [];
  for (let r = 0; r <= rows; r++) { pts.push([]); for (let k = 0; k <= cols; k++) {
    const edge = r === 0 || k === 0 || r === rows || k === cols;
    pts[r].push([k * cw + (edge ? 0 : (rng() - 0.5) * cw * 0.7), r * ch + (edge ? 0 : (rng() - 0.5) * ch * 0.7)]);
  } }
  const colorAt = (y, n) => {
    const t = y / H;
    const horizon = 0.58;
    const base = t < horizon ? lerpColor(P.sky[0], P.sky[1], t / horizon) : lerpColor(P.sea[0], P.sea[1], (t - horizon) / (1 - horizon));
    const m = base.match(/\d+/g).map(Number).map((v) => Math.max(0, Math.min(255, v + n)));
    return `rgb(${m[0]},${m[1]},${m[2]})`;
  };
  const tri = (a, b, d) => {
    const cy = (a[1] + b[1] + d[1]) / 3;
    g.fillStyle = colorAt(cy, (rng() - 0.5) * 46);
    g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...d); g.closePath(); g.fill();
  };
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const a = pts[r][k], b = pts[r][k + 1], d = pts[r + 1][k], e = pts[r + 1][k + 1];
    if ((r + k) % 2) { tri(a, b, d); tri(b, e, d); } else { tri(a, b, e); tri(a, e, d); }
  }
  const poly = (color, arr) => { g.fillStyle = color; g.beginPath(); arr.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
  const circ = (x, y, r, color) => { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); };
  switch (P.subject) {
    case 'sun':
      circ(256, 230, 78, '#fff0a0'); circ(256, 230, 56, '#ffb53a');
      poly('#2a6a3a', [[60, 300], [90, 160], [100, 300]]); poly('#2f9a4a', [[70, 170], [30, 190], [60, 150]]); poly('#2f9a4a', [[96, 170], [140, 185], [100, 150]]);
      poly('#173a52', [[0, 300], [200, 280], [400, 310], [512, 290], [512, 384], [0, 384]]);
      break;
    case 'mask':
      poly('#8a4a22', [[150, 40], [362, 40], [400, 200], [330, 350], [182, 350], [112, 200]]);
      poly('#e8c13a', [[150, 40], [200, 0], [256, 30], [312, 0], [362, 40]]);
      poly('#1b0f06', [[160, 150], [230, 140], [225, 190], [165, 200]]); poly('#1b0f06', [[352, 150], [282, 140], [287, 190], [347, 200]]);
      poly('#c8432b', [[200, 270], [312, 270], [290, 320], [222, 320]]); circ(256, 235, 20, '#e8c13a');
      break;
    case 'parrot':
      poly('#7a4a22', [[0, 300], [512, 250], [512, 275], [0, 330]]);
      g.fillStyle = '#d93a2a'; g.beginPath(); g.ellipse(256, 190, 80, 105, 0.2, 0, 6.3); g.fill();
      circ(300, 100, 48, '#d93a2a'); poly('#f4c542', [[330, 90], [390, 115], [335, 135]]); circ(305, 92, 10, '#fff'); circ(307, 92, 5, '#111');
      poly('#2a86d9', [[215, 160], [150, 250], [250, 290], [290, 190]]); poly('#f4c542', [[230, 290], [210, 370], [260, 300]]);
      break;
    case 'fish':
      g.fillStyle = '#ff8a2b'; g.beginPath(); g.ellipse(230, 190, 110, 68, 0, 0, 6.3); g.fill();
      poly('#ff8a2b', [[330, 190], [420, 120], [420, 260]]); poly('#fff', [[170, 140], [190, 140], [200, 245], [180, 245]]);
      circ(165, 175, 12, '#fff'); circ(165, 175, 6, '#111');
      poly('#e0457b', [[40, 384], [60, 270], [85, 384]]); poly('#e0457b', [[460, 384], [440, 280], [490, 384]]);
      circ(380, 70, 14, '#ffffff66'); circ(410, 40, 9, '#ffffff66'); circ(100, 80, 11, '#ffffff66');
      break;
    case 'volcano':
      poly('#3a2a2a', [[60, 340], [200, 120], [312, 120], [450, 340]]); poly('#ff6a1f', [[200, 120], [256, 150], [312, 120], [270, 70], [240, 70]]);
      poly('#ff6a1f', [[240, 150], [256, 230], [270, 150]]); circ(300, 50, 30, '#777'); circ(340, 25, 22, '#888');
      for (let i = 0; i < 16; i++) circ(rng() * W, rng() * 120, 2 + rng() * 2, '#fff');
      break;
    case 'treasure':
      poly('#e9c987', [[40, 330], [120, 250], [400, 250], [480, 330], [470, 384], [50, 384]]);
      poly('#2f9a4a', [[250, 250], [260, 120], [270, 250]]); poly('#2f9a4a', [[260, 125], [200, 150], [255, 110]]); poly('#2f9a4a', [[262, 125], [320, 150], [265, 110]]);
      poly('#8a4a22', [[300, 290], [400, 290], [400, 340], [300, 340]]); poly('#f4c542', [[300, 290], [400, 290], [400, 305], [300, 305]]);
      g.strokeStyle = '#c8432b'; g.lineWidth = 12; g.beginPath(); g.moveTo(80, 300); g.lineTo(140, 350); g.moveTo(140, 300); g.lineTo(80, 350); g.stroke();
      break;
  }
  return c;
}

/** per-edge tab signs for a cols x rows grid (+1 tab out of the lower/right piece's side...) */
export function makeTabs(cols, rows, seed) {
  const rng = mulberry32(seed);
  const h = [], v = [];
  for (let r = 0; r < rows; r++) { h.push([]); v.push([]); for (let c = 0; c < cols; c++) { h[r].push(rng() < 0.5 ? 1 : -1); v[r].push(rng() < 0.5 ? 1 : -1); } }
  return { h, v };      // h[r][c]: bottom edge of (c,r); v[r][c]: right edge of (c,r). +1 = tab pokes outward
}

function edge(ctx, x0, y0, x1, y1, sign) {
  if (!sign) { ctx.lineTo(x1, y1); return; }
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L, nx = uy * sign, ny = -ux * sign;
  const p = (t, hh) => [x0 + ux * L * t + nx * L * hh, y0 + uy * L * t + ny * L * hh];
  ctx.lineTo(...p(0.35, 0));
  ctx.bezierCurveTo(...p(0.45, 0.02), ...p(0.40, 0.12), ...p(0.38, 0.18));
  ctx.bezierCurveTo(...p(0.34, 0.30), ...p(0.66, 0.30), ...p(0.62, 0.18));
  ctx.bezierCurveTo(...p(0.60, 0.12), ...p(0.55, 0.02), ...p(0.65, 0));
  ctx.lineTo(x1, y1);
}

/** draws the jigsaw outline of piece (c,r) into ctx; piece cell occupies [m,m]-[m+cell,m+cell] */
export function piecePath(ctx, tabs, c, r, cols, rows, cell, m) {
  const top = r === 0 ? 0 : -tabs.h[r - 1][c];
  const bottom = r === rows - 1 ? 0 : tabs.h[r][c];
  const right = c === cols - 1 ? 0 : tabs.v[r][c];
  const left = c === 0 ? 0 : -tabs.v[r][c - 1];
  const x0 = m, y0 = m, x1 = m + cell, y1 = m + cell;
  ctx.beginPath(); ctx.moveTo(x0, y0);
  edge(ctx, x0, y0, x1, y0, top);
  edge(ctx, x1, y0, x1, y1, right);
  edge(ctx, x1, y1, x0, y1, bottom);
  edge(ctx, x0, y1, x0, y0, left);
  ctx.closePath();
}

/** 'img' | 'blank' | 'back' face for one piece. picture = canvas from makePicture */
export function drawPiece(face, picture, tabs, c, r, cols, rows, size = 128) {
  const m = size * 0.25, S = size + 2 * m;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  piecePath(g, tabs, c, r, cols, rows, size, m);
  g.save(); g.clip();
  if (face === 'img') {
    const sx = picture.width / cols, sy = picture.height / rows;
    g.drawImage(picture, c * sx - (m / size) * sx, r * sy - (m / size) * sy, sx * (S / size), sy * (S / size), 0, 0, S, S);
  } else if (face === 'blank') {
    g.fillStyle = '#d9c9a0'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#c3b184'; g.lineWidth = 3;
    for (let i = -S; i < S * 2; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke(); }
    g.fillStyle = '#8a7a50'; g.font = `bold ${size * 0.5}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', S / 2, S / 2);
  } else {
    g.fillStyle = '#6b4a2b'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#4e341d'; g.lineWidth = 4;
    for (let i = 0; i < S; i += 24) { g.beginPath(); g.moveTo(0, i); g.lineTo(S, i + 10); g.stroke(); }
    g.fillStyle = '#e9c987'; g.font = `bold ${size * 0.45}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('↻', S / 2, S / 2);
  }
  g.restore();
  piecePath(g, tabs, c, r, cols, rows, size, m);
  g.lineWidth = 3; g.strokeStyle = face === 'img' ? 'rgba(20,12,4,.75)' : '#4a3a20'; g.stroke();
  return cv;
}
