import * as THREE from 'three';

// Map 3 — "Andy's Room": inside a Toy Story bedroom. Cloud wallpaper,
// wooden floor, furniture to jump on, winding orange toy-car tracks,
// ramps everywhere, and a crowd of little green army men.
export function buildRoom(scene) {
  const drivables = [];
  const solids = [];

  // --- Wooden floor ---
  const floorGeo = new THREE.PlaneGeometry(400, 400);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(
    floorGeo,
    new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.9 })
  );
  floor.receiveShadow = true;
  scene.add(floor);
  drivables.push(floor);
  // floorboard lines
  const plankMat = new THREE.MeshStandardMaterial({ color: 0xa87f52, roughness: 0.9 });
  for (let x = -180; x <= 180; x += 24) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 400), plankMat);
    line.position.set(x, 0.02, 0);
    scene.add(line);
  }
  // round rug
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(42, 40).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x4a69bd, roughness: 1 })
  );
  rug.position.y = 0.04;
  rug.receiveShadow = true;
  scene.add(rug);

  // --- Andy's cloud wallpaper walls ---
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6db3e8, roughness: 1, side: THREE.DoubleSide });
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  let seed = 5;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let w = 0; w < 4; w++) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(400, 70), wallMat);
    const a = (w / 4) * Math.PI * 2;
    wall.position.set(Math.cos(a) * 185, 35, Math.sin(a) * 185);
    wall.lookAt(0, 35, 0);
    scene.add(wall);
    // puffy wallpaper clouds
    for (let c = 0; c < 9; c++) {
      const cloud = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(4 + rand() * 3, 8, 6), cloudMat);
        puff.position.set((k - 1) * 4.5, rand() * 1.5, 0);
        puff.scale.set(1, 0.6, 0.3);
        cloud.add(puff);
      }
      const along = (rand() - 0.5) * 330;
      const up = 14 + rand() * 44;
      const tangent = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      cloud.position.set(Math.cos(a) * 183 + tangent.x * along, up, Math.sin(a) * 183 + tangent.z * along);
      cloud.lookAt(0, up, 0);
      scene.add(cloud);
    }
  }

  // --- Orange toy-car tracks: two winding loops with white rails ---
  const trackMat = new THREE.MeshStandardMaterial({ color: 0xf07f13, roughness: 0.55 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const roadSamples = [];
  const buildLoop = (radiusAt, width, samples = 200) => {
    const pts = [];
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const r = radiusAt(a);
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    const pos = [];
    const idx = [];
    for (let i = 0; i < samples; i++) {
      const p0 = pts[i];
      const tan = new THREE.Vector3().subVectors(pts[(i + 1) % samples], pts[(i - 1 + samples) % samples]).normalize();
      const nrm = new THREE.Vector3(-tan.z, 0, tan.x);
      const l = new THREE.Vector3().addScaledVector(nrm, width / 2).add(p0);
      const r2 = new THREE.Vector3().addScaledVector(nrm, -width / 2).add(p0);
      pos.push(l.x, 0.06, l.z, r2.x, 0.06, r2.z);
      const a2 = i * 2, b2 = ((i + 1) % samples) * 2;
      idx.push(a2, b2, a2 + 1, b2, b2 + 1, a2 + 1);
      roadSamples.push(p0);
      if (i % 3 === 0) {
        for (const edge of [l, r2]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.5, 0.6), railMat);
          rail.position.set(edge.x, 0.25, edge.z);
          rail.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI / 2;
          scene.add(rail);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const road = new THREE.Mesh(geo, trackMat);
    road.receiveShadow = true;
    scene.add(road);
  };
  buildLoop((a) => 105 + Math.sin(a * 2) * 22, 13);
  buildLoop((a) => 52 + Math.sin(a * 3 + 1.2) * 14, 12);

  // --- Ramps (orange toy plastic) — everywhere ---
  const rampMat = new THREE.MeshStandardMaterial({ color: 0xf07f13, roughness: 0.5 });
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
  addRamp(105, 0, Math.PI, 11, 15, 5);
  addRamp(-100, -30, 0, 11, 15, 5);
  addRamp(0, 108, Math.PI / 2, 11, 16, 6);
  addRamp(30, -100, -Math.PI / 2, 11, 16, 6);
  addRamp(52, 20, -Math.PI / 4, 9, 12, 4);
  addRamp(-50, 25, Math.PI / 3, 9, 12, 4);
  addRamp(-20, -55, Math.PI, 9, 12, 4.5);
  addRamp(70, 70, (3 * Math.PI) / 4, 10, 14, 5);
  addCurvedRamp(-70, -70, -Math.PI / 4, 13, 30, 48);  // launches toward center
  addCurvedRamp(80, -45, Math.PI * 0.9, 13, 32, 50);  // launches at the desk
  addCurvedRamp(-45, 80, Math.PI / 4, 12, 28, 45);

  // --- Furniture (solid; tops drivable) ---
  const furn = (geoDims, pos2, color, { drivable = true, solid = true } = {}) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...geoDims),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
    );
    mesh.position.set(...pos2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (drivable) drivables.push(mesh);
    if (solid) {
      solids.push({
        minX: pos2[0] - geoDims[0] / 2, maxX: pos2[0] + geoDims[0] / 2,
        minZ: pos2[2] - geoDims[2] / 2, maxZ: pos2[2] + geoDims[2] / 2,
        h: pos2[1] + geoDims[1] / 2,
      });
    }
    return mesh;
  };
  // bed (jump on the mattress)
  furn([85, 13, 48], [-125, 6.5, -125], 0xc0392b);
  furn([26, 5, 40], [-150, 15.5, -125], 0xffffff, { solid: false }); // pillow
  // desk — high-value landing pad, reachable off the curved ramp
  furn([64, 4, 34], [128, 40, -110], 0x8d6e42);
  for (const [lx, lz] of [[100, -96], [156, -96], [100, -124], [156, -124]]) {
    furn([5, 38, 5], [lx, 19, lz], 0x6d4f2f, { drivable: false });
  }
  // toy chest
  furn([48, 22, 28], [140, 11, 70], 0x27ae60);
  // stacked books — a staircase of jumps
  furn([34, 6, 24], [-138, 3, 85], 0x2980b9);
  furn([28, 6, 20], [-134, 9, 82], 0xe67e22);
  furn([22, 6, 16], [-130, 15, 79], 0x8e44ad);

  // --- Scattered toys: blocks + balls ---
  const blockColors = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xe67e22];
  for (let i = 0; i < 8; i++) {
    const s2 = 6 + rand() * 4;
    let x, z;
    do {
      x = (rand() - 0.5) * 260;
      z = (rand() - 0.5) * 260;
    } while (roadSamples.some((p2) => (p2.x - x) ** 2 + (p2.z - z) ** 2 < 200));
    furn([s2, s2, s2], [x, s2 / 2, z], blockColors[i % blockColors.length]);
  }
  for (let i = 0; i < 4; i++) {
    const r = 4 + rand() * 3;
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(r, 14, 12),
      new THREE.MeshStandardMaterial({ color: blockColors[(i + 2) % 5], roughness: 0.4 })
    );
    ball.position.set((rand() - 0.5) * 220, r, (rand() - 0.5) * 220);
    ball.castShadow = true;
    scene.add(ball);
  }

  // --- Crowd: little green army men along the tracks ---
  const RUNNERS = 110;
  const runnerBodies = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.34, 0.7, 3, 8), new THREE.MeshLambertMaterial(), RUNNERS);
  const runnerHeads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.26, 8, 8), new THREE.MeshLambertMaterial(), RUNNERS);
  const runners = [];
  const runnerSpawn = () => {
    const s2 = roadSamples[(Math.random() * roadSamples.length) | 0];
    return { x: s2.x + (Math.random() - 0.5) * 10, z: s2.z + (Math.random() - 0.5) * 10 };
  };
  const armyGreen = new THREE.Color();
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
    armyGreen.setHSL(0.29 + Math.random() * 0.05, 0.55, 0.3 + Math.random() * 0.12);
    runnerBodies.setColorAt(i, armyGreen);
    runnerHeads.setColorAt(i, armyGreen);
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

  // --- Update loop (same crowd behavior as the other maps) ---
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
