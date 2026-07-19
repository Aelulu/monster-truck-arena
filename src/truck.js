import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------------------------------------------------------------------------
// Model loading. Any .glb dropped in assets/trucks/ is loaded as-is —
// auto-scaled, auto-grounded, nose auto-guessed from the model's long axis,
// wheels auto-detected so they roll and steer. Per-model overrides live in
// assets/trucks/trucks.json (rotationYDeg, targetLength, lift, wheelNodes).
// The meshes and materials themselves are never altered.
// ---------------------------------------------------------------------------

const DEFAULTS = { targetLength: 5.5, lift: 0 };
const UP = new THREE.Vector3(0, 1, 0);

// Exact world-space bounds from vertex data. Box3.setFromObject transforms
// each mesh's axis-aligned LOCAL box instead, which balloons under rotated
// FBX transform chains — that made trucks float above the ground and put
// wheel pivots off-center (wheels orbiting instead of spinning).
export function tightBox(object) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  object.updateWorldMatrix(true, true);
  object.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      box.expandByPoint(v);
    }
  });
  return box;
}

// A node is wheel-shaped if its bounding box is a vertical disc (two similar
// large dims, one thinner horizontal dim = the axle), sits in the lower half
// of the model, and has a plausible tire diameter for the truck's size.
function wheelShape(box, modelLength, modelMidY) {
  const s = box.getSize(new THREE.Vector3());
  const dims = [['x', s.x], ['y', s.y], ['z', s.z]].sort((a, b) => b[1] - a[1]);
  const [d0, d1, d2] = dims.map((d) => d[1]);
  const axleAxis = dims[2][0];
  if (axleAxis === 'y') return null;                        // lying flat — not a wheel
  if (d1 / d0 < 0.75) return null;                          // not round
  if (d2 / d0 > 0.9) return null;                           // as thick as it is tall — a box
  if (box.getCenter(new THREE.Vector3()).y > modelMidY) return null;
  if (d0 < 0.15 * modelLength || d0 > 0.5 * modelLength) return null;
  return { axleAxis, diameter: d0 };
}

// Finds four wheel-shaped nodes, one per corner (front/back × left/right).
function autoDetectWheels(visual, modelBox) {
  const size = modelBox.getSize(new THREE.Vector3());
  const center = modelBox.getCenter(new THREE.Vector3());
  const modelLength = Math.max(size.x, size.z);
  const lengthAxis = size.x >= size.z ? 'x' : 'z';
  const sideAxis = lengthAxis === 'x' ? 'z' : 'x';

  const candidates = [];
  const visit = (node) => {
    if (node !== visual) {
      const box = tightBox(node);
      if (!box.isEmpty()) {
        const shape = wheelShape(box, modelLength, center.y);
        if (shape) {
          candidates.push({ node, box, ...shape });
          return; // a wheel's children are part of it — don't descend
        }
      }
    }
    for (const child of [...node.children]) visit(child);
  };
  visit(visual);

  // One candidate per corner; prefer the biggest (tire over brake disc).
  const corners = new Map();
  for (const c of candidates) {
    const p = c.box.getCenter(new THREE.Vector3()).sub(center);
    const key = `${p[lengthAxis] > 0}|${p[sideAxis] > 0}`;
    if (!corners.has(key) || corners.get(key).diameter < c.diameter) corners.set(key, c);
  }
  if (corners.size !== 4) {
    console.warn(`Wheel auto-detect: found ${corners.size}/4 corners — wheels won't animate. ` +
      'Set "wheelNodes" for this truck in trucks.json.');
    return [];
  }
  return [...corners.values()];
}

