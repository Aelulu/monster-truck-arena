import * as THREE from 'three';

// Giant Rocket League-style ball. Bounces around the arena (including off
// ramps), rebounds off the stadium wall, and trucks punt it on contact —
// hit it at speed or while boosting for big shots. Press R to reset it
// along with the truck.
const RADIUS = 5;
const RESTITUTION = 0.68;
const GRAVITY = -26;

export class Ball {
  constructor(scene) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9fb6cc,
      roughness: 0.35,
      metalness: 0.25,
      flatShading: true,
      emissive: 0x22384d,
      emissiveIntensity: 0.35,
    });
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(RADIUS, 2), mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    const seams = new THREE.Mesh(
      new THREE.IcosahedronGeometry(RADIUS * 1.003, 1),
      new THREE.MeshBasicMaterial({ color: 0x2e5878, wireframe: true, transparent: true, opacity: 0.55 })
    );
    this.mesh.add(seams);
    scene.add(this.mesh);

    this.vel = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.down = new THREE.Vector3(0, -1, 0);
    this.spinAxis = new THREE.Vector3(1, 0, 0);
    this.reset();
  }

  reset() {
    this.mesh.position.set(0, RADIUS + 10, 30);
    this.vel.set(0, 0, 0);
  }

  update(dt, truck, drivables, bounds, solids = null) {
    const p = this.mesh.position;
    this.vel.y += GRAVITY * dt;
    p.addScaledVector(this.vel, dt);

    // Ground & ramps: bounce off whatever surface is underneath
    const origin = p.clone();
    origin.y += 80;
    this.raycaster.set(origin, this.down);
    this.raycaster.far = 300;
    const hits = this.raycaster.intersectObjects(drivables, false);
    let groundY = 0;
    const normal = new THREE.Vector3(0, 1, 0);
    if (hits.length) {
      // highest surface at-or-below the ball, so it can roll under the highway
      const hit = hits.find((h) => h.point.y <= p.y + 1) ||
        hits.find((h) => h.point.y <= p.y + 8) || hits[hits.length - 1];
      groundY = hit.point.y;
      normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    }
    if (p.y - RADIUS < groundY) {
      p.y = groundY + RADIUS;
      const vn = this.vel.dot(normal);
      if (vn < 0) this.vel.addScaledVector(normal, -(1 + RESTITUTION) * vn);
      // rolling resistance while touching down
      this.vel.x -= this.vel.x * 0.45 * dt;
      this.vel.z -= this.vel.z * 0.45 * dt;
      if (Math.abs(this.vel.y) < 1.4) this.vel.y = 0; // settle instead of micro-bouncing
    }

    // Open bowl: the ball rolls up into the stands like everything else;
    // only the outer stadium rim reflects it back into play.
    const rad = Math.hypot(p.x, p.z);
    const limit = 164;
    if (rad > limit) {
      const nx = p.x / rad, nz = p.z / rad;
      p.x = nx * limit;
      p.z = nz * limit;
      const vr = this.vel.x * nx + this.vel.z * nz;
      if (vr > 0) {
        this.vel.x -= (1 + RESTITUTION) * vr * nx;
        this.vel.z -= (1 + RESTITUTION) * vr * nz;
      }
    }

    // solid buildings (city): bounce off walls
    if (solids) {
      for (const b of solids) {
        if (p.y - RADIUS > b.h) continue;
        const pad = RADIUS * 0.8;
        if (p.x > b.minX - pad && p.x < b.maxX + pad && p.z > b.minZ - pad && p.z < b.maxZ + pad) {
          const dxl = p.x - (b.minX - pad), dxr = (b.maxX + pad) - p.x;
          const dzl = p.z - (b.minZ - pad), dzr = (b.maxZ + pad) - p.z;
          const mn = Math.min(dxl, dxr, dzl, dzr);
          if (mn === dxl) { p.x = b.minX - pad; if (this.vel.x > 0) this.vel.x *= -RESTITUTION; }
          else if (mn === dxr) { p.x = b.maxX + pad; if (this.vel.x < 0) this.vel.x *= -RESTITUTION; }
          else if (mn === dzl) { p.z = b.minZ - pad; if (this.vel.z > 0) this.vel.z *= -RESTITUTION; }
          else { p.z = b.maxZ + pad; if (this.vel.z < 0) this.vel.z *= -RESTITUTION; }
        }
      }
    }

    // Truck punt: sphere-vs-sphere with the truck's velocity behind it
    const tp = truck.root.position;
    const delta = new THREE.Vector3(p.x - tp.x, p.y - (tp.y + 1.3), p.z - tp.z);
    const dist = delta.length();
    const minDist = RADIUS + 2.6;
    if (dist < minDist && dist > 1e-4) {
      const n = delta.divideScalar(dist);
      p.set(tp.x, tp.y + 1.3, tp.z).addScaledVector(n, minDist);
      const truckVel = new THREE.Vector3(Math.cos(truck.heading), 0, -Math.sin(truck.heading))
        .multiplyScalar(truck.speed);
      truckVel.y = truck.verticalVel;
      const along = truckVel.sub(this.vel).dot(n);
      if (along > 0) {
        const power = truck.boosting ? 1.6 : 1.15;
        this.vel.addScaledVector(n, along * power + 3);
        this.vel.y += Math.max(4, along * 0.35); // satisfying pop-up
        if (typeof document !== 'undefined') {
          document.dispatchEvent(new CustomEvent('ball-punt', { detail: along }));
        }
      }
    }

    // Roll visually with horizontal motion
    const hv = Math.hypot(this.vel.x, this.vel.z);
    if (hv > 0.01) {
      this.spinAxis.set(this.vel.z, 0, -this.vel.x).normalize();
      this.mesh.rotateOnWorldAxis(this.spinAxis, (hv * dt) / RADIUS);
    }
  }
}
