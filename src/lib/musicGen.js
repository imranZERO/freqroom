// Synthesized music loops: a drum loop and a full band loop (drums, bass,
// chord pad), rendered in plain JS into an AudioBuffer, so FreqRoom has
// musical training material without shipping any audio files.
//
// Every sound is rendered as a note event with its own envelope and filter
// state, written at (start + i) modulo the loop length. Tails that run past
// the end wrap round to the start, so the loop point is seamless. A seeded
// random generator keeps each render identical.

export const LOOP_BPM = 100;
export const LOOP_BARS = 8;
const BEAT = 60 / LOOP_BPM;          // seconds per beat
const BAR = BEAT * 4;
export const LOOP_SECONDS = BAR * LOOP_BARS; // 19.2 s
const SWING = 0.03;                  // off-beat 8ths land 30 ms late

// Loudness targets: RMS near pink noise's, with peaks kept under 0.95
const TARGET_RMS = 0.16;
const MAX_PEAK = 0.95;

// Small, fast, seedable PRNG (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const midiToHz = m => 440 * Math.pow(2, (m - 69) / 12);

// Mixes `length` samples from voice(i, t) into both channels at `start`,
// wrapping past the end of the loop. pan: −1 left … +1 right.
function mix(L, R, sr, startSec, durSec, pan, voice) {
  const n = L.length;
  const start = Math.round(startSec * sr);
  const len = Math.round(durSec * sr);
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < len; i++) {
    const v = voice(i, i / sr);
    const j = (start + i) % n;
    L[j] += v * gl;
    R[j] += v * gr;
  }
}

// ── Drum voices ────────────────────────────────────────────────────────────

function kick(L, R, sr, at, vel, rand) {
  let phase = 0;
  mix(L, R, sr, at, 0.45, 0, (i, t) => {
    const f = 45 + 85 * Math.exp(-t * 28);          // pitch drop 130 → 45 Hz
    phase += (2 * Math.PI * f) / sr;
    const body = Math.sin(phase) * Math.exp(-t * 7);
    const click = t < 0.004 ? (rand() * 2 - 1) * (1 - t / 0.004) * 0.5 : 0;
    return (body + click) * vel;
  });
}

function snare(L, R, sr, at, vel, rand) {
  let prev = 0, phase = 0;
  mix(L, R, sr, at, 0.3, 0.05, (i, t) => {
    const w = rand() * 2 - 1;
    const hp = w - prev; prev = w;                   // first difference: brighter noise
    phase += (2 * Math.PI * 190) / sr;
    const tone = Math.sin(phase) * Math.exp(-t * 30) * 0.5;
    return (hp * 0.45 * Math.exp(-t * 16) + tone) * vel;
  });
}

function hat(L, R, sr, at, vel, rand, open) {
  let p1 = 0, p2 = 0;
  const decay = open ? 7 : 45;
  mix(L, R, sr, at, open ? 0.4 : 0.09, 0.3, (i, t) => {
    const w = rand() * 2 - 1;
    const d1 = w - p1; p1 = w;                       // second difference: hiss above ~6 kHz
    const d2 = d1 - p2; p2 = d1;
    return d2 * 0.18 * Math.exp(-t * decay) * vel;
  });
}

function renderDrums(L, R, sr, rand, level) {
  for (let bar = 0; bar < LOOP_BARS; bar++) {
    const b0 = bar * BAR;
    // kick on 1 and 3, plus a pickup 16th before 3 on odd bars
    kick(L, R, sr, b0, 1 * level, rand);
    kick(L, R, sr, b0 + 2 * BEAT, 0.9 * level, rand);
    if (bar % 2 === 1) kick(L, R, sr, b0 + 1.75 * BEAT, 0.6 * level, rand);
    // snare on 2 and 4
    snare(L, R, sr, b0 + BEAT, 0.9 * level, rand);
    snare(L, R, sr, b0 + 3 * BEAT, 0.95 * level, rand);
    // swung 8th-note hats; the last one of the bar opens
    for (let e = 0; e < 8; e++) {
      const at = b0 + e * (BEAT / 2) + (e % 2 ? SWING : 0);
      hat(L, R, sr, at, (e % 2 ? 0.7 : 1) * level, rand, e === 7);
    }
  }
}

