import * as THREE from 'three';

// Builds the arena: ground, ramps, and props. Everything the truck can drive
// on gets pushed into `drivables` — the truck raycasts against that list to
// find the surface under its wheels, so ramps launch it automatically.
export function buildWorld(scene) {
  const drivables = [];

  // --- Ground ---
  const groundSize = 400;
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, 64, 64);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0xb98a52, // packed dirt
    roughness: 1,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);
  drivables.push(ground);

  // Track lines so motion is readable at speed
  const line = new THREE.GridHelper(groundSize, 40, 0x8a6236, 0x8a6236);
  line.position.y = 0.02;
  line.material.opacity = 0.35;
  line.material.transparent = true;
  scene.add(line);

  // --- Ramps ---
  const rampMat = new THREE.MeshStandardMaterial({ color: 0x9a9fb0, roughness: 0.8 });
  const addRamp = (x, z, rotY, width = 10, length = 14, height = 4) => {
    // Wedge built from an extruded triangle
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

  // Curved mega ramp: a circular-arc profile that starts flat and sweeps up
  // to a steep exit angle, like a quarter pipe. Smooth transition = the truck
  // keeps its speed all the way up, then flies off the lip ballistically.
  const addCurvedRamp = (x, z, rotY, width, radius, exitDeg) => {
    const theta = THREE.MathUtils.degToRad(exitDeg);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    const segs = 24;
    for (let i = 1; i <= segs; i++) {
      const a = (i / segs) * theta;
      shape.lineTo(radius * Math.sin(a), radius * (1 - Math.cos(a)));
    }
    shape.lineTo(radius * Math.sin(theta), 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    const length = radius * Math.sin(theta);
    geo.translate(-length / 2, 0, -width / 2);
    const ramp = new THREE.Mesh(geo, rampMat);
    ramp.position.set(x, 0, z);
    ramp.rotation.y = rotY;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    scene.add(ramp);
    drivables.push(ramp);
  };

  // --- HUGE curved launch ramps ---
  addCurvedRamp(-82, 0, 0, 20, 45, 55);              // west wall monster: 19 units tall
  addCurvedRamp(80, 40, Math.PI, 18, 38, 52);        // east wall, launches back across
  addCurvedRamp(22, -88, -Math.PI / 2, 16, 34, 50);  // south wall, launches north

  // A ramp launches trucks traveling along its rotY direction (rotY 0 = +X).
  addRamp(30, 0, 0);                          // starter jump straight ahead
  addRamp(-40, -30, Math.PI / 2);             // side launch
  addRamp(20, 60, Math.PI, 12, 20, 6);        // monster ramp, faces back

  // Kicker runway: three jumps in a row heading east along the south side
  addRamp(-15, -60, 0, 10, 12, 3.5);
  addRamp(15, -60, 0, 10, 12, 4.5);
  addRamp(48, -60, 0, 10, 16, 6);

  // Cross ramps: four launches aimed at the arena center — criss-cross air
  addRamp(45, 45, (3 * Math.PI) / 4, 10, 16, 5.5);
  addRamp(-45, 45, Math.PI / 4, 10, 16, 5.5);                      // launches (+x,-z)
  addRamp(-45, -45, -Math.PI / 4, 10, 16, 5.5);                    // launches (+x,+z)
  addRamp(60, -25, Math.PI, 10, 16, 5.5);                          // launches -X toward center

  // Gap jump: launch ramp, a hole, then a mirrored landing ramp
  addRamp(50, 62, 0, 12, 16, 5);
  addRamp(80, 62, Math.PI, 12, 16, 5);

  // Scattered kickers for casual pops and flip practice
  addRamp(-50, 40, -Math.PI / 4, 8, 10, 3);
  addRamp(-15, 25, Math.PI / 3, 8, 10, 3);
  addRamp(20, -25, -Math.PI / 2, 8, 10, 3);
  addRamp(-75, -60, Math.PI / 4, 8, 10, 3);

  // --- Dirt mounds (drivable bumps) ---
  const moundMat = new THREE.MeshStandardMaterial({ color: 0xa5764a, roughness: 1 });
  const addMound = (x, z, r = 6, h = 2.2) => {
    const geo = new THREE.SphereGeometry(r, 24, 16);
    geo.scale(1, h / r, 1);
    const mound = new THREE.Mesh(geo, moundMat);
    mound.position.set(x, 0, z);
    mound.castShadow = true;
    mound.receiveShadow = true;
    scene.add(mound);
    drivables.push(mound);
  };
  addMound(15, -35);
  addMound(24, -42, 7, 2.8);
  addMound(-20, 20, 5, 1.8);
  addMound(65, 15, 8, 3);
  addMound(-62, -22, 9, 3.2);
  addMound(75, -75, 7, 2.5);
  addMound(-32, 72, 8, 2.8);
  addMound(8, 36, 5, 2);
  addMound(-88, 55, 7, 2.4);
  addMound(95, -8, 6, 2.2);

  // --- Elevated highway: a long sky road crossing the arena; jump off
  // anywhere, or launch clean off the far end ---
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x5a5f6a, roughness: 0.85 });
  const road = new THREE.Mesh(new THREE.BoxGeometry(170, 1.2, 12), roadMat);
  road.position.set(5, 12.4, 20); // top surface at y = 13, spans x -80..90
  road.castShadow = true;
  road.receiveShadow = true;
  scene.add(road);
  drivables.push(road);

  // East end sweeps upward — a sky-jump pointed square at the grandstands.
  // Hit it moderate speed to land in the crowd; full boost clears the stadium.
  {
    const R = 28, theta = THREE.MathUtils.degToRad(45), thick = 1.2, segs = 20;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * theta;
      pts.push([R * Math.sin(a), R * (1 - Math.cos(a))]);
    }
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1] - thick);
    for (const [x, y] of pts) shape.lineTo(x, y - thick);
    for (let i = segs; i >= 0; i--) shape.lineTo(pts[i][0], pts[i][1]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 12, bevelEnabled: false });
    geo.translate(0, 0, -6);
    const sweep = new THREE.Mesh(geo, roadMat);
    sweep.position.set(90, 13, 20); // continues the deck, ends ~x=110 at y≈21
    sweep.castShadow = true;
    sweep.receiveShadow = true;
    scene.add(sweep);
    drivables.push(sweep);
  }

  // dashed center line
  for (let x = -74; x <= 84; x += 12) {
    const dash = new THREE.Mesh(
      new THREE.BoxGeometry(5, 0.05, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xf6e58d, roughness: 0.6 })
    );
    dash.position.set(x, 13.06, 20);
    scene.add(dash);
  }
  // support pillars, including a tall one under the curl
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x757a85, roughness: 0.9 });
  for (let x = -70; x <= 80; x += 30) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 11.8, 10), pillarMat);
    pillar.position.set(x, 5.9, 20);
    pillar.castShadow = true;
    scene.add(pillar);
  }
  const tallPillar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 16, 10), pillarMat);
  tallPillar.position.set(103, 8, 20);
  tallPillar.castShadow = true;
  scene.add(tallPillar);
  // on-ramp up to the highway at its west end
  addRamp(-96, 20, 0, 12, 32, 13);

  // --- Crush cars (props to jump over) ---
  const carColors = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12];
  for (let i = 0; i < 4; i++) {
    const car = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: carColors[i], roughness: 0.6, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 1.9), bodyMat);
    body.position.y = 0.75;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.7), bodyMat);
    cabin.position.set(-0.2, 1.6, 0);
    car.add(body, cabin);
    car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    car.position.set(44 + i * 4.6, 0, 0); // lined up after the first ramp
    scene.add(car);
  }

  // --- Tires along the barrier wall ---
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
  const tireGeo = new THREE.TorusGeometry(1.1, 0.45, 10, 20);
  tireGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.position.set(Math.cos(angle) * 127, 0.45, Math.sin(angle) * 127);
    tire.castShadow = true;
    scene.add(tire);
  }

  // --- Stadium: open bowl — drive up into the bleachers from anywhere ---
  // The stepped tiers stay visual; an invisible smooth cone collider matching
  // their envelope makes the whole 360° ring drivable like a bowl. The outer
  // clamp (in truck.js) keeps trucks inside, closing the stadium all around.
  {
    const profile = [
      new THREE.Vector2(126, 0),
      new THREE.Vector2(170, 16.4),
      new THREE.Vector2(172.5, 16.4),
    ];
    // Raycasts cull backfaces per material.side, and a lathe's normals face
    // inward — DoubleSide so rays from above actually land on the bowl.
    const bowl = new THREE.Mesh(
      new THREE.LatheGeometry(profile, 72),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    );
    bowl.visible = false; // collider only — raycasts still hit it
    scene.add(bowl);
    drivables.push(bowl);
  }

  // Grandstands ring the whole arena: stepped tiers rising away from the wall
  const SECTIONS = 14;
  const TIERS = 6;
  const tierMats = [
    new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x455a64, roughness: 0.9 }),
  ];
  for (let s = 0; s < SECTIONS; s++) {
    const mid = ((s + 0.5) / SECTIONS) * Math.PI * 2;
    for (let t = 0; t < TIERS; t++) {
      const r = 137 + t * 6;
      const w = 2 * r * Math.tan(Math.PI / SECTIONS) * 0.9;
      const step = new THREE.Mesh(new THREE.BoxGeometry(w, 2.7, 6.2), tierMats[t % 2]);
      step.position.set(Math.cos(mid) * r, 1.35 + t * 2.7, Math.sin(mid) * r);
      step.lookAt(0, step.position.y, 0);
      scene.add(step);
      drivables.push(step); // trucks can land on and ride the grandstands
    }
  }

  // Crowd: instanced spectators on every tier, bobbing and cheering
  const SEATS = 24;
  const crowdCount = SECTIONS * TIERS * SEATS;
  const bodies = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.34, 0.7, 3, 8), new THREE.MeshLambertMaterial(), crowdCount);
  const heads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.26, 8, 8), new THREE.MeshLambertMaterial(), crowdCount);
  const skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
  const seats = [];
  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  let idx = 0;
  for (let s = 0; s < SECTIONS; s++) {
    const a0 = (s / SECTIONS) * Math.PI * 2;
    const span = (Math.PI * 2) / SECTIONS;
    for (let t = 0; t < TIERS; t++) {
      const baseR = 137 + t * 6 - 1.4;
      const yTop = 2.7 + t * 2.7;
      for (let k = 0; k < SEATS; k++) {
        const a = a0 + span * (0.07 + (0.86 * (k + 0.5)) / SEATS);
        const r = baseR + (Math.random() - 0.5) * 2.6;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const y = yTop + 0.6;
        seats.push({
          x, y, z, homeX: x, homeY: y, homeZ: z,
          phase: Math.random() * Math.PI * 2, amp: 0.05 + Math.random() * 0.12,
          state: 'alive', vx: 0, vy: 0, vz: 0, tumble: 0, deadUntil: 0,
        });
        m.makeTranslation(x, y, z);
        bodies.setMatrixAt(idx, m);
        m.makeTranslation(x, y + 0.66, z);
        heads.setMatrixAt(idx, m);
        bodies.setColorAt(idx, color.setHSL(Math.random(), 0.72, 0.5));
        heads.setColorAt(idx, color.set(skins[(Math.random() * skins.length) | 0]));
        idx++;
      }
    }
  }
  bodies.instanceColor.needsUpdate = true;
  heads.instanceColor.needsUpdate = true;
  scene.add(bodies, heads);

  // Floodlight towers at the four corners
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.5, metalness: 0.7 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6d5, emissiveIntensity: 1.5 });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 34, 10), poleMat);
    pole.position.set(Math.cos(a) * 158, 17, Math.sin(a) * 158);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 1.4), lampMat);
    lamp.position.set(Math.cos(a) * 156, 35.5, Math.sin(a) * 156);
    lamp.lookAt(0, 5, 0);
    scene.add(pole, lamp);
  }

  // Floor crowd: pedestrians loose in the arena. They mill around until the
  // truck gets close, then sprint away from it — chase them down for hits.
  const RUNNERS = 70;
  const runnerBodies = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.34, 0.7, 3, 8), new THREE.MeshLambertMaterial(), RUNNERS);
  const runnerHeads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.26, 8, 8), new THREE.MeshLambertMaterial(), RUNNERS);
  const runners = [];
  const runnerSpawn = () => {
    const a = Math.random() * Math.PI * 2;
    const r = 15 + Math.random() * 85;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
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

  // Confetti bursts for crowd hits
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

  // Per-frame crowd + confetti animation, and crowd-vs-impactor collisions.
  // Impactors are {x, y, z, vx, vz, speed, radius} — the truck and the ball.
  let time = 0;
  let crowdHits = 0;
  let frame = 0;
  const runnerRay = new THREE.Raycaster();
  const runnerDown = new THREE.Vector3(0, -1, 0);
  const runnerOrigin = new THREE.Vector3();
  const blockedAhead = (x, z) => {
    runnerRay.set(runnerOrigin.set(x, 8, z), runnerDown);
    runnerRay.far = 20;
    const hits = runnerRay.intersectObjects(drivables, false);
    if (!hits.length) return false;
    const hit = hits.find((h) => h.point.y <= 1.2) || hits[hits.length - 1];
    return hit.point.y > 0.6; // ramp/mound/stands in the way
  };
  const crowdM = new THREE.Matrix4();
  const crowdQ = new THREE.Quaternion();
  const crowdE = new THREE.Euler();
  const ONE = new THREE.Vector3(1, 1, 1);
  const ZERO = new THREE.Vector3(0, 0, 0);
  const update = (dt, impactors = []) => {
    time += dt;
    frame++;

    // Anything fast entering the stands sends spectators flying
    for (const imp of impactors) {
      if (Math.hypot(imp.x, imp.z) < 126) continue; // not near the stands
      for (const p of seats) {
        if (p.state !== 'alive') continue;
        const dx = p.x - imp.x, dy = p.y - imp.y, dz = p.z - imp.z;
        const reach = imp.radius + 1.3;
        if (Math.abs(dy) > 3.4 || dx * dx + dz * dz > reach * reach) continue;
        const d = Math.max(Math.hypot(dx, dz), 0.5);
        const push = Math.max(imp.speed * 0.55, 9);
        p.state = 'flying';
        p.vx = (dx / d) * push + imp.vx * 0.4 + (Math.random() - 0.5) * 6;
        p.vz = (dz / d) * push + imp.vz * 0.4 + (Math.random() - 0.5) * 6;
        p.vy = 9 + Math.random() * 7 + imp.speed * 0.18;
        p.tumble = Math.random() * Math.PI * 2;
        burst(p.x, p.y, p.z);
        crowdHits++;
        document.dispatchEvent(new CustomEvent('crowd-hit', { detail: crowdHits }));
      }
    }

    const half = frame % 2; // seated crowd bobs at half rate (invisible, halves the cost)
    for (let j = 0; j < seats.length; j++) {
      const p = seats[j];
      if (p.state === 'alive') {
        if (j % 2 === half) continue;
        const bob = Math.sin(time * 2.2 + p.phase) * p.amp + Math.sin(time * 0.9 + p.x * 0.04) * 0.05;
        crowdM.makeTranslation(p.x, p.y + bob, p.z);
        bodies.setMatrixAt(j, crowdM);
        crowdM.makeTranslation(p.x, p.y + 0.66 + bob * 1.2, p.z);
        heads.setMatrixAt(j, crowdM);
      } else if (p.state === 'flying') {
        p.vy -= 26 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.tumble += dt * 11;
        if (p.y < 0.2 && p.vy < 0) {
          p.state = 'dead';
          p.deadUntil = time + 16 + Math.random() * 12;
        }
        crowdQ.setFromEuler(crowdE.set(p.tumble, p.tumble * 0.6, p.tumble * 0.3));
        crowdM.compose(new THREE.Vector3(p.x, p.y, p.z), crowdQ, ONE);
        bodies.setMatrixAt(j, crowdM);
        crowdM.compose(new THREE.Vector3(p.x, p.y + 0.66, p.z), crowdQ, ONE);
        heads.setMatrixAt(j, crowdM);
      } else {
        // dead: hidden until they sheepishly retake their seat
        if (time > p.deadUntil) {
          p.state = 'alive';
          p.x = p.homeX; p.y = p.homeY; p.z = p.homeZ;
        } else {
          crowdM.compose(ZERO, crowdQ.identity(), ZERO);
          bodies.setMatrixAt(j, crowdM);
          heads.setMatrixAt(j, crowdM);
        }
      }
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;

    // Floor runners: wander, flee, get launched
    for (let j = 0; j < RUNNERS; j++) {
      const p = runners[j];
      if (p.state === 'alive') {
        // nearest ground-level threat
        let threat = null, threatD = 1 / 0;
        for (const imp of impactors) {
          if (Math.abs(imp.y - 1.2) > 3.2) continue; // airborne threats can't stomp
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
        // staggered obstacle probe (a third of the crowd per frame)
        if (p.speed > 0.5 && (frame + j) % 3 === 0 && blockedAhead(nx, nz)) {
          p.dir += 1.4 + Math.random();
        } else {
          p.x = nx;
          p.z = nz;
        }
        const rad = Math.hypot(p.x, p.z);
        const lim = 121;
        if (rad > lim) { p.x *= lim / rad; p.z *= lim / rad; p.dir += Math.PI * 0.6; }

        // stomped?
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
          const lean = p.speed > 5 ? 0.32 : 0.06; // sprinters lean into the run
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

  return { drivables, bounds: 124, update };
}
