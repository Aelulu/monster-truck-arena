// Procedural crash sound effects via the Web Audio API — synthesized on the
// fly, no audio files. Listens for the same DOM events that drive haptics.
//
// Engine presets: each truck picks a recipe (trucks.json "engine" field) —
// oscillator mix, distortion drive, pitch range, exhaust — so every truck
// has its own voice.

// Character flee voice clips. Characters can have several variants — they
// alternate per scare. These bypass the master mix (straight to the output)
// so they're WAY louder than the engine and rev.
const FLEE_SOUNDS = {
  woody: {
    gain: 1.0,
    variants: [
      { url: 'assets/sounds/woody-scream.mp3', offset: 1.0 },
      { url: 'assets/sounds/woody-scream2.mp3', offset: 0 },
    ],
  },
  buzz: {
    gain: 0.95,
    maxDur: 4,
    variants: [{ url: 'assets/sounds/buzz-flee.mp3', offset: 0 }],
  },
};

const ENGINE_PRESETS = {
  // deep classic V8 (Grave Digger)
  bigblock:     { base: 42, range: 135, blip: 22, sub: 0.5,   osc1: 'sawtooth', osc2: 'square',   drive: 2.5, gain: 1.0,  filterBase: 280, exhaust: 1.0,  whine: 0 },
  // gritty V8 with a blower whine on top (Max-D)
  supercharged: { base: 40, range: 125, blip: 20, sub: 0.5,   osc1: 'sawtooth', osc2: 'square',   drive: 3.2, gain: 1.05, filterBase: 260, exhaust: 1.1,  whine: 0.6, whineRatio: 9 },
  // low lopey open-header hot rod (Bone Shaker)
  hotrod:       { base: 33, range: 110, blip: 26, sub: 0.5,   osc1: 'square',   osc2: 'square',   drive: 3.6, gain: 1.0,  filterBase: 240, exhaust: 1.35, whine: 0 },
  // angry high-strung dragster (American Graffiti)
  dragster:     { base: 52, range: 175, blip: 28, sub: 0.66,  osc1: 'sawtooth', osc2: 'sawtooth', drive: 4.0, gain: 1.0,  filterBase: 320, exhaust: 1.2,  whine: 0 },
  // smooth screaming race engine (McQueen — ka-chow)
  race:         { base: 72, range: 260, blip: 30, sub: 1.006, osc1: 'sawtooth', osc2: 'sawtooth', drive: 1.6, gain: 0.85, filterBase: 420, exhaust: 0.5,  whine: 0 },
};
// Browsers gate audio behind a user gesture, so the context unlocks on the
// first keypress/click and stays ready.
class GameAudio {
  constructor() {
    this.ctx = null;
    this.preset = ENGINE_PRESETS.bigblock;
    const unlock = () => this.ensure();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);

