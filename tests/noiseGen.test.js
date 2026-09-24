import { describe, it, expect } from 'vitest';
import { generatePinkNoise, generateWhiteNoise } from '../src/lib/noiseGen.js';

// Fake AudioContext: generatePinkNoise/T generateWhiteNoise only need
// sampleRate and createBuffer().
function fakeCtx(sampleRate = 48000) {
  return {
    sampleRate,
    createBuffer(channels, length, sr) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate: sr, getChannelData: i => data[i] };
    },
  };
}

const stats = (data) => {
  let sum = 0, sumSq = 0, min = Infinity, max = -Infinity;
  for (const v of data) {
    sum += v; sumSq += v * v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const n = data.length;
  return { n, mean: sum / n, rms: Math.sqrt(sumSq / n), min, max };
};

describe('generateWhiteNoise', () => {
  it('returns a stereo buffer of the requested length and rate', () => {
    const ctx = fakeCtx(44100);
    const buf = generateWhiteNoise(ctx, 1);
    expect(buf.numberOfChannels).toBe(2);
    expect(buf.length).toBe(44100);
    expect(buf.sampleRate).toBe(44100);
  });

  it('defaults to 30 seconds', () => {
    const ctx = fakeCtx(48000);
    expect(generateWhiteNoise(ctx).length).toBe(48000 * 30);
  });

  it('is uniform in ±0.45: near-zero mean, RMS ≈ 0.26, everything in range', () => {
    const ctx = fakeCtx(48000);
    const buf = generateWhiteNoise(ctx, 5); // 240k samples/channel
    const s = stats(buf.getChannelData(0));
    expect(buf.getChannelData(1).every(v => Number.isFinite(v))).toBe(true);
    expect(Math.abs(s.mean)).toBeLessThan(0.005);
    expect(s.rms).toBeCloseTo(0.45 / Math.sqrt(3), 1); // ≈ 0.260
    expect(s.min).toBeGreaterThanOrEqual(-0.45);
    expect(s.max).toBeLessThanOrEqual(0.45);
  });

  it('generates independent channels', () => {
    const ctx = fakeCtx(48000);
    const buf = generateWhiteNoise(ctx, 1);
    const ch0 = buf.getChannelData(0), ch1 = buf.getChannelData(1);
    expect(ch0).not.toBe(ch1);
    expect(ch0.some((v, i) => v !== ch1[i])).toBe(true);
  });
});

describe('generatePinkNoise', () => {
  it('returns a finite stereo buffer in [-1, 1] with a plausible RMS', () => {
    const ctx = fakeCtx(48000);
    const buf = generatePinkNoise(ctx, 5);
    for (const ch of [buf.getChannelData(0), buf.getChannelData(1)]) {
      expect(ch.every(Number.isFinite)).toBe(true);
      const s = stats(ch);
      expect(s.min).toBeGreaterThanOrEqual(-1);
      expect(s.max).toBeLessThanOrEqual(1);
      expect(Math.abs(s.mean)).toBeLessThan(0.05);
      expect(s.rms).toBeGreaterThan(0.05);
      expect(s.rms).toBeLessThan(0.5);
    }
  });
});