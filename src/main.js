import * as THREE from 'three';
import { input } from './input.js?v1784502057';
import { buildWorld } from './world.js?v1784502057';
import { buildCity } from './city.js?v1784502057';
import { buildRoom } from './room.js?v1784502057';
import { Truck } from './truck.js?v1784502057';
import { Garage } from './garage.js?v1784502057';
import { BoostFlames } from './effects.js?v1784502057';
import { Ball } from './ball.js?v1784502057';
import { loadCharacters } from './characters.js?v1784502057';
import { audio } from './audio.js?v1784502057'; // synthesized engine + crash sounds

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
const MAP_ORDER = ['arena', 'city', 'room'];
const qp = new URLSearchParams(location.search).get('map');
const mapName = MAP_ORDER.includes(qp) ? qp : 'arena';
const builders = { arena: buildWorld, city: buildCity, room: buildRoom };
const { drivables, bounds, solids = [], update: updateWorld } = builders[mapName](scene);
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    location.search = '?map=' + MAP_ORDER[(MAP_ORDER.indexOf(mapName) + 1) % MAP_ORDER.length];
  }
});
const garage = new Garage();
await garage.init();
const truck = new Truck();
const SPAWNS = { arena: [0, 0], city: [0, -70], room: [0, 0] };
truck.spawn.set(SPAWNS[mapName][0], 0, SPAWNS[mapName][1]);
truck.reset();
scene.add(truck.root);
const flames = new BoostFlames(truck.root);
const ball = new Ball(scene);
const characters = await loadCharacters(scene, mapName);

// --- HUD ---
const speedEl = document.getElementById('speed-value');
const airtimeEl = document.getElementById('airtime');
const truckNameEl = document.getElementById('truck-name');
// TEMP DIAGNOSTIC: surface script errors + raw gamepad state on the HUD
const diagEl = document.createElement('div');
diagEl.style.cssText = 'position:fixed;top:6px;left:8px;font:11px monospace;color:#ffee99;text-shadow:0 1px 3px #000;z-index:99;white-space:pre;pointer-events:none;';
document.getElementById('hud').appendChild(diagEl);
window.addEventListener('error', (e) => { diagEl.textContent += `\nERROR: ${e.message}`; });
let diagTicks = 0;
setInterval(() => {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : null;
  const desc = pads === null ? 'getGamepads API MISSING'
    : pads.map((g, i) => g ? `${i}:${g.id.slice(0, 28)} conn=${g.connected} map=${g.mapping || 'none'} btns=${g.buttons.length}` : `${i}:empty`).join(' | ');
  diagEl.textContent = `loop=${diagTicks} pads=[${desc}]` + (diagEl.textContent.includes('ERROR') ? '\n' + diagEl.textContent.split('\n').slice(1).join('\n') : '');
}, 1000);

// Controller UX: browsers hide gamepads until a button is pressed, so show
// a standing prompt, then a named confirmation once one wakes up.
const padEl = document.getElementById('controller-status');
padEl.textContent = '🎮 got a controller? press any button on it to connect';
padEl.style.color = '#ffd24a';
document.addEventListener('controller-status', (e) => {
  const { connected, id } = e.detail || {};
  if (connected) {
    const name = (id || 'controller').split('(')[0].trim() || 'controller';
    padEl.textContent = `🎮 ${name} connected`;
    padEl.style.color = '#7fe07f';
    clearTimeout(padEl._fade);
    padEl._fade = setTimeout(() => { padEl.style.opacity = '0.45'; }, 5000);
    padEl.style.opacity = '1';
  } else {
    padEl.textContent = '🎮 controller disconnected — press any button to reconnect';
    padEl.style.color = '#ff8a80';
    padEl.style.opacity = '1';
  }
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

  diagTicks++;
  input.update(); // polls gamepad state each frame

  const select = input.consumeSelect();
  const cycle = input.consumeCycle();
  if (select !== null) switchTruck(select);
  else if (cycle) switchTruck(garage.index + cycle);

  if (input.resetQueued) ball.reset(); // R resets ball along with truck
  truck.update(dt, input, drivables, bounds, solids);
  ball.update(dt, truck, drivables, bounds, solids);
  for (const c of characters) c.update(dt, truck, ball, drivables, solids);
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