// Wraps a wheel node in a pivot Group placed at the wheel's center, so it can
// rotate in place (many exporters bake mesh positions into geometry, which
// leaves the node's own origin at 0,0,0 — unusable as a spin axis).
// Pivot rotation order YXZ = steer (Y) applied outside the roll.
function rigWheels(rawWheels, modelBox, noseDir, visual) {
  const modelCenter = modelBox.getCenter(new THREE.Vector3());

  // Group fragments by corner. Every fragment in a corner is one wheel
  // assembly (tire + rim + hub pieces), and they must ALL spin around the
  // tire's axle — pivoting each fragment at its own bounding-box center
  // makes hub pieces orbit visibly off-axis ("clanky" wheels).
  const enriched = rawWheels.map(({ node, box }) => {
    const s = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    return {
      node, s, center,
      cornerKey: (center.x > modelCenter.x ? 'a' : 'b') + (center.z > modelCenter.z ? 'a' : 'b'),
    };
  });
  const anchors = new Map(); // corner -> the tire (tallest fragment)
  for (const w of enriched) {
    const a = anchors.get(w.cornerKey);
    if (!a || w.s.y > a.s.y) anchors.set(w.cornerKey, w);
  }

  // Plug each wheel with a dark core cylinder. Split-off wheels cut from a
  // continuous shell open seams into the hollow interior as they rotate —
  // the core makes those gaps read as tire rubber instead of see-through.
  const coreMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
  for (const anchor of new Set(anchors.values())) {
    const axleAxis = anchor.s.x < anchor.s.z ? 'x' : 'z';
    const width = (axleAxis === 'x' ? anchor.s.x : anchor.s.z) * 0.85;
    const geo = new THREE.CylinderGeometry(anchor.s.y * 0.46, anchor.s.y * 0.46, width, 18);
    if (axleAxis === 'x') geo.rotateZ(Math.PI / 2);
    else geo.rotateX(Math.PI / 2);
    const core = new THREE.Mesh(geo, coreMat);
    core.position.copy(anchor.center);
    visual.add(core);
  }

  return enriched.map((w) => {
    const anchor = anchors.get(w.cornerKey);
    const axleAxis = anchor.s.x < anchor.s.z ? 'x' : 'z';

    // Pivot goes directly under the model root, not the node's own parent —
    // FBX-style hierarchies carry rotations that would skew the spin axis.
    const pivot = new THREE.Group();
    pivot.rotation.order = 'YXZ';
    visual.add(pivot);
    pivot.position.copy(anchor.center);
    visual.updateMatrixWorld(true);
    pivot.attach(w.node); // keeps the wheel exactly where it is

    const axle = axleAxis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const spinSign = Math.sign(noseDir.dot(axle.cross(UP))) || 1;
    return {
      steerPivot: pivot,
      spinObj: pivot,
      spinAxis: axleAxis,
      spinSign,
      radius: anchor.s.y / 2,
      isFront: anchor.center.clone().sub(modelCenter).dot(noseDir) > 0,
    };
  });
}

// Loads a GLB and normalizes it for the game: nose along +X, scaled to
// targetLength, centered, resting on y=0, wheels rigged. Physics never
// needs per-model changes.
export async function loadTruckModel(url, config = {}) {
  const gltf = await new GLTFLoader().loadAsync(url);
  return prepareTruckVisual(gltf.scene, config);
}

