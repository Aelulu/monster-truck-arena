import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { tightBox } from './truck.js';

// Arena characters — they watch the truck from afar, sprint away when it
// closes in, and get launched (bursting collectibles) when run over.
//
// Two rig styles:
//  - 'skeleton' (Sonic, Woody): the model has bones, so running is animated
//    procedurally — thighs/calves swing a run cycle, arms pump (Sonic) or
//    flail in panic (Woody). Rotations are applied in world space and
//    converted into each bone's local frame, so any rig orientation works.
//  - 'rigid' (Buzz, Aliens): the model is a single unrigged prop, so it
//    runs with body language instead — leaning into the sprint, hopping,
//    rocking side to side. (Swap in a *rigged* model and set 'skeleton'
//    with a bone map to upgrade.)

const UP = new THREE.Vector3(0, 1, 0);
const WALL_LIMIT = 121;
const GLIDE_DUR = 2.2; // seconds per Buzz glide-hop

const WOODY_BONES = {
  thighL: /L_Thigh/, thighR: /R_Thigh/, calfL: /L_Calf/, calfR: /R_Calf/,
  armL: /L_UpperArm/, armR: /R_UpperArm/, foreL: /L_Forearm/, foreR: /R_Forearm/,
  spine: /Spine1/, head: /Head/,
};
const BUZZ_BONES = {
  thighL: /bip_hip_L/, thighR: /bip_hip_R/, calfL: /bip_knee_L/, calfR: /bip_knee_R/,
  armL: /bip_upperArm_L/i, armR: /bip_upperarm_R/i, foreL: /bip_lowerArm_L/i, foreR: /bip_lowerArm_R/i,
  spine: /bip_spine_1/, head: /bip_head/,
};

const CONFIGS = [
  {
    // NOTE: sonic-hd.glb LOOKS rigged (95 bones in the file) but none of its
    // meshes carry joint weights — the skeleton is orphaned, so bone
    // animation can't move the visible mesh. Rigid body-language sprint it
    // is; swap in a properly skinned Sonic to upgrade to rigStyle 'skeleton'.
    url: 'assets/sonic.glb',
    rigStyle: 'rigid',
    height: 3.2,
    homes: [[15, 10]],
    runSpeed: 13,      // fastest thing alive (in this arena, still catchable)
    fleeRadius: 32,
    facing: 0,
    collectible: 'rings',
    bones: {},
  },
  {
    url: 'assets/woody.glb',
    rigStyle: 'skeleton',
    height: 3.4,
    homes: [[-15, -15]],
    runSpeed: 8,
    fleeRadius: 30,
    facing: 0,
    collectible: 'coins',
    fleeSound: 'woody',
    armStyle: 'flail',
    bones: WOODY_BONES,
  },
  {
    // Woody's stunt double watches from the north stands
    url: 'assets/woody.glb',
    rigStyle: 'skeleton',
    height: 3.4,
    homes: [[0, 133], [-115, -66], [80, 108]],
    runSpeed: 7,
    fleeRadius: 26,
    facing: 0,
    collectible: 'coins',
    fleeSound: 'woody',
    armStyle: 'flail',
    radiusRange: [129, 164], // stays up in the bleacher ring
    rideTop: true,           // stands on TOP of the bleachers, not under them
    bones: WOODY_BONES,
  },
  {
    // KH3 Buzz — properly skinned biped rig, gets the full Woody treatment
    url: 'assets/buzz.glb',
    rigStyle: 'skeleton',
    height: 4.0,       // his bbox includes the wing pack, so this matches Woody visually
    homes: [[25, -42]],
    runSpeed: 9.5,     // falling with style
    fleeRadius: 30,
    facing: 0,
    collectible: 'stars',
    armStyle: 'pump',  // determined space-ranger run ('flail' for panic mode)
    armAmp: 1.6,       // extra arm swing
    fleeSound: 'buzz',
    canGlide: true,    // he has wings — panicked glide-hops when cornered
    bones: BUZZ_BONES,
  },
  {
    // Buzz's double patrols the south-east stands (no gliding up there)
    url: 'assets/buzz.glb',
    rigStyle: 'skeleton',
    height: 4.0,
    homes: [[94, -94], [-134, 0], [66, 117]],
    runSpeed: 8,
    fleeRadius: 26,
    facing: 0,
    collectible: 'stars',
    fleeSound: 'buzz',
    armStyle: 'pump',
    armAmp: 1.6,
    radiusRange: [129, 164],
    rideTop: true,
    bones: BUZZ_BONES,
  },
  {
    url: 'assets/alien.glb',
    rigStyle: 'rigid',
    height: 2.0,
    homes: [[-40, 15], [-45, 20], [-36, 21]], // they come in threes
    runSpeed: 6.5,
    fleeRadius: 26,
    facing: 0,
    collectible: 'orbs',
    bones: {},
  },
];

