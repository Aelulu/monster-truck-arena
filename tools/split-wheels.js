// Extracts wheels that are fused into a model's body geometry, so the game
// can spin them. Usage: node tools/split-wheels.js assets/trucks/<name>.glb
//
// How: detect the four wheel regions from vertex clusters (low, at the
// corners, sticking out sideways), fit an axle center + radius per corner,
// then MOVE — not alter — every triangle that lies fully inside a wheel's
// cylinder into a new child node (Wheel_FL/FR/RL/RR) under the same parent.
// Wheel primitives get compact copies of their vertex data: bounding boxes
// must reflect the wheel alone (three.js ignores indices when computing
// bounds, so sharing the body's vertex buffer breaks pivot placement).
//
// The original file is backed up as <name>.glb.orig before writing.

import * as fs from 'fs';
import * as path from 'path';
import { Matrix4, Vector3 } from 'three';
import { NodeIO } from '@gltf-transform/core';

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/split-wheels.js assets/trucks/<name>.glb');
  process.exit(1);
}

const io = new NodeIO();
const doc = await io.read(file);
const root = doc.getRoot();
const scene = root.listScenes()[0];

// Collect mesh nodes with world matrices (three.js math — proven against the
// renderer; hand-rolled compositions bit us on FBX transform chains).
const meshNodes = [];
const walkTree = (node, parentM) => {
  const local = new Matrix4().fromArray(node.getMatrix());
  const worldM = new Matrix4().multiplyMatrices(parentM, local);
  if (node.getMesh()) meshNodes.push({ node, worldM });
  node.listChildren().forEach((c) => walkTree(c, worldM));
};
scene.listChildren().forEach((c) => walkTree(c, new Matrix4()));

const v = new Vector3();
const eachVertex = (fn) => {
  for (const { node, worldM } of meshNodes) {
    for (const prim of node.getMesh().listPrimitives()) {
      const arr = prim.getAttribute('POSITION').getArray();
      for (let i = 0; i < arr.length; i += 3) {
        v.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(worldM);
        fn(v);
      }
    }
  }
};

// --- Pass 1: world-space model bounds ---
const min = [1 / 0, 1 / 0, 1 / 0], max = [-1 / 0, -1 / 0, -1 / 0];
eachVertex((w) => {
  for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], w.getComponent(k));
    max[k] = Math.max(max[k], w.getComponent(k));
  }
});
const size = max.map((m, k) => m - min[k]);
const center = max.map((m, k) => (m + min[k]) / 2);
const L = size[0] >= size[2] ? 0 : 2; // length axis (x=0, z=2)
const S = L === 0 ? 2 : 0;            // side axis
console.log(`model: ${size.map((s) => s.toFixed(1)).join(' x ')} | length axis ${L === 0 ? 'x' : 'z'}`);

// --- Pass 2: cluster low outboard vertices per corner, fit axle + radius ---
const yCut = min[1] + size[1] * 0.45;
const cornerVerts = {};
eachVertex((w) => {
  if (w.y > yCut) return;
  if (Math.abs(w.getComponent(S) - center[S]) < size[S] * 0.18) return; // not outboard
  const key = `${w.getComponent(L) > center[L] ? 'F' : 'B'}${w.getComponent(S) > center[S] ? 'L' : 'R'}`;
  (cornerVerts[key] ||= []).push([w.getComponent(L), w.y, w.getComponent(S)]);
});

const wheels = [];
for (const [key, allVerts] of Object.entries(cornerVerts)) {
  if (allVerts.length < 100) continue;
  // The tires are the lowest geometry and touch the ground, so the wheel
  // radius equals the axle height. Iterate: estimate the axle center from
  // the cluster, derive the radius from ground contact, discard vertices
  // outside it (fenders, panels), re-estimate.
  let verts = allVerts;
  let cl = 0, cy = 0, r = 0;
  for (let iter = 0; iter < 3; iter++) {
    cl = verts.reduce((s, p) => s + p[0], 0) / verts.length;
    cy = verts.reduce((s, p) => s + p[1], 0) / verts.length;
    r = cy - min[1];
    verts = allVerts.filter((p) => Math.hypot(p[0] - cl, p[1] - cy) <= r * 1.25);
    if (verts.length < 50) break;
  }
  if (verts.length < 50) continue;
  const sides = verts.map((p) => p[2]).sort((a, b) => a - b);
  const sIn = sides[Math.floor(sides.length * 0.02)];
  const sOut = sides[Math.floor(sides.length * 0.98)];
  wheels.push({
    key, cl, cy, r: r * 1.05,
    sMin: Math.min(sIn, sOut) - size[S] * 0.01,
    sMax: Math.max(sIn, sOut) + size[S] * 0.01,
  });
  console.log(`${key}: axle(${cl.toFixed(1)}, y=${cy.toFixed(1)}) r=${r.toFixed(1)} side=[${sIn.toFixed(1)}, ${sOut.toFixed(1)}] verts=${verts.length}/${allVerts.length}`);
}
if (wheels.length !== 4) {
  console.error(`found ${wheels.length}/4 wheel regions — aborting, model unchanged.`);
  process.exit(2);
}