// Pure normalization + rigging, separated from network loading so it can be
// tested headlessly (tools/test-trucks.mjs).
export function prepareTruckVisual(visual, config = {}) {
  const cfg = { ...DEFAULTS, ...config };
  visual.updateMatrixWorld(true);

  const modelBox = tightBox(visual);
  const modelSize = modelBox.getSize(new THREE.Vector3());
  const rotationY = cfg.rotationYDeg !== undefined
    ? THREE.MathUtils.degToRad(cfg.rotationYDeg)
    : (modelSize.z > modelSize.x ? -Math.PI / 2 : 0); // guess: nose on the long axis
  const noseDir = new THREE.Vector3(Math.cos(rotationY), 0, Math.sin(rotationY));

  // Rig wheels first, in raw model space, before any transforms
  let rawWheels;
  if (cfg.wheelNodes) {
    // Collect every node matching a listed name. Matching is loose on
    // purpose: GLTFLoader strips reserved characters from names (Rim_66.009
    // → Rim_66009) and renames duplicates (Wheel_FL → Wheel_FL_1, _2 …), and
    // split models have several same-named nodes per wheel.
    const wanted = cfg.wheelNodes.map((name) => ({
      name,
      clean: THREE.PropertyBinding.sanitizeNodeName(name),
    }));
    const found = new Set();
    rawWheels = [];
    visual.traverse((node) => {
      for (const w of wanted) {
        const match = node.name === w.name || node.name === w.clean ||
          node.name.startsWith(w.name + '_') || node.name.startsWith(w.clean + '_');
        if (match) {
          found.add(w.name);
          rawWheels.push({ node, box: tightBox(node) });
          return;
        }
      }
    });
    for (const w of wanted) {
      if (!found.has(w.name)) console.warn('Wheel node not found in model:', w.name);
    }
  } else {
    rawWheels = autoDetectWheels(visual, modelBox);
  }
  const wheels = rigWheels(rawWheels, modelBox, noseDir, visual);

  visual.rotation.y = rotationY;
  visual.updateMatrixWorld(true);
  const box = tightBox(visual);
  const size = box.getSize(new THREE.Vector3());
  const scale = cfg.targetLength / Math.max(size.x, size.z);
  visual.scale.setScalar(scale);
  for (const w of wheels) w.radius *= scale; // radii in world units for spin math
  box.copy(tightBox(visual));
  const center = box.getCenter(new THREE.Vector3());
  visual.position.x -= center.x;
  visual.position.z -= center.z;
  visual.position.y -= box.min.y - cfg.lift;
  visual.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    // Ripped/converted models often have flipped faces (see-through body
    // panels) and materials wrongly exported as alpha-blended, which breaks
    // depth sorting. Render both faces, and turn bogus blending into cutout.
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      m.side = THREE.DoubleSide;
      if (m.transparent && (m.opacity === undefined || m.opacity >= 0.95)) {
        m.transparent = false;
        m.alphaTest = 0.5;
        m.depthWrite = true;
      }
    }
  });

  return { visual, wheels };
}

// Placeholder truck used only when assets/trucks/ is empty.
export function buildPlaceholderTruck() {
  const visual = new THREE.Group();
  const wheels = [];

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.4, metalness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.7 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x90caf9, roughness: 0.1, metalness: 0.6 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.4, 2.6), bodyMat);
  body.position.y = 2.3;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 2.3), bodyMat);
  cabin.position.set(-0.4, 3.4, 0);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 2.0), glassMat);
  windshield.position.set(0.65, 3.4, 0);
  windshield.rotation.z = -0.25;
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 1.2), darkMat);
  chassis.position.y = 1.5;
  const bullbar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 2.4), darkMat);
  bullbar.position.set(2.3, 2.2, 0);
  visual.add(body, cabin, windshield, chassis, bullbar);

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.95 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xbdbdbd, roughness: 0.3, metalness: 0.8 });
  const wheelGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.9, 22);
  wheelGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.95, 14);
  hubGeo.rotateX(Math.PI / 2);

  for (const [x, z] of [[1.6, 1.5], [1.6, -1.5], [-1.6, 1.5], [-1.6, -1.5]]) {
    const pivot = new THREE.Group();
    pivot.rotation.order = 'YXZ';
    pivot.position.set(x, 1.1, z);
    const wheel = new THREE.Group();
    wheel.add(new THREE.Mesh(wheelGeo, wheelMat), new THREE.Mesh(hubGeo, hubMat));
    pivot.add(wheel);
    visual.add(pivot);
    wheels.push({ steerPivot: pivot, spinObj: wheel, spinAxis: 'z', spinSign: -1, radius: 1.1, isFront: x > 0 });
  }

  visual.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { visual, wheels };
}

