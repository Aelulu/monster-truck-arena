// Headless smoke test: load every truck exactly the way the game does
// (GLTFLoader parse → prepareTruckVisual) and report size, grounding, and
// wheel rig stats. Textures are stripped so it runs outside a browser —
// geometry and node structure are what matter here.
//
// Run: node tools/test-trucks.mjs
import * as fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareTruckVisual, tightBox } from '../src/truck.js';

function stripTextures(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
  delete json.images;
  delete json.textures;
  delete json.samplers;
  if (json.materials) json.materials = json.materials.map((m) => ({ name: m.name }));
  let jstr = JSON.stringify(json);
  while (jstr.length % 4) jstr += ' ';
  const jbuf = Buffer.from(jstr);
  const rest = buf.subarray(20 + jsonLen);
  const out = Buffer.alloc(12 + 8 + jbuf.length + rest.length);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jbuf.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jbuf.copy(out, 20);
  rest.copy(out, 20 + jbuf.length);
  return out;
}

const dir = new URL('../assets/trucks/', import.meta.url).pathname;
const configs = JSON.parse(fs.readFileSync(dir + 'trucks.json', 'utf8'));
let failures = 0;

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.glb')).sort()) {
  const id = file.replace(/\.glb$/, '');
  try {
    const raw = stripTextures(fs.readFileSync(dir + file));
    const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
    const { visual, wheels } = prepareTruckVisual(gltf.scene, configs[id] || {});
    const box = tightBox(visual);
    const size = box.getSize(new THREE.Vector3());
    const nan = [...size.toArray(), box.min.y].some((v) => !isFinite(v));
    const radii = [...new Set(wheels.map((w) => w.radius.toFixed(2)))];
    console.log(
      `${nan ? '✗' : '✓'} ${id.padEnd(12)} size ${size.toArray().map((v) => v.toFixed(1)).join('×')}`,
      `| rests at y=${box.min.y.toFixed(2)}`,
      `| wheel nodes ${wheels.length} (front ${wheels.filter((w) => w.isFront).length}, radius ${radii.join('/')})`,
      nan ? '!! NaN bounds' : ''
    );
    if (nan) failures++;
  } catch (e) {
    console.log(`✗ ${id.padEnd(12)} FAILED: ${e && e.message || e}`);
    failures++;
  }
}
process.exit(failures ? 1 : 0);
