// Merged keyboard + gamepad input.
//
// Keyboard: W/S drive (pitch in air), A/D steer, Space jump, Shift boost,
//           L switch truck, R reset
// Xbox controller (standard mapping — also works for PS):
//   left stick drive & steer (pitch in air) · LT or RT boost (fire!)
//   A jump · RB or d-pad switch truck · Y reset
//
// Call input.update() once per frame, then read the fields.
class Input {
  constructor() {
    this.keys = new Set();
    this.jumpQueued = false;
    this.resetQueued = false;

    // Merged per-frame values
    this.throttle = 0; // 1 forward, -1 reverse
    this.steer = 0;    // 1 left, -1 right
    this.pitch = 0;    // 1 nose-down, -1 nose-up (air control)
    this.boost = false;

    this.prevButtons = [];

    this.cycleQueued = 0;   // +1/-1 = next/previous truck
    this.selectQueued = null; // 0-based truck index from number keys

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') {
        this.jumpQueued = true;
        e.preventDefault();
      }
      if (e.code === 'KeyR') this.resetQueued = true;
      if (e.code === 'KeyL' || e.code === 'KeyT') this.cycleQueued += 1;
      const num = /^Digit([1-9])$/.exec(e.code);
      if (num) this.selectQueued = Number(num[1]) - 1;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    this.padConnected = false;

    // Haptics: thump on impacts (fired as DOM events by world/characters)
    document.addEventListener('crowd-hit', () => this.rumble(0.55, 0.9, 130));
    document.addEventListener('character-hit', () => this.rumble(1.0, 0.7, 280));
  }

  // Dual-rumble if the connected pad supports it (Chrome: Xbox/PS pads do).
  // strong = low-frequency motor, weak = high-frequency motor.
  rumble(strong, weak, durationMs) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (p && p.connected && p.vibrationActuator) {
        p.vibrationActuator.playEffect('dual-rumble', {
          duration: durationMs,
          strongMagnitude: strong,
          weakMagnitude: weak,
        }).catch(() => {});
        return;
      }
    }
  }

  // Chrome exposes gamepads through polling; the connect event alone isn't
  // reliable (it can fire before the page has focus, or not at all until a
  // button press). Scan every frame and use the first live pad.
  findGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) {
      if (p && p.connected) { pad = p; break; }
    }
    if (!!pad !== this.padConnected) {
      this.padConnected = !!pad;
      if (pad) {
        console.log('Controller active:', pad.id, '| mapping:', pad.mapping || 'non-standard');
        this.rumble(0.4, 0.6, 200); // hello-there pulse so they know it took
      }
      document.dispatchEvent(new CustomEvent('controller-status', {
        detail: { connected: this.padConnected, id: pad ? pad.id : '' },
      }));
    }
    return pad;
  }

  update() {
    // --- Keyboard ---
    let throttle = 0, steer = 0, boost = false;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) throttle += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) throttle -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) steer += 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) steer -= 1;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) boost = true;
    let pitch = throttle; // W = nose down in the air, like RL keyboard

    // --- Gamepad (polled — the Gamepad API gives snapshots, not events) ---
    const pad = this.findGamepad();
    if (pad) {
      const dead = (v) => (Math.abs(v) < 0.12 ? 0 : v);
      throttle += -dead(pad.axes[1] ?? 0);    // stick forward = drive
      steer += -dead(pad.axes[0] ?? 0);       // stick right = steer right
      pitch += -dead(pad.axes[1] ?? 0);       // in the air, same stick pitches
      const rt = pad.buttons[7]?.value ?? 0;  // triggers = boost
      const lt = pad.buttons[6]?.value ?? 0;
      if (rt > 0.3 || lt > 0.3) boost = true;

      const pressedNow = (i) => pad.buttons[i]?.pressed && !this.prevButtons[i];
      if (pressedNow(0)) this.jumpQueued = true;    // A / Cross
      if (pressedNow(3)) this.resetQueued = true;   // Y / Triangle
      if (pressedNow(5)) this.cycleQueued += 1;     // RB — next truck
      if (pressedNow(15)) this.cycleQueued += 1;    // d-pad right — next truck
      if (pressedNow(14)) this.cycleQueued -= 1;    // d-pad left — previous truck
      this.prevButtons = pad.buttons.map((b) => b.pressed);
    }

    const clamp = (v) => Math.max(-1, Math.min(1, v));
    this.throttle = clamp(throttle);
    this.steer = clamp(steer);
    this.pitch = clamp(pitch);
    this.boost = boost;
  }

  consumeCycle() {
    const c = this.cycleQueued;
    this.cycleQueued = 0;
    return c;
  }

  consumeSelect() {
    const s = this.selectQueued;
    this.selectQueued = null;
    return s;
  }

  consumeJump() {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  consumeReset() {
    const r = this.resetQueued;
    this.resetQueued = false;
    return r;
  }
}

export const input = new Input();