const TUNING = {
  maxSpeed: 34,          // units/s forward
  maxReverse: 12,
  boostMaxSpeed: 52,
  acceleration: 26,
  boostAcceleration: 38, // works in the air too, like RL boost
  brakeForce: 48,
  drag: 0.7,             // passive slowdown per second (fraction of speed)
  steerSpeed: 1.9,       // radians/s at full grip
  jumpVelocity: 13,
  doubleJumpVelocity: 10,
  gravity: -26,          // floaty, RL-style hang time
  airControl: 0.6,       // fraction of yaw steering available mid-air
  airPitchSpeed: 3.4,    // radians/s — manual flips with stick/W/S
  flipDuration: 0.65,    // seconds for the double-jump front flip
  flipSpeedBoost: 6,     // dodge-style forward kick when flipping
  launchBoost: 1.7,      // ramp lips multiply climb rate into extra air time
  launchCap: 48,         // max launch velocity — apex ≈ 44 units off mega ramps
};

export class Truck {
  constructor() {
    this.root = new THREE.Group();
    this.visual = null;
    this.wheels = [];
    this.baseScaleY = 1;

    this.heading = 0;       // yaw, radians
    this.speed = 0;         // signed, along heading
    this.verticalVel = 0;
    this.grounded = true;
    this.airTime = 0;
    this.jumpsUsed = 0;
    this.airPitch = 0;      // nose-down rotation accumulated mid-air
    this.squash = 0;        // landing suspension animation
    this.boosting = false;

    this.raycaster = new THREE.Raycaster();
    this.down = new THREE.Vector3(0, -1, 0);
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.spawn = new THREE.Vector3();
    this.reset();
  }

  // Swap the visual model in place; driving state (position, speed) carries over.
  setModel(visual, wheels) {
    if (this.visual) this.root.remove(this.visual);
    this.visual = visual;
    this.wheels = wheels;
    this.baseScaleY = visual.scale.y;
    this.root.add(visual);
  }

  reset() {
    this.root.position.copy(this.spawn || new THREE.Vector3());
    this.heading = 0;
    this.speed = 0;
    this.verticalVel = 0;
    this.grounded = true;
    this.prevGroundY = undefined;
    this.climbRate = 0;
    this.jumpsUsed = 0;
    this.airPitch = 0;
    this.flipTimer = 0;
  }

  // Sample the surface under the truck. Cast from well above so ramps and
  // mounds are picked up. Returns { height, normal } or null over the void.
  sampleGround(drivables) {
    const origin = this.root.position.clone();
    origin.y += 30;
    this.raycaster.set(origin, this.down);
    this.raycaster.far = 100;
    const hits = this.raycaster.intersectObjects(drivables, false);
    if (!hits.length) return null;
    // Highest surface at-or-below the truck, so driving under the elevated
    // highway doesn't snap the truck onto its roadway. (Hits arrive sorted
    // top-down.) Falling from above still lands on the top surface.
    // Preference order: surface at wheel level; else a surface a short hop
    // above (climbing the banked ring from its low edge — without this the
    // truck slips underneath the road and is trapped under it); else the
    // lowest surface (driving under the elevated highway, gap > 8).
    const py = this.root.position.y;
    const hit = hits.find((h) => h.point.y <= py + 1.5) ||
      hits.find((h) => h.point.y <= py + 8) ||
      hits[hits.length - 1];
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    return { height: hit.point.y, normal };
  }

  update(dt, input, drivables, bounds, solids = null) {
    if (!this.visual) return;
    if (input.consumeReset()) this.reset();

    const throttle = input.throttle;
    const steer = input.steer;
    this.boosting = input.boost;

    // --- Longitudinal ---
    if (throttle !== 0 && this.grounded) {
      const pushingAgainstMotion = Math.sign(throttle) !== Math.sign(this.speed) && Math.abs(this.speed) > 0.5;
      const force = pushingAgainstMotion ? TUNING.brakeForce : TUNING.acceleration;
      this.speed += throttle * force * dt;
    }
    if (this.boosting) this.speed += TUNING.boostAcceleration * dt;
    this.speed -= this.speed * TUNING.drag * dt * (this.grounded ? 1 : 0.15);
    const topSpeed = this.boosting ? TUNING.boostMaxSpeed : Math.max(TUNING.maxSpeed, Math.abs(this.speed));
    this.speed = THREE.MathUtils.clamp(this.speed, -TUNING.maxReverse, topSpeed);

    // --- Steering (scales up from standstill, flips in reverse) ---
    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 8, 0, 1);
    const grip = this.grounded ? 1 : TUNING.airControl;
    this.heading += steer * TUNING.steerSpeed * speedFactor * Math.sign(this.speed || 1) * grip * dt;

