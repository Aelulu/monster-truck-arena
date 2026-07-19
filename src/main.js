import * as THREE from 'three';
import { input } from './input.js';
import { buildWorld } from './world.js';
import { Truck } from './truck.js';
import { Garage } from './garage.js';
import { BoostFlames } from './effects.js';
import { Ball } from './ball.js';
import { loadCharacters } from './characters.js';
import { audio } from './audio.js'; // synthesized engine + crash sounds

// --- Renderer & scene ---
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
// 1.5x is visually near-identical to 2x retina but renders ~44% fewer pixels
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // soft shadows cost real GPU time
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e0);
scene.fog = new THREE.Fog(0x87b5e0, 120, 320);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);

// --- Lights ---
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x8a6236, 0.9));
const sun = new THREE.DirectionalLight(0xfff2d9, 1.6);
sun.position.set(60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
sun.shadow.camera.far = 300;
scene.add(sun);

// --- World & trucks ---
const { drivables, bounds, update: updateWorld } = buildWorld(scene);
const garage = new Garage();
await garage.init();
const truck = new Truck();
scene.add(truck.root);
const flames = new BoostFlames(truck.root);
const ball = new Ball(scene);
const characters = await loadCharacters(scene);

// --- HUD ---
const speedEl = document.getElementById('speed-value');
const airtimeEl = document.getElementById('airtime');
const truckNameEl = document.getElementById('truck-name');
const padEl = document.getElementById('controller-status');
document.addEventListener('controller-status', (e) => {
  padEl.textContent = e.detail ? '🎮 controller connected' : '';
});
const crowdEl = document.getElementById('crowd-hits');
document.addEventListener('crowd-hit', (e) => {
  crowdEl.textContent = `😱 CROWD HITS: ${e.detail}`;
});

let switching = false;
async function switchTruck(index) {
  if (switching) return;
  switching = true;
  const model = await garage.load(index);
  truck.setModel(model.visual, model.wheels);
  audio.setEnginePreset(model.engine);
  truckNameEl.textContent = garage.count > 1
    ? `${model.label}  ·  ${garage.index + 1}/${garage.count}`
    : model.label;
  switching = false;
}
await switchTruck(0);
document.getElementById('loading').remove();

// --- Chase camera: sits behind the truck's heading, eases into place ---
const camOffset = new THREE.Vector3();
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const behind = 14;
  const height = 6.5;
  camOffset.set(
    truck.root.position.x - Math.cos(truck.heading) * behind,
    truck.root.position.y + height,
    truck.root.position.z + Math.sin(truck.heading) * behind
  );
  const ease = 1 - Math.exp(-dt * 4);
  camera.position.lerp(camOffset, ease);
  camTarget.copy(truck.root.position).add(new THREE.Vector3(0, 2.5, 0));
  camera.lookAt(camTarget);

  // keep the sun's shadow frustum centered on the action
  sun.position.set(truck.root.position.x + 60, 90, truck.root.position.z + 40);
  sun.target.position.copy(truck.root.position);
  sun.target.updateMatrixWorld();
}

// --- Loop (capped at 60fps — 120Hz displays would double the GPU load) ---
const clock = new THREE.Clock();
let accum = 0;
function tick() {
  requestAnimationFrame(tick);
  accum += clock.getDelta();
  if (accum < 1 / 62) return; // not time for a frame yet
  const dt = Math.min(accum, 1 / 30); // clamp so tab-switch doesn't teleport
  accum = 0;

  input.update(); // polls gamepad state each frame

  const select = input.consumeSelect();
  const cycle = input.consumeCycle();
  if (select !== null) switchTruck(select);
  else if (cycle) switchTruck(garage.index + cycle);

  if (input.resetQueued) ball.reset(); // R resets ball along with truck
  truck.update(dt, input, drivables, bounds);
  ball.update(dt, truck, drivables, bounds);
  for (const c of characters) c.update(dt, truck, ball, drivables);
  flames.update(dt, truck.boosting);
  updateWorld(dt, [
    {
      x: truck.root.position.x, y: truck.root.position.y + 1, z: truck.root.position.z,
      vx: Math.cos(truck.heading) * truck.speed, vz: -Math.sin(truck.heading) * truck.speed,
      speed: Math.abs(truck.speed), radius: 3.2,
    },
    {
      x: ball.mesh.position.x, y: ball.mesh.position.y, z: ball.mesh.position.z,
      vx: ball.vel.x, vz: ball.vel.z,
      speed: ball.vel.length(), radius: 5,
    },
  ]);
  updateCamera(dt);

  audio.updateEngine({
    speedNorm: Math.min(Math.abs(truck.speed) / 38, 1.35),
    throttle: Math.abs(input.throttle),
    boost: truck.boosting,
  });

  speedEl.textContent = truck.speedMph;
  speedEl.style.color = truck.boosting ? '#ffb347' : '';
  airtimeEl.classList.toggle('show', !truck.grounded && truck.airTime > 0.6);

  renderer.render(scene, camera);
}
tick();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
