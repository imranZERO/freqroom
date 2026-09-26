// Long-term progress: level per mode, lifetime totals, and per-octave accuracy
// used for the graph's weak-spot strip and focus practice.

import { EMPTY_TALLY, addResult } from './scoring.js';

// Octave buckets centred on the standard octave-band frequencies
export const BUCKETS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const MIN_ATTEMPTS = 3;

export const EMPTY_PROGRESS = { levels: {}, lifetime: EMPTY_TALLY, stats: {} };

export function bucketOf(freq) {
  const i = Math.round(Math.log2(freq / BUCKETS[0]));
  return Math.max(0, Math.min(BUCKETS.length - 1, i));
}

// Returns a new progress object with one answered trial recorded
export function recordResult(progress, result) {
  const { mode, family, freq, correct, level } = result;
  const famStats = { ...(progress.stats[family] ?? {}) };
  const b = bucketOf(freq);
  const prev = famStats[b] ?? { n: 0, hits: 0 };
  famStats[b] = { n: prev.n + 1, hits: prev.hits + (correct ? 1 : 0) };
  return {
    levels: { ...progress.levels, [mode]: level },
    // Same tally as the session score: points, streaks, per-mode rows
    lifetime: addResult(progress.lifetime, result),
    stats: { ...progress.stats, [family]: famStats },
  };
}

// Per-bucket accuracy for one family; acc is null until there are enough attempts
export function heatFor(progress, family) {
  const famStats = progress.stats[family] ?? {};
  return BUCKETS.map((center, i) => {
    const { n = 0, hits = 0 } = famStats[i] ?? {};
    return { center, n, hits, acc: n >= MIN_ATTEMPTS ? hits / n : null };
  });
}

// Picks a band, favouring octaves you miss more often. Buckets without enough
// data are treated as 50% so new ground still comes up regularly.
export function pickWeighted(bands, progress, family) {
  const heat = heatFor(progress, family);
  const weights = bands.map(f => {
    const acc = heat[bucketOf(f)].acc;
    return (1 - (acc ?? 0.5)) + 0.15;
  });
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < bands.length; i++) {
    r -= weights[i];
    if (r <= 0) return bands[i];
  }
  return bands[bands.length - 1];
}