    // --- Move ---
    const dir = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    this.root.position.addScaledVector(dir, this.speed * dt);
    // hard outer edge, past the back of the grandstands
    const p = this.root.position;
    const outer = Math.hypot(p.x, p.z);
    if (outer > 168) {
      // slide along the rim — never bleed speed here, or riding the high
      // banking line grinds the truck to a halt
      p.x *= 168 / outer;
      p.z *= 168 / outer;
    }

    // solid buildings (city map): push out along the smallest overlap axis
    if (solids) {
      for (const b of solids) {
        if (p.y > b.h - 1.2) continue; // on the roof is fine
        const m2 = 1.9;
        if (p.x > b.minX - m2 && p.x < b.maxX + m2 && p.z > b.minZ - m2 && p.z < b.maxZ + m2) {
          const dxl = p.x - (b.minX - m2), dxr = (b.maxX + m2) - p.x;
          const dzl = p.z - (b.minZ - m2), dzr = (b.maxZ + m2) - p.z;
          const mn = Math.min(dxl, dxr, dzl, dzr);
          if (mn === dxl) p.x = b.minX - m2;
          else if (mn === dxr) p.x = b.maxX + m2;
          else if (mn === dzl) p.z = b.minZ - m2;
          else p.z = b.maxZ + m2;
          this.speed *= 0.5; // crunch
        }
      }
    }

    // --- Vertical: follow terrain, or fall ---
    const surface = this.sampleGround(drivables);
    const groundY = surface ? surface.height : 0;

    // Track how fast the terrain is rising under us while grounded, so that
    // driving off a ramp edge converts climb rate into launch velocity.
    if (this.grounded) {
      const climb = THREE.MathUtils.clamp(
        this.prevGroundY === undefined ? 0 : (groundY - this.prevGroundY) / dt, -50, 60);
      // Peak-hold with fast decay: the lip of a curved ramp is its steepest
      // part, and plain smoothing undersold the launch right when it mattered.
      this.climbRate = Math.max(climb, (this.climbRate ?? 0) - 150 * dt);
    }
    this.prevGroundY = groundY;

    this.verticalVel += TUNING.gravity * dt;
    this.root.position.y += this.verticalVel * dt;

    // On tilted surfaces the physics point is the truck's center, so its
    // downhill side visually digs into the road. Ride height rises with
    // surface tilt to keep the whole truck above the surface.
    const lift = surface ? (1 - surface.normal.y) * 2.4 : 0;
    const effY = groundY + lift;
    if (this.grounded && this.verticalVel <= 0.01 && this.climbRate < 20 &&
        this.root.position.y > effY - 0.01 && this.root.position.y < effY + 1.3) {
      // planted: follow terrain downhill (banking, mound backsides) instead
      // of micro-detaching into the air every frame. Ramp lips still launch
      // because their climbRate is far above the threshold.
      this.root.position.y = effY;
      this.verticalVel = 0;
      if (surface) this.groundNormal.lerp(surface.normal, Math.min(1, dt * 25));
    } else if (this.root.position.y <= effY + 0.01 && this.verticalVel <= 0) {
      if (!this.grounded && this.airTime > 0.35) {
        this.squash = Math.min(1, this.airTime * 0.7); // landing thump
        if (typeof document !== 'undefined') {
          document.dispatchEvent(new CustomEvent('truck-landed', { detail: Math.min(1, this.airTime / 2.5) }));
        }
      }
      this.root.position.y = effY;
      this.verticalVel = 0;
      this.grounded = true;
      this.airTime = 0;
      this.jumpsUsed = 0;
      if (surface) this.groundNormal.lerp(surface.normal, Math.min(1, dt * 25));
    } else if (this.root.position.y > effY + 0.15) {
      if (this.grounded && this.climbRate > 6) {
        // Just left a ramp lip — launch, with extra hang time for tricks.
        const launch = Math.min(this.climbRate * TUNING.launchBoost, TUNING.launchCap);
        this.verticalVel = Math.max(this.verticalVel, launch);
        // Carry the ramp's nose-up attitude into the air (Rocket League
        // style): hold the launch angle instead of snapping flat, which
        // used to read as "flips forward and falls".
        this.airPitch = -Math.atan2(this.climbRate, Math.max(Math.abs(this.speed), 1));
        this.groundNormal.set(0, 1, 0); // tilt handed off to airPitch
      }
      this.grounded = false;
      this.airTime += dt;
      this.groundNormal.lerp(new THREE.Vector3(0, 1, 0), Math.min(1, dt * 2));
    }