// ── Pitched voices ─────────────────────────────────────────────────────────

// Naive sawtooth; aliasing is negligible at these pitches after the low-pass
const saw = (phase) => 2 * (phase - Math.floor(phase + 0.5));

// One chord every 2 bars: C, Am, F, G (roots for the bass, triads for the pad)
const PROGRESSION = [
  { root: 36, triad: [60, 64, 67] },  // C
  { root: 33, triad: [57, 60, 64] },  // Am
  { root: 29, triad: [57, 60, 65] },  // F
  { root: 31, triad: [59, 62, 67] },  // G
];

function bassNote(L, R, sr, at, dur, midi, vel) {
  const f = midiToHz(midi);
  let ph = 0, lp = 0;
  const a = 1 - Math.exp((-2 * Math.PI * 500) / sr); // one-pole low-pass ~500 Hz
  mix(L, R, sr, at, dur + 0.08, 0, (i, t) => {
    ph += f / sr;
    lp += a * (saw(ph) - lp);
    const env = Math.min(1, t / 0.005) * Math.exp(-t * 3) * (t > dur ? Math.exp(-(t - dur) * 60) : 1);
    return lp * env * vel;
  });
}

function padChord(L, R, sr, at, dur, triad, vel) {
  const a = 1 - Math.exp((-2 * Math.PI * 2200) / sr); // two one-poles ~2.2 kHz
  for (const [n, midi] of triad.entries()) {
    for (const side of [-1, 1]) {                      // one detuned saw per channel
      const f = midiToHz(midi) * Math.pow(2, (side * 7) / 1200);
      let ph = (n * 0.37 + (side > 0 ? 0.5 : 0)) % 1, lp1 = 0, lp2 = 0;
      mix(L, R, sr, at, dur + 0.6, side * 0.6, (i, t) => {
        ph += f / sr;
        lp1 += a * (saw(ph) - lp1);
        lp2 += a * (lp1 - lp2);
        const attack = Math.min(1, t / 0.35);
        const release = t > dur ? Math.exp(-(t - dur) * 7) : 1;
        return lp2 * attack * release * vel;
      });
    }
  }
}

function renderBandParts(L, R, sr) {
  const chordLen = 2 * BAR;
  for (let c = 0; c < LOOP_BARS / 2; c++) {
    const { root, triad } = PROGRESSION[c % PROGRESSION.length];
    const start = c * chordLen;
    padChord(L, R, sr, start, chordLen, triad, 0.1);
    // bass: 8ths on the root, jumping an octave on the "and" of 2 and 4
    for (let e = 0; e < 16; e++) {
      const at = start + e * (BEAT / 2) + (e % 2 ? SWING : 0);
      const up = e % 4 === 3;
      bassNote(L, R, sr, at, BEAT * 0.42, root + (up ? 12 : 0), up ? 0.5 : 0.65);
    }
  }
}

// ── Output ─────────────────────────────────────────────────────────────────

// Scales both channels toward TARGET_RMS without letting peaks pass MAX_PEAK
function normalize(L, R) {
  let sumSq = 0, peak = 0;
  for (let i = 0; i < L.length; i++) {
    sumSq += L[i] * L[i] + R[i] * R[i];
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const rms = Math.sqrt(sumSq / (2 * L.length));
  if (!rms) return;
  const gain = Math.min(TARGET_RMS / rms, MAX_PEAK / peak);
  for (let i = 0; i < L.length; i++) { L[i] *= gain; R[i] *= gain; }
}

function render(audioCtx, parts) {
  const sr = audioCtx.sampleRate;
  const len = Math.round(LOOP_SECONDS * sr);
  const buf = audioCtx.createBuffer(2, len, sr);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  parts(L, R, sr);
  normalize(L, R);
  return buf;
}

// Kick, snare, and swung hats: transient-heavy material across the spectrum
export function generateDrumLoop(audioCtx) {
  return render(audioCtx, (L, R, sr) => renderDrums(L, R, sr, rng(0xd2a5), 1));
}

// Drums with a bass line and a chord pad: fills the lows, mids, and highs
export function generateBandLoop(audioCtx) {
  return render(audioCtx, (L, R, sr) => {
    renderDrums(L, R, sr, rng(0xba4d), 0.8);
    renderBandParts(L, R, sr);
  });
}
