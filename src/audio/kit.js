/**
 * Procedural audio. No asset files — every sound is synthesised on demand,
 * which keeps the bundle at zero bytes of audio and means the whole kit is
 * about a hundred lines.
 */
let ctx = null;
let master = null;
let musicGain = null;
let muted = false;
let musicTimer = null;
let currentBed = null;

const STORE_KEY = "bbc-audio";

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.16;
  musicGain.connect(master);
  return ctx;
}

export function initAudio() {
  try {
    muted = localStorage.getItem(STORE_KEY) === "off";
  } catch {
    muted = false;
  }
  const unlock = () => {
    const c = ensure();
    if (c?.state === "suspended") c.resume();
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem(STORE_KEY, muted ? "off" : "on");
  } catch {
    /* private mode */
  }
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05);
  return muted;
}

function tone({ freq = 440, dur = 0.12, type = "sine", gain = 0.2, slide = 0, delay = 0 }) {
  const c = ensure();
  if (!c || muted) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.2, gain = 0.15, freq = 1200, q = 1, delay = 0 }) {
  const c = ensure();
  if (!c || muted) return;
  const t0 = c.currentTime + delay;
  const frames = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  click: () => tone({ freq: 620, dur: 0.05, type: "triangle", gain: 0.13 }),
  soft: () => tone({ freq: 380, dur: 0.06, type: "sine", gain: 0.09 }),
  place: () => {
    tone({ freq: 480, dur: 0.07, type: "square", gain: 0.1 });
    tone({ freq: 720, dur: 0.09, type: "triangle", gain: 0.09, delay: 0.04 });
  },
  remove: () => tone({ freq: 300, dur: 0.09, type: "sawtooth", gain: 0.08, slide: -120 }),
  deny: () => tone({ freq: 160, dur: 0.16, type: "square", gain: 0.11, slide: -40 }),
  open: () => tone({ freq: 300, dur: 0.14, type: "sine", gain: 0.11, slide: 260 }),
  close: () => tone({ freq: 520, dur: 0.12, type: "sine", gain: 0.09, slide: -240 }),
  cash: () => {
    [880, 1320, 1760].forEach((f, i) =>
      tone({ freq: f, dur: 0.28, type: "triangle", gain: 0.13, delay: i * 0.055 })
    );
  },
  thud: () => {
    tone({ freq: 90, dur: 0.32, type: "sine", gain: 0.3, slide: -50 });
    noise({ dur: 0.24, gain: 0.1, freq: 220, q: 0.7 });
  },
  chirp: () => tone({ freq: 1040, dur: 0.05, type: "sine", gain: 0.07 }),
  tick: () => tone({ freq: 1500, dur: 0.02, type: "square", gain: 0.03 }),
  synergy: () => {
    [523, 659, 784, 1046].forEach((f, i) =>
      tone({ freq: f, dur: 0.3, type: "triangle", gain: 0.11, delay: i * 0.06 })
    );
  },
  conflict: () => {
    tone({ freq: 220, dur: 0.3, type: "sawtooth", gain: 0.12 });
    tone({ freq: 233, dur: 0.3, type: "sawtooth", gain: 0.12 });
  },
  backlash: () => {
    noise({ dur: 0.6, gain: 0.16, freq: 700, q: 0.5 });
    tone({ freq: 140, dur: 0.5, type: "sawtooth", gain: 0.16, slide: -60 });
  },
  fanfare: () => {
    [392, 523, 659, 784, 1046].forEach((f, i) =>
      tone({ freq: f, dur: 0.45, type: "triangle", gain: 0.14, delay: i * 0.09 })
    );
  },
  crash: () => {
    noise({ dur: 1.1, gain: 0.2, freq: 340, q: 0.4 });
    tone({ freq: 110, dur: 1.0, type: "sawtooth", gain: 0.2, slide: -70 });
  },
};

// --- Music beds -----------------------------------------------------------

const BEDS = {
  1: { root: 220, scale: [0, 4, 7, 11, 14], type: "triangle", tempo: 640, gain: 0.1 },
  2: { root: 146, scale: [0, 3, 5, 7, 10], type: "sine", tempo: 900, gain: 0.12 },
  3: { root: 174, scale: [0, 2, 4, 7, 9], type: "square", tempo: 500, gain: 0.07 },
};

export function setMusicBed(act) {
  if (currentBed === act) return;
  currentBed = act;
  stopMusic();
  const bed = BEDS[act];
  if (!bed) return;
  let step = 0;
  musicTimer = setInterval(() => {
    if (muted || !ctx || document.hidden) return;
    const c = ensure();
    if (!c) return;
    const note = bed.scale[(step * 3) % bed.scale.length];
    const octave = step % 8 < 4 ? 1 : 2;
    const freq = bed.root * Math.pow(2, note / 12) * octave;
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = bed.type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(bed.gain, t0 + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + bed.tempo / 1000);
    osc.connect(g).connect(musicGain);
    osc.start(t0);
    osc.stop(t0 + bed.tempo / 1000 + 0.1);
    step++;
  }, bed.tempo);
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}