function lootParts(kind) {
  const gold = () => new THREE.MeshStandardMaterial({
    color: 0xffc93c, metalness: 0.85, roughness: 0.25, emissive: 0x9c6a00, emissiveIntensity: 0.4,
  });
  if (kind === 'rings') return { geo: new THREE.TorusGeometry(0.42, 0.12, 8, 18), mat: gold(), tilt: 0.3, spin: 6 };
  if (kind === 'coins') {
    const geo = new THREE.CylinderGeometry(0.45, 0.45, 0.09, 16);
    geo.rotateX(Math.PI / 2);
    return { geo, mat: gold(), tilt: 0, spin: 10 };
  }
  if (kind === 'stars') return {
    geo: new THREE.OctahedronGeometry(0.4),
    mat: new THREE.MeshStandardMaterial({ color: 0xb388ff, metalness: 0.4, roughness: 0.3, emissive: 0x5e35b1, emissiveIntensity: 0.7 }),
    tilt: 0.5, spin: 8,
  };
  // orbs — little green alien glow
  return {
    geo: new THREE.SphereGeometry(0.3, 10, 10),
    mat: new THREE.MeshStandardMaterial({ color: 0x7ed957, roughness: 0.4, emissive: 0x2e7d32, emissiveIntensity: 0.8 }),
    tilt: 0, spin: 4,
  };
}

export async function loadCharacters(scene) {
  const loader = new GLTFLoader();
  const gltfCache = new Map();
  const chars = [];
  for (const cfg of CONFIGS) {
    try {
      if (!gltfCache.has(cfg.url)) gltfCache.set(cfg.url, loader.loadAsync(cfg.url));
      const gltf = await gltfCache.get(cfg.url);
      for (const [x, z] of cfg.homes) {
        chars.push(new Character(
          scene, SkeletonUtils.clone(gltf.scene), gltf.animations, new THREE.Vector3(x, 0, z), cfg));
      }
    } catch (err) {
      console.warn('Character failed to load:', cfg.url, err);
    }
  }
  return chars;
}

const _wq = new THREE.Quaternion();
const _axisQ = new THREE.Quaternion();
const _lq = new THREE.Quaternion();
const _probeOrigin = new THREE.Vector3();
const _probeDown = new THREE.Vector3(0, -1, 0);
const _probeRay = new THREE.Raycaster();

// Height of the surface at (x, z), preferring surfaces at-or-below refY
// (so the elevated highway overhead doesn't count). 0 = open floor.
function surfaceHeightAt(x, z, refY, drivables) {
  _probeRay.set(_probeOrigin.set(x, refY + 8, z), _probeDown);
  _probeRay.far = 60;
  const hits = _probeRay.intersectObjects(drivables, false);
  if (!hits.length) return 0;
  const hit = hits.find((h) => h.point.y <= refY + 1.2) || hits[hits.length - 1];
  return hit.point.y;
}

