// Web-optimize every truck GLB: dedup + weld vertices, conservatively
// simplify very dense meshes, resize/convert textures to 1024px WebP, prune.
// Originals are kept as .preopt backups. Run: node tools/optimize-models.js

import * as fs from 'fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, simplify, textureCompress, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const dir = 'assets/trucks/';

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.glb')).sort()) {
  const path = dir + file;
  const before = fs.statSync(path).size;
  const doc = await io.read(path);

  let verts = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) verts += prim.getAttribute('POSITION').getCount();
  }

  const transforms = [dedup(), weld()];
  if (verts > 200000) {
    // dense scan-like mesh — light simplification is imperceptible
    transforms.push(simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.0008 }));
  }
  transforms.push(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
    prune()
  );
  await doc.transform(...transforms);

  if (!fs.existsSync(path + '.preopt')) fs.copyFileSync(path, path + '.preopt');
  await io.write(path, doc);
  const after = fs.statSync(path).size;
  console.log(`${file}: ${(before / 1e6).toFixed(1)}MB → ${(after / 1e6).toFixed(1)}MB (${verts.toLocaleString()} verts${verts > 200000 ? ', simplified' : ''})`);
}
