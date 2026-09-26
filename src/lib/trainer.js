// Pure trainer logic: band geometry, filter descriptor building, and the labels
// that spell answers out — lifted out of FrequencyTrainer so it can be tested.

export const FREQ_MIN = 20;
export const FREQ_MAX = 20000;

// Web Audio reads lowpass/highpass Q in dB; −3.01 dB gives a Butterworth (Q ≈ 0.707) response
export const BUTTERWORTH_Q_DB = -3.01;
// Shelf corners below this are low shelves, above are high shelves
export const SHELF_SPLIT = 1000;

// Sweep mode: how close (in octaves) a guess must be to count, by level 1–5
export const SWEEP_TOLERANCE = [1, 2 / 3, 1 / 2, 1 / 3, 1 / 6];
export const SWEEP_RANGE = [40, 16000];
// Fine grid the hidden sweep frequency is drawn from (lets focus practice weight it)
export const SWEEP_GRID = generateBands(72, ...SWEEP_RANGE);

export const octaveError = (guess, actual) => Math.abs(Math.log2(guess / actual));

// Whether a sweep guess at `level` falls within the tolerance for that level
export function withinSweepTolerance(errOct, level) {
  return errOct <= SWEEP_TOLERANCE[level - 1];
}

// How Much? mode: the gain choices (dB) offered at each level 1–6. Every level
// adds choices: steps shrink and cuts join in; 0 dB is never a choice.
export const GAIN_LEVELS = [
  [3, 9],
  [3, 6, 9],
  [3, 6, 9, 12],
  [2, 4, 6, 8, 10, 12],
  [-12, -9, -6, -3, 3, 6, 9, 12],
  [-12, -10, -8, -6, -4, -2, 2, 4, 6, 8, 10, 12],
];
// Frequencies the How Much? bell is placed at (kept off the extremes, where
// level changes are hardest to judge)
export const GAIN_FREQS = generateBands(24, 60, 12000);

// Match EQ mode: how close the matched bell must be, in octaves and dB, by level 1–5
export const MATCH_TOLERANCE = [
  { oct: 1, db: 4 },
  { oct: 2 / 3, db: 3 },
  { oct: 1 / 2, db: 2.5 },
  { oct: 1 / 3, db: 2 },
  { oct: 1 / 6, db: 1.5 },
];
// The hidden bell's gain magnitudes (dB); each trial picks one and a random sign
export const MATCH_GAINS = [3, 4.5, 6, 7.5, 9, 10.5, 12];
// The matched bell's gain is limited to ±this (also the graph's dB range)
export const MATCH_RANGE_DB = 12;

// Whether a Match EQ guess at `level` is within both tolerances
export function withinMatchTolerance(errOct, errDb, level) {
  const tol = MATCH_TOLERANCE[level - 1];
  return errOct <= tol.oct && errDb <= tol.db;
}

// Frequency span the candidates are spread over for a trial
export function bandRange(family, kind) {
  if (family === 'shelf') return [60, 10000];
  if (family === 'pass') return kind === 'highpass' ? [40, 1000] : [1000, 16000];
  return [FREQ_MIN, FREQ_MAX];
}

export function generateBands(n, lo = FREQ_MIN, hi = FREQ_MAX) {
  if (n === 0) return [];
  return Array.from({ length: n }, (_, i) =>
    Math.round(lo * Math.pow(hi / lo, (i + 0.5) / n))
  );
}

// Filter type at a band: fixed per trial, except shelves, which follow the corner
export function typeAt(kind, freq) {
  if (kind === 'shelf') return freq < SHELF_SPLIT ? 'lowshelf' : 'highshelf';
  return kind;
}

// One descriptor shape feeds both the audio engine and the graph
export function makeFilter(type, frequency, gain, q) {
  if (type === 'lowpass' || type === 'highpass') return { type, frequency, Q: BUTTERWORTH_Q_DB };
  if (type === 'peaking') return { type, frequency, Q: q, gain };
  return { type, frequency, gain }; // shelves: slope fixed at S = 1
}

export const FREQ_LABEL = (hz) => {
  if (hz >= 1000) {
    const k = hz / 1000;
    return Number.isInteger(k) ? `${k}` : k.toFixed(1);
  }
  return `${hz}`;
};
export const FREQ_UNIT = (hz) => hz >= 1000 ? 'kHz' : 'Hz';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function freqToNote(hz) {
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `~${name}${octave}`;
}

export function freqRegion(hz) {
  if (hz < 80)   return 'Sub Bass';
  if (hz < 250)  return 'Bass';
  if (hz < 500)  return 'Low Mid';
  if (hz < 2000) return 'Midrange';
  if (hz < 4000) return 'Upper Mid';
  if (hz < 8000) return 'Presence';
  return 'Brilliance';
}

// Modes where you answer the direction (boost or cut) as well as the frequency;
// they show a boost row and a cut row of buttons
export const pickDirection = mode => mode === 'both' || mode === 'shelf';

// Returns +1 or -1
export function signForMode(mode) {
  if (mode === 'boost' || mode === 'sweep') return 1;
  if (mode === 'cut' || mode === 'pass') return -1;
  return Math.random() < 0.5 ? 1 : -1;
}
// What a change in each region tends to sound like, for boosts and cuts.
// Used by Explore mode's region guide.
const REGION_CHARACTER = {
  'Sub Bass':   { boost: 'rumble, weight',  cut: 'tighter, less rumble' },
  'Bass':       { boost: 'fuller, boomy',   cut: 'thinner, lighter' },
  'Low Mid':    { boost: 'muddy, boxy',     cut: 'clearer, a little hollow' },
  'Midrange':   { boost: 'honky, nasal',    cut: 'scooped, distant' },
  'Upper Mid':  { boost: 'forward, harsh',  cut: 'softer, recessed' },
  'Presence':   { boost: 'edgy, clear',     cut: 'smoother, veiled' },
  'Brilliance': { boost: 'airy, sparkly',   cut: 'dull, dark' },
};

// Region name, nearest note, and the character of a boost (sign > 0) or cut
// (sign < 0) at `freq`; a sign of 0 means no change.
export function describeRegion(freq, sign) {
  const region = freqRegion(freq);
  const character = sign === 0 ? 'no change' : REGION_CHARACTER[region][sign > 0 ? 'boost' : 'cut'];
  return { region, note: freqToNote(freq), character };
}

// Filter types offered in Explore mode, in keyboard order (1–5)
export const EXPLORE_TYPES = [
  { type: 'peaking',   label: 'Bell' },
  { type: 'lowshelf',  label: 'Low shelf' },
  { type: 'highshelf', label: 'High shelf' },
  { type: 'highpass',  label: 'High-pass' },
  { type: 'lowpass',   label: 'Low-pass' },
];