    // --- Jump; second press mid-air = front flip (RL dodge style) ---
    if (input.consumeJump()) {
      if (this.grounded) {
        this.verticalVel = TUNING.jumpVelocity;
        this.grounded = false;
        this.jumpsUsed = 1;
      } else if (this.jumpsUsed < 2) {
        this.verticalVel = Math.max(this.verticalVel, 0) + TUNING.doubleJumpVelocity;
        this.jumpsUsed = 2;
        this.flipTimer = TUNING.flipDuration;
        this.speed += TUNING.flipSpeedBoost;
      }
    }

    // --- Air pitch control (flips!) / settle upright on the ground ---
    if (!this.grounded) {
      if (this.flipTimer > 0) {
        // scripted full front flip from the double jump
        this.flipTimer -= dt;
        this.airPitch += ((Math.PI * 2) / TUNING.flipDuration) * dt;
      }
      this.airPitch += input.pitch * TUNING.airPitchSpeed * dt;
      // Landing assist: on the way down, ease rotation to the nearest
      // wheels-down orientation (whole flips), stronger near the ground —
      // the truck almost always lands on its wheels.
      if (this.verticalVel < 0 && this.flipTimer <= 0) {
        const height = Math.max(this.root.position.y - groundY, 1);
        const target = Math.round(this.airPitch / (Math.PI * 2)) * Math.PI * 2;
        const assist = THREE.MathUtils.clamp(16 / height, 1, 8);
        this.airPitch += (target - this.airPitch) * Math.min(1, dt * assist);
      }
    } else {
      this.flipTimer = 0;
      // wrap so a completed flip settles forward, not by unwinding backwards;
      // fast decay = never stuck lying flipped on the ground
      const wrapped = THREE.MathUtils.euclideanModulo(this.airPitch + Math.PI, Math.PI * 2) - Math.PI;
      this.airPitch = THREE.MathUtils.lerp(wrapped, 0, Math.min(1, dt * 14));
    }

    // --- Orientation: face heading, tilt to slope, then apply air pitch ---
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
    const tiltQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.groundNormal);
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -this.airPitch);
    this.root.quaternion.copy(tiltQuat).multiply(yawQuat).multiply(pitchQuat);

    // --- Cosmetics: suspension squash, wheel roll, wheel steer ---
    this.squash = Math.max(0, this.squash - dt * 3);
    const s = 1 - Math.sin(this.squash * Math.PI) * 0.12;
    this.visual.scale.y = this.baseScaleY * s;

    for (const w of this.wheels) {
      w.spinObj.rotation[w.spinAxis] += w.spinSign * (this.speed / w.radius) * dt;
      if (w.isFront) {
        w.steerPivot.rotation.y = THREE.MathUtils.lerp(w.steerPivot.rotation.y, steer * 0.45, Math.min(1, dt * 10));
      }
    }
  }

  get speedMph() {
    return Math.abs(Math.round(this.speed * 2.4));
  }
}