const inWheel = (wh, w) =>
  w.getComponent(S) >= wh.sMin && w.getComponent(S) <= wh.sMax &&
  Math.hypot(w.getComponent(L) - wh.cl, w.y - wh.cy) <= wh.r;

// --- Pass 3: move whole-inside triangles into per-wheel primitives ---
const wheelNames = { FL: 'Wheel_FL', FR: 'Wheel_FR', BL: 'Wheel_RL', BR: 'Wheel_RR' };
const buffer = root.listBuffers()[0];
let totalMoved = 0;
const wheelStats = Object.fromEntries(wheels.map((w) => [w.key, 0]));

for (const { node, worldM } of meshNodes) {
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION').getArray();
    const indices = prim.getIndices();
    const idx = indices ? indices.getArray() : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
    const keep = [];
    const buckets = {};
    for (let t = 0; t < idx.length; t += 3) {
      let bucket = null;
      for (const wh of wheels) {
        let inside = true;
        for (let c = 0; c < 3; c++) {
          const i3 = idx[t + c] * 3;
          v.set(pos[i3], pos[i3 + 1], pos[i3 + 2]).applyMatrix4(worldM);
          if (!inWheel(wh, v)) { inside = false; break; }
        }
        if (inside) { bucket = wh.key; break; }
      }
      const target = bucket ? (buckets[bucket] ||= []) : keep;
      target.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    const bucketKeys = Object.keys(buckets);
    if (!bucketKeys.length) continue;

    // shrink original primitive to non-wheel triangles (shared buffer is
    // fine here — it keeps the body's own bounds)
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(buffer));

    for (const key of bucketKeys) {
      // compact per-wheel vertex data: remap indices to a fresh vertex subset
      const remap = new Map();
      const newIdx = buckets[key].map((oldI) => {
        if (!remap.has(oldI)) remap.set(oldI, remap.size);
        return remap.get(oldI);
      });
      const IndexArr = remap.size < 65536 ? Uint16Array : Uint32Array;
      const wPrim = doc.createPrimitive()
        .setMode(prim.getMode())
        .setMaterial(prim.getMaterial())
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(IndexArr.from(newIdx)).setBuffer(buffer));
      for (const sem of prim.listSemantics()) {
        const acc = prim.getAttribute(sem);
        const n = acc.getElementSize();
        const src = acc.getArray();
        const dst = new src.constructor(remap.size * n);
        for (const [oldI, newI] of remap) {
          for (let k = 0; k < n; k++) dst[newI * n + k] = src[oldI * n + k];
        }
        const newAcc = doc.createAccessor().setType(acc.getType()).setArray(dst).setBuffer(buffer);
        if (acc.getNormalized()) newAcc.setNormalized(true);
        wPrim.setAttribute(sem, newAcc);
      }

      const name = wheelNames[key];
      let wNode = node.listChildren().find((n) => n.getName() === name);
      if (!wNode) {
        wNode = doc.createNode(name);
        node.addChild(wNode);
      }
      let wMesh = wNode.getMesh();
      if (!wMesh) {
        wMesh = doc.createMesh(name);
        wNode.setMesh(wMesh);
      }
      wMesh.addPrimitive(wPrim);
      wheelStats[key] += buckets[key].length / 3;
      totalMoved += buckets[key].length / 3;
    }
  }
}

console.log('triangles moved per wheel:', wheelStats, '| total:', totalMoved);
if (totalMoved < 400) {
  console.error('suspiciously few wheel triangles — aborting, model unchanged.');
  process.exit(2);
}

const { prune } = await import('@gltf-transform/functions');
await doc.transform(prune());

if (!fs.existsSync(file + '.orig')) fs.copyFileSync(file, file + '.orig');
await io.write(file, doc);
const mb = (fs.statSync(file).size / 1e6).toFixed(1);
console.log(`✓ wrote ${file} (${mb} MB), backup at ${path.basename(file)}.orig`);
console.log('  wheelNodes: ["Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR"]');
