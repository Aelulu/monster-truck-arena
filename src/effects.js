import * as THREE from 'three';

const COUNT = 90;

// Two-tone flame gradient by remaining life t (1 = just spawned, 0 = dead).
// Additive blending means black = invisible, so dead particles cost nothing.
function flameColor(t, out) {
  if (t <= 0) {
    out[0] = out[1] = out[2] = 0;
  } else if (t > 0.6) {
    const k = (t - 0.6) / 0.4; // white-yellow core
    out[0] = 1; out[1] = 0.6 + 0.35 * k; out[2] = 0.15 + 0.45 * k;
  } else {
    const k = t / 0.6; // orange tail fading to dark red
    out[0] = k; out[1] = 0.45 * k * k; out[2] = 0.02 * k;
  }
}

// Fire that blasts out of the back of the truck while boosting.
// Lives in the truck root's local space so it tracks the truck through
// jumps and flips; particles stream backwards (-X = behind the truck).
export class BoostFlames {
  constructor(parent) {
    this.particles = Array.from({ length: COUNT }, () => ({
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      life: 0,
      maxLife: 1,
    }));
    this.positions = new Float32Array(COUNT * 3);
    this.colors = new Float32Array(COUNT * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(this.geometry, new THREE.PointsMaterial({
      size: 0.55,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    this.points.frustumCulled = false;
    parent.add(this.points);

    // warm glow on the ground behind the truck while boosting
    this.light = new THREE.PointLight(0xff7722, 0, 14);
    this.light.position.set(-3.2, 1.2, 0);
    parent.add(this.light);

    this.exhausts = [new THREE.Vector3(-2.5, 1.1, 0.55), new THREE.Vector3(-2.5, 1.1, -0.55)];
    this.cursor = 0;
    this.emitAccum = 0;
    this.tmpColor = [0, 0, 0];
  }

  spawn() {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % COUNT;
    const exhaust = this.exhausts[this.cursor % 2];
    p.pos.copy(exhaust);
    p.pos.x += (Math.random() - 0.5) * 0.15;
    p.pos.y += (Math.random() - 0.5) * 0.15;
    p.pos.z += (Math.random() - 0.5) * 0.15;
    p.vel.set(-8 - Math.random() * 4, (Math.random() - 0.3) * 1.2, (Math.random() - 0.5) * 1.6);
    p.maxLife = 0.22 + Math.random() * 0.2;
    p.life = p.maxLife;
  }

  update(dt, boosting) {
    if (boosting) {
      this.emitAccum += dt * 140;
      while (this.emitAccum >= 1) {
        this.emitAccum -= 1;
        this.spawn();
      }
    }
    this.light.intensity = THREE.MathUtils.lerp(this.light.intensity, boosting ? 4 : 0, Math.min(1, dt * 12));

    for (let i = 0; i < COUNT; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        p.life -= dt;
        p.pos.addScaledVector(p.vel, dt);
        p.vel.y += 2.0 * dt; // flames curl upward as they die
      }
      const t = Math.max(p.life / p.maxLife, 0);
      const i3 = i * 3;
      this.positions[i3] = p.pos.x;
      this.positions[i3 + 1] = p.pos.y;
      this.positions[i3 + 2] = p.pos.z;
      flameColor(t, this.tmpColor);
      this.colors[i3] = this.tmpColor[0];
      this.colors[i3 + 1] = this.tmpColor[1];
      this.colors[i3 + 2] = this.tmpColor[2];
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}
