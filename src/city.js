import * as THREE from 'three';

// Map 2 — "Circuit": Mario Kart-style countryside. Two winding looped roads
// (with crossings), red/white curbs, trees, drifting clouds, ramps, and the
// same fleeing crowd + characters. No buildings — open and easy to navigate.
export function buildCity(scene) {
  const drivables = [];
  const solids = []; // tree trunks — small crunchable boxes

  // --- Grass ground ---
  const groundSize = 400;
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({ color: 0x6fae5c, roughness: 1 })
  );
  ground.receiveShadow = true;
  scene.add(ground);
  drivables.push(ground);

  // --- Winding roads: two closed kart loops that cross each other ---
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x4f545e, roughness: 0.9 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xf6e58d, roughness: 0.6 });
  const curbMats = [
    new THREE.MeshStandardMaterial({ color: 0xd63031, roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
  ];
  const roadSamples = []; // for spawning people + keeping trees off the roads

  const buildLoop = (radiusAt, width, samples = 220) => {
    const pts = [];
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const r = radiusAt(a);
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    // flat ribbon along the loop
    const pos = [];
    const idx = [];
    for (let i = 0; i < samples; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % samples];
      const tan = new THREE.Vector3().subVectors(p1, pts[(i - 1 + samples) % samples]).normalize();
      const nrm = new THREE.Vector3(-tan.z, 0, tan.x); // horizontal normal
      const l = new THREE.Vector3().addScaledVector(nrm, width / 2).add(p0);
      const r = new THREE.Vector3().addScaledVector(nrm, -width / 2).add(p0);
      pos.push(l.x, 0.05, l.z, r.x, 0.05, r.z);
      const a2 = i * 2, b2 = ((i + 1) % samples) * 2;
      idx.push(a2, b2, a2 + 1, b2, b2 + 1, a2 + 1);
      roadSamples.push(p0);

      // curbs on both edges, alternating red/white
      if (i % 4 === 0) {
        for (const edge of [l, r]) {
          const curb = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 1.2), curbMats[(i / 4) % 2]);
          curb.position.set(edge.x, 0.09, edge.z);
          curb.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI / 2;
          scene.add(curb);
        }
      }
      // dashed centerline
      if (i % 6 === 0) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 4), dashMat);
        dash.position.set(p0.x, 0.1, p0.z);
        dash.rotation.y = Math.atan2(tan.x, tan.z);
        scene.add(dash);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const road = new THREE.Mesh(geo, roadMat);
    road.receiveShadow = true;
    scene.add(road); // visual only — the flat ground is the physics
  };

  buildLoop((a) => 95 + Math.sin(a * 3) * 18, 15);      // big outer winding loop
  buildLoop((a) => 45 + Math.sin(a * 2 + 1) * 16, 13);  // inner loop, crosses the outer

  // --- Trees (crunchable trunks) ---
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9 });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: 0x43a047, roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: 0x558b2f, roughness: 1 }),
  ];
  let seed = 11;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const nearRoad = (x, z, d) => roadSamples.some((s2) => (s2.x - x) ** 2 + (s2.z - z) ** 2 < d * d);
  let planted = 0;
  while (planted < 46) {
    const a = rand() * Math.PI * 2;
    const r = 18 + rand() * 140;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (nearRoad(x, z, 13)) continue;
    const h = 5 + rand() * 4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, h, 8), trunkMat);
    trunk.position.set(x, h / 2, z);
    trunk.castShadow = true;
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(2.4 + rand() * 1.6, 10, 8),
      leafMats[(rand() * leafMats.length) | 0]
    );
    crown.position.set(x, h + 1.2, z);
    crown.scale.y = 1.15;
    crown.castShadow = true;
    scene.add(trunk, crown);
    solids.push({ minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.9, maxZ: z + 0.9, h: h });
    planted++;
  }

  // --- Clouds: fluffy sphere-clusters drifting slowly ---
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const clouds = [];
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + ((rand() * 3) | 0);
    for (let k = 0; k < puffs; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(4 + rand() * 4, 10, 8), cloudMat);
      puff.position.set((k - puffs / 2) * 5 + rand() * 3, rand() * 2, rand() * 4 - 2);
      puff.scale.y = 0.55;
      cloud.add(puff);
    }
    cloud.position.set(rand() * 340 - 170, 46 + rand() * 26, rand() * 340 - 170);
    scene.add(cloud);
    clouds.push({ group: cloud, speed: 1.2 + rand() * 1.6 });
  }

  // --- Ramps along the roads ---
  const rampMat = new THREE.MeshStandardMaterial({ color: 0x9a9fb0, roughness: 0.8 });
  const addRamp = (x, z, rotY, width = 10, length = 14, height = 4) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(length, 0);
    shape.lineTo(length, height);
    shape.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    geo.translate(-length / 2, 0, -width / 2);
    const ramp = new THREE.Mesh(geo, rampMat);
    ramp.position.set(x, 0, z);
    ramp.rotation.y = rotY;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    scene.add(ramp);
    drivables.push(ramp);
  };
  addRamp(95, 0, Math.PI, 12, 16, 5);         // on the outer loop, east
  addRamp(-90, 30, 0, 12, 16, 5);             // outer loop, west
  addRamp(0, -100, -Math.PI / 2, 12, 18, 7);  // outer loop, south — big one
  addRamp(0, 45, Math.PI / 2, 10, 14, 4.5);   // inner loop, north
  addRamp(-45, -10, -Math.PI / 4, 9, 12, 4);  // inner loop kicker

  // park mounds on the infield
  const moundMat = new THREE.MeshStandardMaterial({ color: 0xa5764a, roughness: 1 });
  for (const [mx, mz] of [[0, 0], [70, 70], [-70, -60]]) {
    const geo = new THREE.SphereGeometry(6, 20, 14);
    geo.scale(1, 0.45, 1);
    const mound = new THREE.Mesh(geo, moundMat);
    mound.position.set(mx, 0, mz);
    mound.castShadow = true;
    mound.receiveShadow = true;
    scene.add(mound);
    drivables.push(mound);
  }

  // --- Crowd: pedestrians along the winding roads ---
  const RUNNERS = 120;
  const skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
  const runnerBodies = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.34, 0.7, 3, 8), new THREE.MeshLambertMaterial(), RUNNERS);
  const runnerHeads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.26, 8, 8), new THREE.MeshLambertMaterial(), RUNNERS);
  const runners = [];
  const runnerSpawn = () => {
    const s2 = roadSamples[(Math.random() * roadSamples.length) | 0];
    return {
      x: s2.x + (Math.random() - 0.5) * 12,
      z: s2.z + (Math.random() - 0.5) * 12,
    };
  };
  for (let i = 0; i < RUNNERS; i++) {
    const { x, z } = runnerSpawn();
    runners.push({
      x, y: 0.9, z,
      dir: Math.random() * Math.PI * 2,
      speed: 0,
      wanderAt: 0,
      phase: Math.random() * Math.PI * 2,
      state: 'alive', vx: 0, vy: 0, vz: 0, tumble: 0, deadUntil: 0,
    });
    runnerBodies.setColorAt(i, new THREE.Color().setHSL(Math.random(), 0.7, 0.48));
    runnerHeads.setColorAt(i, new THREE.Color(skins[(Math.random() * skins.length) | 0]));
  }
  runnerBodies.instanceColor.needsUpdate = true;
  runnerHeads.instanceColor.needsUpdate = true;
  scene.add(runnerBodies, runnerHeads);

  // --- Confetti ---
  const CONFETTI = 500;
  const confetti = Array.from({ length: CONFETTI }, () => ({ life: 0, x: 0, y: -1000, z: 0, vx: 0, vy: 0, vz: 0 }));
  const confettiPos = new Float32Array(CONFETTI * 3);
  confettiPos.fill(-1000);
  const confettiCol = new Float32Array(CONFETTI * 3);
  const confettiGeo = new THREE.BufferGeometry();
  confettiGeo.setAttribute('position', new THREE.BufferAttribute(confettiPos, 3));
  confettiGeo.setAttribute('color', new THREE.BufferAttribute(confettiCol, 3));
  const confettiPts = new THREE.Points(confettiGeo, new THREE.PointsMaterial({
    size: 0.45, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  confettiPts.frustumCulled = false;
  scene.add(confettiPts);
  let confettiCursor = 0;
  const confettiColor = new THREE.Color();
  const burst = (x, y, z) => {
    for (let n = 0; n < 26; n++) {
      const i = confettiCursor;
      confettiCursor = (confettiCursor + 1) % CONFETTI;
      const c = confetti[i];
      c.x = x; c.y = y + 0.5; c.z = z;
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 9;
      c.vx = Math.cos(a) * sp;
      c.vz = Math.sin(a) * sp;
      c.vy = 5 + Math.random() * 10;
      c.life = 0.9 + Math.random() * 0.6;
      confettiColor.setHSL(Math.random(), 0.9, 0.6);
      confettiCol[i * 3] = confettiColor.r;
      confettiCol[i * 3 + 1] = confettiColor.g;
      confettiCol[i * 3 + 2] = confettiColor.b;
    }
  };

  // --- Per-frame update ---
  let time = 0;
  let frame = 0;
  let crowdHits = 0;
  const inSolid = (x, z, pad = 0.6) =>
    solids.some((b) => x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad);
  const runnerRay = new THREE.Raycaster();
  const runnerDown = new THREE.Vector3(0, -1, 0);
  const runnerOrigin = new THREE.Vector3();
  const blockedAhead = (x, z) => {
    if (inSolid(x, z)) return true;
    runnerRay.set(runnerOrigin.set(x, 8, z), runnerDown);
    runnerRay.far = 20;
    const hits = runnerRay.intersectObjects(drivables, false);
    if (!hits.length) return false;
    const hit = hits.find((h) => h.point.y <= 1.2) || hits[hits.length - 1];
    return hit.point.y > 0.7;
  };
  const crowdM = new THREE.Matrix4();
  const crowdQ = new THREE.Quaternion();
  const crowdE = new THREE.Euler();
  const ONE = new THREE.Vector3(1, 1, 1);
  const ZERO = new THREE.Vector3(0, 0, 0);

  const update = (dt, impactors = []) => {
    time += dt;
    frame++;

    for (const c of clouds) {
      c.group.position.x += c.speed * dt;
      if (c.group.position.x > 200) c.group.position.x = -200;
    }

    for (let j = 0; j < RUNNERS; j++) {
      const p = runners[j];
      if (p.state === 'alive') {
        let threat = null, threatD = 1 / 0;
        for (const imp of impactors) {
          if (Math.abs(imp.y - 1.2) > 3.2) continue;
          const d = Math.hypot(p.x - imp.x, p.z - imp.z);
          if (d < threatD) { threatD = d; threat = imp; }
        }
        if (threat && threatD < 30) {
          const away = Math.atan2(p.x - threat.x, p.z - threat.z);
          let turn = THREE.MathUtils.euclideanModulo(away - p.dir + Math.PI, Math.PI * 2) - Math.PI;
          p.dir += THREE.MathUtils.clamp(turn, -7 * dt, 7 * dt);
          p.speed = THREE.MathUtils.lerp(p.speed, 9.5, Math.min(1, dt * 5));
        } else {
          if (time > p.wanderAt) {
            p.dir += (Math.random() - 0.5) * 2;
            p.wanderAt = time + 1.5 + Math.random() * 3;
          }
          p.speed = THREE.MathUtils.lerp(p.speed, 2.2, Math.min(1, dt * 2));
        }
        const nx = p.x + Math.sin(p.dir) * p.speed * dt;
        const nz = p.z + Math.cos(p.dir) * p.speed * dt;
        if (p.speed > 0.5 && ((frame + j) % 3 === 0 || inSolid(nx, nz)) && blockedAhead(nx, nz)) {
          p.dir += 1.4 + Math.random();
        } else {
          p.x = nx;
          p.z = nz;
        }
        const rad = Math.hypot(p.x, p.z);
        if (rad > 130) { p.x *= 130 / rad; p.z *= 130 / rad; p.dir += Math.PI * 0.6; }

        if (threat && threatD < threat.radius + 1.1 && threat.speed > 4) {
          const d = Math.max(threatD, 0.5);
          p.state = 'flying';
          p.vx = ((p.x - threat.x) / d) * threat.speed * 0.6 + threat.vx * 0.4;
          p.vz = ((p.z - threat.z) / d) * threat.speed * 0.6 + threat.vz * 0.4;
          p.vy = 8 + threat.speed * 0.25;
          p.tumble = Math.random() * Math.PI * 2;
          burst(p.x, p.y, p.z);
          crowdHits++;
          document.dispatchEvent(new CustomEvent('crowd-hit', { detail: crowdHits }));
        } else {
          const bob = Math.abs(Math.sin(time * (2 + p.speed * 0.9) + p.phase)) * 0.14;
          const lean = p.speed > 5 ? 0.32 : 0.06;
          crowdQ.setFromAxisAngle(new THREE.Vector3(Math.sin(p.dir), 0, -Math.cos(p.dir)).normalize(), lean);
          crowdM.compose(new THREE.Vector3(p.x, p.y + bob, p.z), crowdQ, ONE);
          runnerBodies.setMatrixAt(j, crowdM);
          crowdM.compose(new THREE.Vector3(p.x, p.y + 0.66 + bob, p.z), crowdQ, ONE);
          runnerHeads.setMatrixAt(j, crowdM);
        }
      } else if (p.state === 'flying') {
        p.vy -= 26 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.tumble += dt * 11;
        if (p.y < 0.2 && p.vy < 0) {
          p.state = 'dead';
          p.deadUntil = time + 10 + Math.random() * 8;
        }
        crowdQ.setFromEuler(crowdE.set(p.tumble, p.tumble * 0.6, p.tumble * 0.3));
        crowdM.compose(new THREE.Vector3(p.x, p.y, p.z), crowdQ, ONE);
        runnerBodies.setMatrixAt(j, crowdM);
        crowdM.compose(new THREE.Vector3(p.x, p.y + 0.66, p.z), crowdQ, ONE);
        runnerHeads.setMatrixAt(j, crowdM);
      } else {
        if (time > p.deadUntil) {
          const { x, z } = runnerSpawn();
          p.state = 'alive';
          p.x = x; p.y = 0.9; p.z = z;
          p.speed = 0;
        } else {
          crowdM.compose(ZERO, crowdQ.identity(), ZERO);
          runnerBodies.setMatrixAt(j, crowdM);
          runnerHeads.setMatrixAt(j, crowdM);
        }
      }
    }
    runnerBodies.instanceMatrix.needsUpdate = true;
    runnerHeads.instanceMatrix.needsUpdate = true;

    for (let j = 0; j < CONFETTI; j++) {
      const c = confetti[j];
      if (c.life > 0) {
        c.life -= dt;
        c.vy -= 20 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
        if (c.life <= 0) c.y = -1000;
      }
      confettiPos[j * 3] = c.x;
      confettiPos[j * 3 + 1] = c.y;
      confettiPos[j * 3 + 2] = c.z;
    }
    confettiGeo.attributes.position.needsUpdate = true;
    confettiGeo.attributes.color.needsUpdate = true;
  };

  return { drivables, solids, bounds: 124, update };
}
