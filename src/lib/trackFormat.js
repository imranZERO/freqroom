// Small pure helpers for the source/transport panels: deterministic glyph
// sketches and the readout formatting for the upload card.

// Deterministic PRNG so the little spectrum sketches look noisy but never
// change between renders or across reloads.
export function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

export const GLYPH_W = 60, GLYPH_H = 28;
export function noisyLine(seed, slope) {
  const rnd = seeded(seed);
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const x = (i / 40) * GLYPH_W;
    const base = 9 + slope * (i / 40) * 12; // pink falls to the right, white stays level
    pts.push(`${x.toFixed(1)},${(base + (rnd() - 0.5) * 7).toFixed(1)}`);
  }
  return pts.join(' ');
}
export const PINK_LINE = noisyLine(7, 1);
export const WHITE_LINE = noisyLine(11, 0);
export const WAVE_BARS = (() => {
  const rnd = seeded(23);
  return Array.from({ length: 15 }, (_, i) => {
    const env = Math.sin((i + 0.5) / 15 * Math.PI);
    return Math.max(2, (0.35 + 0.65 * rnd()) * env * (GLYPH_H - 4));
  });
})();

// Drum loop sketch: one bar of 16th steps — tall kicks, mid snares, short hats
export const DRUM_HITS = (() => {
  const steps = [];
  for (let i = 0; i < 16; i++) {
    const h = i % 8 === 0 ? 1 : i % 8 === 4 ? 0.72 : i % 2 === 0 ? 0.32 : 0;
    if (h) steps.push({ x: 1.5 + i * 3.6, h: h * (GLYPH_H - 4) });
  }
  return steps;
})();

// Band loop sketch: a smooth chord line over small drum hits
export const BAND_LINE = Array.from({ length: 31 }, (_, i) => {
  const x = (i / 30) * GLYPH_W;
  const y = 10 - 4 * Math.sin((i / 30) * Math.PI * 2) - 2 * Math.sin((i / 30) * Math.PI * 6);
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}).join(' ');

export function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// Two readout lines, e.g. "FLAC · 44.1 kHz · 24-bit · Stereo" / "1012 kbps avg · 3:42"
export function formatSpec(info, duration) {
  const channels = info.channels === 1 ? 'Mono' : info.channels === 2 ? 'Stereo' : info.channels ? `${info.channels} ch` : null;
  const kbps = duration ? Math.round((info.size * 8) / duration / 1000) : null;
  return [
    [info.format, info.sampleRate && `${+(info.sampleRate / 1000).toFixed(1)} kHz`, info.bitDepth, channels],
    [kbps && `${kbps} kbps avg`, duration && formatTime(duration)],
  ].map(parts => parts.filter(Boolean).join(' · '));
}