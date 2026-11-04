// Shared low-poly jungle/beach scenery + little prop builders. Everything is flat-shaded
// Lambert with merged / instanced geometry to stay cheap on a Quest 1.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../shared/util.js';

const _mats = new Map();
export function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!_mats.has(key)) _mats.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
  return _mats.get(key);
}

function colored(geo, color, m4) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (m4) g.applyMatrix4(m4);
  const c = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

function palmGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.2, 5, 5);
  parts.push(colored(trunk, 0x8a5a33, new THREE.Matrix4().makeTranslation(0, 2.5, 0)));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = new THREE.ConeGeometry(0.35, 2.6, 3);
    const m = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler(0, a, 0))
      .multiply(new THREE.Matrix4().makeTranslation(0, 5.05, 0))
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, 0, -1.25)))
      .multiply(new THREE.Matrix4().makeTranslation(0, 1.2, 0));
    parts.push(colored(leaf, i % 2 ? 0x2f9a4a : 0x3fb85a, m));
  }
  parts.push(colored(new THREE.IcosahedronGeometry(0.2, 0), 0x5b3a1e, new THREE.Matrix4().makeTranslation(0.15, 4.85, 0.1)));
  return mergeGeometries(parts);
}

export function makeTotem(scale = 1, hue = 0xb5662e) {
  const g = new THREE.Group();
  const stack = [[0.5, 0.5, 0.5, hue], [0.55, 0.5, 0.55, 0xd9a441], [0.5, 0.5, 0.5, 0x9c3f2a]];
  stack.forEach(([w, h, d, c], i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    m.position.y = 0.25 + i * 0.5; g.add(m);
    // eyes + mouth
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.04), mat(0x1c120a));
    eyeL.position.set(-0.12, 0.25 + i * 0.5 + 0.08, d / 2); g.add(eyeL);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.12; g.add(eyeR);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.04), mat(0x1c120a));
    mouth.position.set(0, 0.25 + i * 0.5 - 0.1, d / 2); g.add(mouth);
  });
  const wings = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.12), mat(0x3a8f4f));
  wings.position.y = 1.2; g.add(wings);
  g.scale.setScalar(scale);
  return g;
}

export function makeTorch() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.6, 5), mat(0x6b4a2b));
  pole.position.y = 0.8; g.add(pole);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.07, 0.14, 6), mat(0x3a2a1a));
  bowl.position.y = 1.65; g.add(bowl);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 5), new THREE.MeshBasicMaterial({ color: 0xffa31a }));
  flame.position.y = 1.9; flame.name = 'flame'; g.add(flame);
  return g;
}

/** chunky spectator for the "crowd blocks view" sabotage */
export function makeCrowdMember(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.1, 6), mat(color));
  body.position.y = 0.55; g.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), mat(0xe2a877));
  head.position.y = 1.35; g.add(head);
  const mask = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.08), mat(0xa4452a));
  mask.position.set(0, 1.4, 0.18); g.add(mask);
  const plume = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 4), mat(0xe8c13a));
  plume.position.y = 1.78; g.add(plume);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), mat(0xe2a877));
    arm.position.set(0.36 * s, 1.3, 0); arm.rotation.z = -0.25 * s; g.add(arm);
  }
  return g;
}

export function buildWorld(parent) {
  const rng = mulberry32(7);
  const g = new THREE.Group();
  parent.add(g);

  // ocean + island
  const ocean = new THREE.Mesh(new THREE.CircleGeometry(90, 20), mat(0x2e9fcf));
  ocean.rotation.x = -Math.PI / 2; ocean.position.y = -0.35; g.add(ocean);
  const island = new THREE.Mesh(new THREE.CylinderGeometry(17, 20, 0.6, 14), mat(0xe9d08a));
  island.position.y = -0.3; g.add(island);
  const wet = new THREE.Mesh(new THREE.CylinderGeometry(19.2, 21, 0.5, 14), mat(0xc9ae6a));
  wet.position.y = -0.34; g.add(wet);

  // palms (one instanced draw call)
  const palmGeo = palmGeometry();
  const palmMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const spots = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rng() * 0.3;
    const r = 13 + rng() * 3.5;
    spots.push([Math.sin(a) * r, Math.cos(a) * r - 0]);
  }
  const palms = new THREE.InstancedMesh(palmGeo, palmMat, spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  spots.forEach(([x, z], i) => {
    const s = 0.9 + rng() * 0.7;
    e.set((rng() - 0.5) * 0.2, rng() * 6.28, (rng() - 0.5) * 0.2);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
    palms.setMatrixAt(i, m4);
  });
  g.add(palms);

  // rocks
  for (let i = 0; i < 9; i++) {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4 + rng() * 0.7, 0), mat(0x7b7b6e));
    const a = rng() * 6.28, r = 10 + rng() * 6;
    rock.position.set(Math.sin(a) * r, 0.1, Math.cos(a) * r); rock.scale.y = 0.6; g.add(rock);
  }

  // distant volcano + clouds for atmosphere
  const volc = new THREE.Mesh(new THREE.ConeGeometry(14, 16, 7), mat(0x3f6f4a));
  volc.position.set(-28, 6, -62); g.add(volc);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3.2, 3.5, 7), mat(0xd94f23));
  cap.position.set(-28, 14.2, -62); g.add(cap);
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + rng() * 2, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    c.scale.set(2, 0.6, 1); c.position.set((rng() - 0.5) * 120, 22 + rng() * 8, -50 - rng() * 30); g.add(c);
  }

  // torches + totems flanking the play area
  const torches = [];
  for (const [x, z] of [[-3.2, -1.6], [3.2, -1.6], [-4.5, 3], [4.5, 3]]) {
    const t = makeTorch(); t.position.set(x, 0, z); g.add(t); torches.push(t);
  }
  const tot1 = makeTotem(1.6); tot1.position.set(-7, 0, -5); tot1.rotation.y = 0.5; g.add(tot1);
  const tot2 = makeTotem(1.6, 0x7a4a9a); tot2.position.set(7, 0, -5); tot2.rotation.y = -0.5; g.add(tot2);

  // a small "player deck" so the stationary spot feels grounded
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.06, 8), mat(0x8a5a33));
  deck.position.y = 0.03; g.add(deck);

  return {
    group: g,
    tick(t) { torches.forEach((tr, i) => { const f = tr.getObjectByName('flame'); f.scale.y = 1 + Math.sin(t * 9 + i) * 0.25; }); },
  };
}
