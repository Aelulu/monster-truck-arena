import * as THREE from 'three';

// City map: a busy downtown grid — avenues and cross-streets, colorful
// buildings (solid! and their roofs are drivable if you can get up there),
// parks, ramps for jumping blocks, and crowds on every sidewalk.
// Same interface as the arena's buildWorld.
export function buildCity(scene) {
  const drivables = [];
  const solids = []; // {minX, maxX, minZ, maxZ, h} — lateral collision boxes

  // --- Ground: one big asphalt sheet; streets are painted on it ---
  const groundSize = 400;
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({ color: 0x4a4e57, roughness: 0.95 })
  );
  ground.receiveShadow = true;
  scene.add(ground);
  drivables.push(ground);

  // Street grid: avenues every 40 units in both directions, 14 wide.
  // Blocks sit between them with sidewalks + buildings.
  const AVENUES = [-120, -80, -40, 0, 40, 80, 120];
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xf6e58d, roughness: 0.6 });
  for (const a of AVENUES) {
    for (let t = -116; t <= 116; t += 12) {
      const d1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 5), dashMat);
      d1.position.set(a, 0.03, t);
      scene.add(d1);
      const d2 = new THREE.Mesh(new THREE.BoxGeometry(5, 0.04, 0.5), dashMat);
      d2.position.set(t, 0.03, a);
      scene.add(d2);
    }
  }

  // --- Blocks: sidewalk slab + building (or park) ---
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.9 });
  const parkMat = new THREE.MeshStandardMaterial({ color: 0x69a35c, roughness: 1 });
  const blockCenters = [-100, -60, -20, 20, 60, 100];
  const parks = new Set(['20,20', '-20,-20', '100,-100']); // green squares
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647; // deterministic — same city every load
    return (seed - 1) / 2147483646;
  };
  const buildingColor = new THREE.Color();
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      if (Math.hypot(bx, bz) > 150) continue; // keep the city round-ish
      const slabGeo = new THREE.BoxGeometry(26, 0.3, 26);
      const isPark = parks.has(`${bx},${bz}`);
      const slab = new THREE.Mesh(slabGeo, isPark ? parkMat : sidewalkMat);
      slab.position.set(bx, 0.15, bz);
      slab.receiveShadow = true;
      scene.add(slab);
      drivables.push(slab);
      if (isPark) continue;

      const w = 14 + rand() * 7;
      const d = 14 + rand() * 7;
      const h = 9 + rand() * 30;
      buildingColor.setHSL(rand(), 0.3 + rand() * 0.25, 0.55 + rand() * 0.15);
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: buildingColor.clone(), roughness: 0.85 })
      );
      building.position.set(bx, h / 2 + 0.3, bz);
      building.castShadow = true;
      building.receiveShadow = true;
      scene.add(building);
      drivables.push(building); // roofs are drivable
      solids.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2, h: h + 0.3 });

      // simple lit-window strips for a downtown feel
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.85, h * 0.75, d * 0.85),
        new THREE.MeshStandardMaterial({
          color: 0x223,
          emissive: 0xffe9a8,
          emissiveIntensity: 0.25 + rand() * 0.3,
          roughness: 0.4,
        })
      );
      win.position.copy(building.position);
      win.scale.set(1.001, 1, 1.001);
      win.visible = false; // subtle version: skip extra draw unless wanted
      scene.add(win);
    }
  }

  // --- Ramps: jump the blocks (and reach the roofs) ---
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
  const addCurvedRamp = (x, z, rotY, width, radius, exitDeg) => {
    const theta = THREE.MathUtils.degToRad(exitDeg);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    for (let i = 1; i <= 20; i++) {
      const a = (i / 20) * theta;
      shape.lineTo(radius * Math.sin(a), radius * (1 - Math.cos(a)));
    }
    shape.lineTo(radius * Math.sin(theta), 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    geo.translate(-(radius * Math.sin(theta)) / 2, 0, -width / 2);
    const ramp = new THREE.Mesh(geo, rampMat);
    ramp.position.set(x, 0, z);
    ramp.rotation.y = rotY;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    scene.add(ramp);
    drivables.push(ramp);
  };

  addRamp(0, -55, -Math.PI / 2, 10, 14, 5);      // launch north up 0-avenue
  addRamp(-40, 40, Math.PI / 2, 10, 14, 5);      // launch south
  addRamp(58, 0, Math.PI, 10, 16, 6);            // launch west along z=0
  addRamp(-90, 0, 0, 10, 16, 6);                 // launch east
  addRamp(80, -58, -Math.PI / 2, 9, 12, 8);      // roof-hopper: aim at the block roofs
  addRamp(-40, -84, Math.PI / 2, 9, 12, 8);
  addCurvedRamp(20, 20, Math.PI / 4, 12, 34, 50); // park mega ramp, launches downtown
  addCurvedRamp(-20, -20, -Math.PI * 0.75, 12, 34, 50);

  // park mounds
  const moundMat = new THREE.MeshStandardMaterial({ color: 0xa5764a, roughness: 1 });
  for (const [mx, mz] of [[100, -100], [24, 14], [-14, -26]]) {
    const geo = new THREE.SphereGeometry(5, 20, 14);
    geo.scale(1, 0.4, 1);
    const mound = new THREE.Mesh(geo, moundMat);
    mound.position.set(mx, 0, mz);
    mound.castShadow = true;
    mound.receiveShadow = true;
    scene.add(mound);
    drivables.push(mound);
  }

  // --- Street props: lamps + parked cars ---
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.5, metalness: 0.7 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6d5, emissiveIntensity: 1.4 });
  for (const [lx, lz] of [[8, 8], [-8, -48], [48, -8], [-48, 8], [8, 88], [-88, -8], [88, 48], [-8, -88]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 7, 8), poleMat);
    pole.position.set(lx, 3.5, lz);
    pole.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), lampMat);
    head.position.set(lx, 7.2, lz);
    scene.add(pole, head);
  }
  const carColors = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12];
  [[5, -40], [-5, 60], [60, 5], [-100, -5]].forEach(([cx, cz], i) => {
    const car = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: carColors[i], roughness: 0.6, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 1.9), bodyMat);
    body.position.y = 0.75;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.7), bodyMat);
    cabin.position.set(-0.2, 1.6, 0);
    car.add(body, cabin);
    car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    car.position.set(cx, 0, cz);
    car.rotation.y = (i % 2) * Math.PI / 2;
    scene.add(car);
  });

  // --- Crowd: pedestrians on the streets and sidewalks ---
  const RUNNERS = 130;
  const skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
  const runnerBodies = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.34, 0.7, 3, 8), new THREE.MeshLambertMaterial(), RUNNERS);
  const runnerHeads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.26, 8, 8), new THREE.MeshLambertMaterial(), RUNNERS);
  const runners = [];
  const inSolid = (x, z, pad = 0.6) =>
    solids.some((b) => x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad);
  const runnerSpawn = () => {
    for (let tries = 0; tries < 20; tries++) {
      const avenue = AVENUES[(Math.random() * AVENUES.length) | 0];
      const t = -115 + Math.random() * 230;
      const jitter = (Math.random() - 0.5) * 10;
      const [x, z] = Math.random() < 0.5 ? [avenue + jitter, t] : [t, avenue + jitter];
      if (!inSolid(x, z, 1.2) && Math.hypot(x, z) < 122) return { x, z };
    }
    return { x: 0, z: 0 };
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

  // --- Confetti bursts (same as arena) ---
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
        if (rad > 122) { p.x *= 122 / rad; p.z *= 122 / rad; p.dir += Math.PI * 0.6; }

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