export class Character {
  constructor(scene, visual, animations, home, cfg) {
    this.cfg = cfg;
    this.home = home;
    this.root = new THREE.Group();
    this.visual = visual;

    const box = tightBox(this.visual);
    this.visual.scale.setScalar(cfg.height / (box.max.y - box.min.y));
    const box2 = tightBox(this.visual);
    const c = box2.getCenter(new THREE.Vector3());
    this.visual.position.set(-c.x, -box2.min.y, -c.z);
    this.baseVisualY = this.visual.position.y;
    this.visual.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false; // skinned meshes cull wrong when moved
      }
    });
    this.root.add(this.visual);
    this.root.position.copy(home);
    scene.add(this.root);

    // Find the bones we animate — from the skin's actual skeleton, so we
    // never grab a same-named node that isn't bound to the mesh.
    this.bones = {};
    const candidates = new Set();
    this.visual.traverse((o) => {
      if (o.isSkinnedMesh && o.skeleton) for (const b of o.skeleton.bones) candidates.add(b);
    });
    for (const bone of candidates) {
      for (const [key, re] of Object.entries(cfg.bones)) {
        if (!this.bones[key] && re.test(bone.name)) {
          bone.userData.rest = bone.quaternion.clone();
          this.bones[key] = bone;
        }
      }
    }

    // Rigid limb pieces (split from fused meshes): hinge each at its
    // attachment point — arms at the inner-top (shoulder), feet at the top
    // (ankle/hip) — so they can swing like coarse bones.
    if (cfg.rigStyle === 'parts' && cfg.parts) {
      for (const [key, re] of Object.entries(cfg.parts)) {
        let node = null;
        this.visual.traverse((o) => { if (!node && re.test(o.name)) node = o; });
        if (!node) { console.warn('part not found:', re); continue; }
        const pbox = tightBox(node);
        const centerX = (pbox.min.x + pbox.max.x) / 2;
        const pivot = new THREE.Group();
        this.visual.add(pivot);
        if (key.startsWith('arm')) {
          const inner = Math.abs(pbox.min.x) < Math.abs(pbox.max.x) ? pbox.min.x : pbox.max.x;
          pivot.position.set(inner + Math.sign(centerX) * 0.06, pbox.max.y - 0.04, (pbox.min.z + pbox.max.z) / 2);
        } else {
          pivot.position.set(centerX, pbox.max.y, (pbox.min.z + pbox.max.z) / 2);
        }
        this.visual.updateMatrixWorld(true);
        pivot.attach(node);
        pivot.userData.rest = pivot.quaternion.clone();
        this.bones[key] = pivot;
      }
    }

    this.mixer = null;
    if (cfg.rigStyle === 'skeleton' && animations && animations.length) {
      this.mixer = new THREE.AnimationMixer(this.visual);
      this.mixer.clipAction(animations[0]).play();
      this.mixer.update(Math.random() * 3); // desync the idle loops
    }

    this.state = 'idle'; // idle | flee | flying | down
    this.bodyYaw = Math.random() * Math.PI * 2;
    this.dir = this.bodyYaw;
    this.speed = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.vel = new THREE.Vector3();
    this.tumble = new THREE.Vector3();
    this.time = 0;
    this.respawnAt = 0;
    this.glide = 0;
    this.hopV = 0;

    // collectible burst
    const COUNT = 20;
    const parts = lootParts(cfg.collectible);
    this.lootStyle = parts;
    this.loot = new THREE.InstancedMesh(parts.geo, parts.mat, COUNT);
    this.loot.frustumCulled = false;
    this.lootData = Array.from({ length: COUNT }, () => ({
      life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), rot: Math.random() * Math.PI,
    }));
    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < COUNT; i++) this.loot.setMatrixAt(i, hide);
    scene.add(this.loot);

    this.tmpQ = new THREE.Quaternion();
    this.tmpQ2 = new THREE.Quaternion();
    this.tmpM = new THREE.Matrix4();
  }

  resetBones() {
    for (const b of Object.values(this.bones)) {
      if (b.userData.rest) b.quaternion.copy(b.userData.rest);
    }
  }

  // rotate a bone by a world-space axis/angle, regardless of rig orientation
  rotWorld(bone, axis, angle) {
    _axisQ.setFromAxisAngle(axis, angle);
    bone.getWorldQuaternion(_wq);
    _lq.copy(_wq).invert().multiply(_axisQ).multiply(_wq);
    bone.quaternion.multiply(_lq);
  }

  lootBurst() {
    for (const l of this.lootData) {
      l.life = 1.5 + Math.random() * 0.6;
      l.p.copy(this.root.position).add(new THREE.Vector3(0, this.cfg.height * 0.6, 0));
      const a = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 6;
      l.v.set(Math.cos(a) * sp, 6 + Math.random() * 7, Math.sin(a) * sp);
    }
  }

  hit(impVel, impSpeed) {
    if (this.state === 'flying' || this.state === 'down') return;
    this.state = 'flying';
    this.glide = 0;
    this.hopV = 0;
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent('character-hit'));
    }
    this.vel.set(impVel.x * 0.8, 9 + impSpeed * 0.3, impVel.z * 0.8);
    this.tumble.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 12);
    this.lootBurst();
  }

  update(dt, truck, ball, drivables) {
    this.time += dt;
    const p = this.root.position;
    const cfg = this.cfg;

    const tx = truck.root.position.x, tz = truck.root.position.z;
    const dx = tx - p.x, dz = tz - p.z;
    const truckDist = Math.hypot(dx, dz);
    const truckLow = truck.root.position.y < 4;

    if (this.state === 'idle' || this.state === 'flee') {
      const threatened = truckDist < cfg.fleeRadius && truckLow && Math.abs(truck.speed) > 2;

      if (threatened) {
        if (this.state === 'idle' && this.cfg.fleeSound && typeof document !== 'undefined') {
          document.dispatchEvent(new CustomEvent('character-flee', { detail: this.cfg.fleeSound }));
        }
        this.state = 'flee';
        const away = Math.atan2(p.x - tx, p.z - tz);
        let turn = THREE.MathUtils.euclideanModulo(away - this.dir + Math.PI, Math.PI * 2) - Math.PI;
        this.dir += THREE.MathUtils.clamp(turn, -8 * dt, 8 * dt);
        const target = this.glide > 0 ? cfg.runSpeed * 1.7 : cfg.runSpeed;
        this.speed = THREE.MathUtils.lerp(this.speed, target, Math.min(1, dt * 5));
      } else {
        this.speed = THREE.MathUtils.lerp(this.speed, 0, Math.min(1, dt * 4));
        if (this.speed < 0.4 && this.state === 'flee') {
          this.state = 'idle';
          this.resetBones();
          this.visual.rotation.set(0, 0, 0);
          this.glide = 0;
          this.hopV = 0;
          p.y = 0;
        }
      }

      // Mario hops: quick ballistic jumps that carry him out of reach
      if (cfg.canHop && this.state === 'flee') {
        if (p.y > 0 || this.hopV > 0) {
          this.hopV -= 30 * dt;
          p.y = Math.max(0, p.y + this.hopV * dt);
          if (p.y === 0 && this.hopV < 0) this.hopV = 0;
        } else if (truckDist < 18 && Math.random() < dt * 1.4) {
          this.hopV = 14; // wahoo!
        }
      }

      // Buzz takes to the air: a low glide arc with a burst of speed
      if (cfg.canGlide && this.state === 'flee') {
        if (this.glide > 0) {
          this.glide -= dt;
          const prog = Math.min(1 - this.glide / GLIDE_DUR, 1);
          p.y = Math.sin(Math.PI * prog) * 3.4;
          if (this.glide <= 0) p.y = 0;
        } else if (truckDist < 14 && Math.random() < dt * 0.9) {
          this.glide = GLIDE_DUR; // to infinity!
        }
      }

      const nx = p.x + Math.sin(this.dir) * this.speed * dt;
      const nz = p.z + Math.cos(this.dir) * this.speed * dt;
      const airborne = this.glide > 0 || this.hopV > 0;
      const surfH = drivables ? surfaceHeightAt(nx, nz, cfg.rideTop ? 40 : p.y, drivables) : 0;
      if (!airborne && this.speed > 0.4 && drivables && surfH > p.y + 0.9) {
        // wall, ramp face, or too-tall step — bounce off, don't ghost through
        this.dir += 1.3 + Math.random() * 0.9;
      } else {
        p.x = nx;
        p.z = nz;
        // follow the surface (bowl slope, mounds) when not glide/hopping
        if (!airborne) p.y += (surfH - p.y) * Math.min(1, dt * 12);
      }
      const [rMin, rMax] = cfg.radiusRange || [0, WALL_LIMIT];
      const rad = Math.hypot(p.x, p.z);
      if (rad > rMax) {
        p.x *= rMax / rad;
        p.z *= rMax / rad;
        this.dir += Math.PI * 0.5; // bounce along the boundary
      } else if (rMin > 0 && rad < rMin && rad > 0.01) {
        p.x *= rMin / rad;
        p.z *= rMin / rad;
        this.dir += Math.PI * 0.5;
      }

      if (this.state === 'flee') {
        this.animateRun(dt);
        this.bodyYaw = this.dir + cfg.facing;
        this.root.rotation.set(0, this.bodyYaw, 0);
      } else {
        this.animateIdle(dt, dx, dz, truck, truckDist);
      }

      // --- run over / ball hit ---
      if (truckDist < 3.3 && truckLow && Math.abs(truck.speed) > 4) {
        const dirV = new THREE.Vector3(Math.cos(truck.heading), 0, -Math.sin(truck.heading)).multiplyScalar(truck.speed);
        this.hit(dirV, Math.abs(truck.speed));
      }
      const b = ball.mesh.position;
      if (Math.hypot(p.x - b.x, p.z - b.z) < 6.2 && b.y < cfg.height + 3 && ball.vel.length() > 6) {
        this.hit(ball.vel, ball.vel.length());
      }
    } else if (this.state === 'flying') {
      this.vel.y -= 26 * dt;
      p.addScaledVector(this.vel, dt);
      this.root.rotation.x += this.tumble.x * dt;
      this.root.rotation.y += this.tumble.y * dt;
      this.root.rotation.z += this.tumble.z * dt;
      const floor = drivables ? surfaceHeightAt(p.x, p.z, cfg.rideTop ? 40 : p.y, drivables) : 0;
      if (p.y < floor && this.vel.y < 0) {
        p.y = floor;
        this.state = 'down';
        this.respawnAt = this.time + 4;
      }
    } else if (this.time > this.respawnAt) {
      p.copy(this.home);
      this.root.rotation.set(0, this.bodyYaw, 0);
      this.resetBones();
      this.visual.rotation.set(0, 0, 0);
      this.visual.position.y = this.baseVisualY;
      this.state = 'idle';
      this.speed = 0;
    }

    this.updateLoot(dt);
  }

  animateRun(dt) {
    const cfg = this.cfg;
    this.phase += dt * (5 + this.speed * 0.75);
    const φ = this.phase;

    if (cfg.rigStyle === 'parts') {
      this.phase += dt * (3 + this.speed * 0.6); // extra tempo on top of the shared advance
      const right = new THREE.Vector3(-Math.cos(this.dir), 0, Math.sin(this.dir));
      const fwd = new THREE.Vector3(Math.sin(this.dir), 0, Math.cos(this.dir));
      const B = this.bones;
      this.resetBones();
      if (this.root.position.y > 0.05) {
        // mid-hop: arms thrown up, feet tucked
        if (B.armL) this.rotWorld(B.armL, fwd, 1.1);
        if (B.armR) this.rotWorld(B.armR, fwd, -1.1);
        if (B.footL) this.rotWorld(B.footL, right, -0.6);
        if (B.footR) this.rotWorld(B.footR, right, -0.6);
        this.visual.rotation.set(-0.14, 0, 0);
        this.visual.position.y = this.baseVisualY;
        return;
      }
      // stubby legs sprinting hard
      if (B.footL) this.rotWorld(B.footL, right, Math.sin(φ) * 1.15);
      if (B.footR) this.rotWorld(B.footR, right, -Math.sin(φ) * 1.15);
      // arms flailing — big overhead flapping out of phase plus fore/aft waves
      if (B.armL) {
        this.rotWorld(B.armL, fwd, 0.9 + Math.sin(φ * 1.8) * 1.1);
        this.rotWorld(B.armL, right, Math.sin(φ * 2.4) * 0.7);
      }
      if (B.armR) {
        this.rotWorld(B.armR, fwd, -0.9 - Math.sin(φ * 1.8 + 1.9) * 1.1);
        this.rotWorld(B.armR, right, Math.sin(φ * 2.4 + 1.1) * 0.7);
      }
      this.visual.rotation.set(0.22, 0, Math.sin(φ) * 0.15);
      this.visual.position.y = this.baseVisualY + Math.abs(Math.sin(φ)) * 0.22;
      return;
    }

    if (cfg.rigStyle === 'rigid') {
      if (this.root.position.y > 0.05) {
        // mid-jump: lean back into the arc, no waddle
        this.visual.rotation.set(-0.14, 0, 0);
        this.visual.position.y = this.baseVisualY;
        return;
      }
      // No skeleton — sell the sprint with body language: lean forward,
      // skip-hop with each stride, rock side to side.
      this.visual.rotation.set(0.2, 0, Math.sin(φ) * 0.17);
      this.visual.position.y = this.baseVisualY + Math.abs(Math.sin(φ)) * 0.2;
      return;
    }

    const right = new THREE.Vector3(-Math.cos(this.dir), 0, Math.sin(this.dir));
    const fwd = new THREE.Vector3(Math.sin(this.dir), 0, Math.cos(this.dir));
    const B = this.bones;

    if (this.glide > 0) {
      // superhero glide pose: arms spread like wings, legs trailing behind,
      // whole body pitched into the airstream with a gentle wobble
      this.resetBones();
      if (B.spine) this.rotWorld(B.spine, right, 0.55);
      if (B.armL) this.rotWorld(B.armL, fwd, 1.35);
      if (B.armR) this.rotWorld(B.armR, fwd, -1.35);
      if (B.thighL) this.rotWorld(B.thighL, right, -0.5);
      if (B.thighR) this.rotWorld(B.thighR, right, -0.5);
      this.visual.rotation.set(0, 0, Math.sin(this.time * 3.1) * 0.07);
      this.visual.position.y = this.baseVisualY;
      return;
    }
    this.visual.rotation.set(0, 0, 0);

    this.resetBones();
    if (B.spine) this.rotWorld(B.spine, right, 0.26 + Math.sin(φ * 2) * 0.05); // lean into it
    if (B.thighL) this.rotWorld(B.thighL, right, Math.sin(φ) * 0.85);
    if (B.thighR) this.rotWorld(B.thighR, right, -Math.sin(φ) * 0.85);
    if (B.calfL) this.rotWorld(B.calfL, right, -(1 - Math.cos(φ)) * 0.3);
    if (B.calfR) this.rotWorld(B.calfR, right, -(1 + Math.cos(φ)) * 0.3);

    if (cfg.armStyle === 'flail') {
      // arms overhead, waving wildly out of phase — full Woody panic
      if (B.armL) {
        this.rotWorld(B.armL, right, -1.4 + Math.sin(φ * 1.7) * 0.6);
        this.rotWorld(B.armL, fwd, Math.sin(φ * 2.3) * 0.55);
      }
      if (B.armR) {
        this.rotWorld(B.armR, right, -1.4 + Math.sin(φ * 1.7 + 2.1) * 0.6);
        this.rotWorld(B.armR, fwd, -Math.sin(φ * 2.3 + 1.3) * 0.55);
      }
      if (B.foreL) this.rotWorld(B.foreL, right, Math.sin(φ * 2.6) * 0.7);
      if (B.foreR) this.rotWorld(B.foreR, right, Math.sin(φ * 2.6 + 1.7) * 0.7);
    } else {
      // pumping arms, opposite phase to legs
      const amp = cfg.armAmp ?? 1;
      if (B.armL) this.rotWorld(B.armL, right, -Math.sin(φ) * 0.9 * amp);
      if (B.armR) this.rotWorld(B.armR, right, Math.sin(φ) * 0.9 * amp);
      if (B.foreL) this.rotWorld(B.foreL, right, -0.8 - Math.max(0, -Math.sin(φ)) * 0.5 * amp);
      if (B.foreR) this.rotWorld(B.foreR, right, -0.8 - Math.max(0, Math.sin(φ)) * 0.5 * amp);
    }

    // springy bounce in the stride
    this.visual.position.y = this.baseVisualY + Math.abs(Math.sin(φ)) * 0.14;
  }

  // Standing: play the model's idle (if any) and keep eyes on the truck.
  animateIdle(dt, dx, dz, truck, dist) {
    if (this.mixer) this.mixer.update(dt);
    else this.resetBones();
    this.visual.position.y = this.baseVisualY;
    if (this.cfg.rigStyle === 'rigid') {
      // idle bob so the props feel alive
      this.visual.rotation.set(0, 0, Math.sin(this.time * 1.6 + this.phase) * 0.03);
    }

    const targetYaw = Math.atan2(dx, dz) + this.cfg.facing;
    let dYaw = THREE.MathUtils.euclideanModulo(targetYaw - this.bodyYaw + Math.PI, Math.PI * 2) - Math.PI;
    this.bodyYaw += dYaw * Math.min(1, dt * 2.5);
    this.dir = this.bodyYaw - this.cfg.facing; // so fleeing starts off facing sensibly
    this.root.rotation.set(0, this.bodyYaw, 0);

    const head = this.bones.head;
    if (head) {
      const remaining = THREE.MathUtils.clamp(dYaw, -1.05, 1.05) * 0.9;
      const d = Math.max(dist, 0.001);
      const pitchUp = THREE.MathUtils.clamp(
        Math.atan2(truck.root.position.y + 1.2 - this.cfg.height * 0.85, d), -0.45, 0.75);
      const look = new THREE.Vector3(dx, 0, dz).normalize();
      const pitchAxis = look.cross(UP).normalize();
      const extraWorld = this.tmpQ.setFromAxisAngle(pitchAxis, pitchUp)
        .multiply(this.tmpQ2.setFromAxisAngle(UP, remaining));
      head.getWorldQuaternion(_wq);
      const localExtra = _lq.copy(_wq).invert().multiply(extraWorld).multiply(_wq);
      head.quaternion.multiply(localExtra);
    }
  }

  updateLoot(dt) {
    for (let i = 0; i < this.lootData.length; i++) {
      const l = this.lootData[i];
      if (l.life <= 0) continue;
      l.life -= dt;
      l.v.y -= 20 * dt;
      l.p.addScaledVector(l.v, dt);
      if (l.p.y < 0.45) { l.p.y = 0.45; l.v.y = Math.abs(l.v.y) * 0.5; }
      l.rot += dt * this.lootStyle.spin;
      const s = Math.min(1, l.life * 2.5);
      this.tmpM.compose(
        l.p,
        this.tmpQ.setFromEuler(new THREE.Euler(0, l.rot, this.lootStyle.tilt)),
        new THREE.Vector3(s, s, s)
      );
      this.loot.setMatrixAt(i, this.tmpM);
      if (l.life <= 0) {
        this.tmpM.makeScale(0, 0, 0);
        this.loot.setMatrixAt(i, this.tmpM);
      }
    }
    this.loot.instanceMatrix.needsUpdate = true;
  }
}