    document.addEventListener('character-hit', () => this.characterCrash());
    document.addEventListener('character-flee', (e) => this.fleeVoice(e.detail));
    document.addEventListener('crowd-hit', () => this.crowdThud());
    document.addEventListener('truck-landed', (e) => this.landing(e.detail ?? 0.5));
    document.addEventListener('ball-punt', (e) => this.punt(Math.min(1, (e.detail ?? 20) / 40)));
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate; // 1s of white noise, reused by every effect
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // real monster-truck recordings: moving-engine bed + rev burst
      fetch('assets/sounds/engine.mp3')
        .then((r) => r.arrayBuffer())
        .then((ab) => this.ctx.decodeAudioData(ab))
        .then((buf) => { this.engineBuf = buf; })
        .catch((e) => console.warn('engine sample failed to load:', e));
      fetch('assets/sounds/rev.mp3')
        .then((r) => r.arrayBuffer())
        .then((ab) => this.ctx.decodeAudioData(ab))
        .then((buf) => { this.revBuf = buf; })
        .catch((e) => console.warn('rev sample failed to load:', e));
      // character flee voice clips (all variants)
      this.fleeBufs = {};
      for (const [id, cfg] of Object.entries(FLEE_SOUNDS)) {
        this.fleeBufs[id] = [];
        cfg.variants.forEach((variant, i) => {
          fetch(variant.url)
            .then((r) => r.arrayBuffer())
            .then((ab) => this.ctx.decodeAudioData(ab))
            .then((buf) => { this.fleeBufs[id][i] = buf; })
            .catch((e) => console.warn(id + ' flee clip failed to load:', e));
        });
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  noise(dur, { type = 'lowpass', f0 = 800, f1 = 200, gain = 0.4 } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(f1, 30), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  tone(f0, f1, dur, { type = 'sine', gain = 0.3 } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // --- Engine: continuous synthesized V8, driven per-frame from the game ---
  // Two detuned oscillators (fundamental + sub-octave) through a soft-clip
  // waveshaper = growl; filtered noise = exhaust rumble; a bandpassed noise
  // jet fades in while boosting.
  startEngine() {
    const ctx = this.ensure();
    if (!ctx || this.engineOn) return;
    this.engineOn = true;

    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.shaper = ctx.createWaveShaper();
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 350;
    this.osc1.connect(this.engineGain);
    this.osc2.connect(this.engineGain);
    this.engineGain.connect(this.shaper).connect(this.engineFilter).connect(this.master);

    // supercharger whine layer (silent unless the preset uses it)
    this.whineOsc = ctx.createOscillator();
    this.whineOsc.type = 'sine';
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    this.whineOsc.connect(this.whineGain).connect(this.master);

    this.applyPreset();

    this.exhaust = ctx.createBufferSource();
    this.exhaust.buffer = this.noiseBuf;
    this.exhaust.loop = true;
    const exFilt = ctx.createBiquadFilter();
    exFilt.type = 'lowpass';
    exFilt.frequency.value = 120;
    this.exhaustGain = ctx.createGain();
    this.exhaustGain.gain.value = 0;
    this.exhaust.connect(exFilt).connect(this.exhaustGain).connect(this.master);

    this.jet = ctx.createBufferSource();
    this.jet.buffer = this.noiseBuf;
    this.jet.loop = true;
    this.jetFilter = ctx.createBiquadFilter();
    this.jetFilter.type = 'bandpass';
    this.jetFilter.frequency.value = 1000;
    this.jetFilter.Q.value = 0.8;
    this.jetGain = ctx.createGain();
    this.jetGain.gain.value = 0;
    this.jet.connect(this.jetFilter).connect(this.jetGain).connect(this.master);

    const t = ctx.currentTime;
    this.osc1.start(t);
    this.osc2.start(t);
    this.whineOsc.start(t);
    this.exhaust.start(t, Math.random());
    this.jet.start(t, Math.random());
  }

  // Character voice clip when they start running. Loud on purpose — these
  // should cut clean over the engine and rev.
  fleeVoice(id) {
    const cfg = FLEE_SOUNDS[id];
    const bufs = this.fleeBufs && this.fleeBufs[id];
    if (!cfg || !bufs || !bufs.some(Boolean) || !this.ctx) return;
    this._fleeing = this._fleeing || {};
    if (this._fleeing[id]) return;
    this.ensure();
    // alternate between the loaded variants per scare
    this._fleeIdx = this._fleeIdx || {};
    let idx = (this._fleeIdx[id] ?? -1);
    for (let tries = 0; tries < cfg.variants.length; tries++) {
      idx = (idx + 1) % cfg.variants.length;
      if (bufs[idx]) break;
    }
    this._fleeIdx[id] = idx;
    const buf = bufs[idx];
    const variant = cfg.variants[idx];
    if (!buf) return;
    this._fleeing[id] = true;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = Math.min(buf.duration - variant.offset, cfg.maxDur ?? 6);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(cfg.gain, t);
    g.gain.setValueAtTime(cfg.gain, t + Math.max(dur - 0.3, 0.05));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    // straight to the output — not through the master mix — so it dominates
    src.connect(g).connect(ctx.destination);
    src.start(t, variant.offset, dur);
    src.onended = () => { this._fleeing[id] = false; };
  }

  // One-shot rev from the real recording — fired when the throttle is
  // stabbed from low speed, like gunning it on the start line.
  revBurst() {
    if (!this.revBuf || !this.ctx || this.revPlaying) return;
    this.revPlaying = true;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = Math.min(2.4, this.revBuf.duration);
    const src = ctx.createBufferSource();
    src.buffer = this.revBuf;
    src.playbackRate.value = 0.95 + Math.random() * 0.12;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.setValueAtTime(0.3, t + dur - 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(g).connect(this.master);
    src.start(t, 0.05, dur);
    src.onended = () => { this.revPlaying = false; };
  }

  // Loop the steady middle of the real recording (skipping the drive-by
  // fade-in/out at the ends); speed drives its pitch and volume.
  startEngineSample() {
    if (this.sampleOn || !this.engineBuf || !this.ctx) return;
    this.sampleOn = true;
    const ctx = this.ctx;
    this.sample = ctx.createBufferSource();
    this.sample.buffer = this.engineBuf;
    this.sample.loop = true;
    this.sample.loopStart = this.engineBuf.duration * 0.25;
    this.sample.loopEnd = this.engineBuf.duration * 0.75;
    this.sampleGain = ctx.createGain();
    this.sampleGain.gain.value = 0;
    this.sample.connect(this.sampleGain).connect(this.master);
    this.sample.start(ctx.currentTime, this.engineBuf.duration * 0.3);
  }

  setEnginePreset(name) {
    this.preset = ENGINE_PRESETS[name] || ENGINE_PRESETS.bigblock;
    if (this.engineOn) this.applyPreset();
  }

  applyPreset() {
    const p = this.preset;
    this.osc1.type = p.osc1;
    this.osc2.type = p.osc2;
    const curve = new Float32Array(257);
    for (let i = 0; i <= 256; i++) curve[i] = Math.tanh(p.drive * (i / 128 - 1));
    this.shaper.curve = curve;
  }

  // Call every frame: speedNorm 0..~1.3, throttle 0..1, boost bool
  updateEngine({ speedNorm = 0, throttle = 0, boost = false }) {
    if (!this.engineOn) this.startEngine();
    if (!this.engineOn) return;
    const t = this.ctx.currentTime;
    const T = 0.07; // smoothing time constant

    const p = this.preset;
    const rpm = p.base + speedNorm * p.range + throttle * p.blip;
    this.osc1.frequency.setTargetAtTime(rpm, t, T);
    this.osc2.frequency.setTargetAtTime(rpm * p.sub, t, T);
    // Throttle punches hardest from a standstill and fades into a steady
    // cruise tone at speed — sustained full-throttle stays mellow.
    const cruise = Math.min(speedNorm, 1);
    const duck = this.sampleOn ? 1 - 0.55 * cruise : 1;
    this.engineGain.gain.setTargetAtTime(
      (0.055 + throttle * (0.09 - 0.05 * cruise) + cruise * 0.05) * p.gain * duck, t, T);
    this.engineFilter.frequency.setTargetAtTime(
      p.filterBase + throttle * (550 - 300 * cruise) + speedNorm * 650, t, T);
    this.exhaustGain.gain.setTargetAtTime((0.035 + speedNorm * 0.06) * p.exhaust, t, T);
    if (p.whine) {
      this.whineOsc.frequency.setTargetAtTime(rpm * p.whineRatio, t, T);
      this.whineGain.gain.setTargetAtTime(p.whine * 0.045 * (0.25 + cruise * 0.75), t, T);
    } else {
      this.whineGain.gain.setTargetAtTime(0, t, T);
    }

    // Rev burst: throttle stabbed while slow -> gun the engine
    if (throttle > 0.5 && (this._prevThrottle ?? 0) < 0.2 && speedNorm < 0.35) {
      this.revBurst();
    }
    this._prevThrottle = throttle;

    // Real-recording engine bed: silent at standstill (synth idle carries),
    // fades in with motion, pitch tracking speed and throttle.
    if (this.engineBuf && !this.sampleOn) this.startEngineSample();
    if (this.sampleOn) {
      const presence = Math.min(speedNorm * 2.2, 1);
      this.sampleGain.gain.setTargetAtTime(presence * (0.3 + throttle * 0.14), t, T);
      this.sample.playbackRate.setTargetAtTime(0.8 + cruise * 0.5 + throttle * 0.08, t, T);
    }

    // boost flame jet: fast attack, slower tail, with a slow frequency wobble
    this.jetGain.gain.setTargetAtTime(boost ? 0.42 : 0, t, boost ? 0.03 : 0.18);
    if (boost) {
      this.jetFilter.frequency.setTargetAtTime(950 + Math.sin(t * 27) * 300, t, 0.05);
    }
  }

  // Comic scream: sawtooth "voice" with fast vibrato through a vocal-ish
  // bandpass formant — pitch shrieks up then trails off. Randomized per hit.
  scream({ f = 700, dur = 0.45, gain = 0.38 } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    // overlap freely, but cap simultaneous voices so a massacre stays sane
    this._screams = this._screams || 0;
    if (this._screams >= 8) return;
    this._screams++;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.onended = () => { this._screams--; };
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.7, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.25, t + dur * 0.15);
    o.frequency.exponentialRampToValueAtTime(f * 0.45, t + dur);
    const vib = ctx.createOscillator();
    vib.frequency.value = 22 + Math.random() * 9;
    const vibGain = ctx.createGain();
    vibGain.gain.value = f * 0.07;
    vib.connect(vibGain).connect(o.frequency);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 1.6;
    bp.Q.value = 1.0;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(bp).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
    vib.start(t);
    vib.stop(t + dur + 0.05);
  }

  // More human-sounding scream: sawtooth voice through two vocal formant
  // filters ("aaah" vowel), natural slow vibrato, a touch of breath noise,
  // and a terror contour — pitch spikes then collapses.
  humanScream({ f = 250 + Math.random() * 130, dur = 0.65, gain = 0.5 } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    this._screams = this._screams || 0;
    if (this._screams >= 8) return;
    this._screams++;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.onended = () => { this._screams--; };
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.6, t + dur * 0.2);
    o.frequency.setValueAtTime(f * 1.6, t + dur * 0.55);
    o.frequency.exponentialRampToValueAtTime(f * 0.55, t + dur);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5 + Math.random() * 2;
    const vibGain = ctx.createGain();
    vibGain.gain.value = f * 0.05;
    vib.connect(vibGain).connect(o.frequency);
    // parallel vowel formants
    const sum = ctx.createGain();
    for (const [freq, q, amt] of [[820, 5, 1.0], [1250, 7, 0.6]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = q;
      const bg = ctx.createGain();
      bg.gain.value = amt;
      o.connect(bp).connect(bg).connect(sum);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.05);
    g.gain.setValueAtTime(gain, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    sum.connect(g).connect(this.master);
    this.noise(dur * 0.5, { type: 'bandpass', f0: 1600, f1: 900, gain: 0.05 }); // breath
    o.start(t);
    o.stop(t + dur + 0.05);
    vib.start(t);
    vib.stop(t + dur + 0.05);
  }

  // squashing a named character: crash + comic descending boing + big wail
  characterCrash() {
    this.noise(0.3, { f0: 1200, f1: 150, gain: 0.5 });
    this.tone(320, 70, 0.35, { type: 'triangle', gain: 0.35 });
    this.tone(90, 40, 0.25, { gain: 0.45 });
    this.scream({ f: 420 + Math.random() * 120, dur: 0.7, gain: 0.45 });
  }

  // crowd/pedestrian hit: thud (rate-limited) + a scream per victim —
  // screams overlap into a chorus when you plow through a group
  crowdThud() {
    const now = performance.now();
    if (now - (this._lastCrowd || 0) >= 60) {
      this._lastCrowd = now;
      this.noise(0.12, { type: 'bandpass', f0: 500, f1: 200, gain: 0.3 });
      this.tone(200, 70, 0.12, { gain: 0.25 });
    }
    // a few of them scream like real people; the rest keep the cartoon shriek
    if (Math.random() < 0.35) {
      this.humanScream({ dur: 0.5 + Math.random() * 0.3 });
    } else {
      this.scream({ f: 550 + Math.random() * 500, dur: 0.35 + Math.random() * 0.25, gain: 0.34 });
    }
  }

  // hard landing after big air, scaled by airtime
  landing(i) {
    this.noise(0.18, { f0: 400, f1: 60, gain: 0.35 * i + 0.1 });
    this.tone(110, 35, 0.22, { gain: 0.3 * i + 0.1 });
  }

  // punting the ball, scaled by impact speed
  punt(i) {
    this.tone(95, 42, 0.28, { gain: 0.35 + 0.3 * i });
    this.noise(0.1, { f0: 900, f1: 300, gain: 0.2 });
  }
}

export const audio = new GameAudio();
