import { describe, it, expect } from 'vitest';
import { generateDrumLoop, generateBandLoop, LOOP_SECONDS, LOOP_BPM, LOOP_BARS } from '../src/lib/musicGen.js';

// Same fake AudioContext shape as the noise tests: only sampleRate and createBuffer
function fakeCtx(sampleRate = 48000) {
  return {
    sampleRate,
    createBuffer(channels, length, sr) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate: sr, getChannelData: i => data[i] };
    },
  };
}

const rms = x => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

// Crude three-way energy split: one-pole low-pass at 250 Hz for the lows,
// the residue above a 4 kHz one-pole low-pass for the highs, the rest as mids
function bandShares(x, sr) {
  const lpA = 1 - Math.exp((-2 * Math.PI * 250) / sr);
  const hpA = 1 - Math.exp((-2 * Math.PI * 4000) / sr);
  let lo = 0, hiLp = 0, eLo = 0, eHi = 0, eAll = 0;
  for (const v of x) {
    lo += lpA * (v - lo);
    hiLp += hpA * (v - hiLp);
    const hi = v - hiLp;
    eLo += lo * lo; eHi += hi * hi; eAll += v * v;
  }
  return { lo: eLo / eAll, hi: eHi / eAll, mid: Math.max(0, eAll - eLo - eHi) / eAll };
}

describe.each([
  ['generateDrumLoop', generateDrumLoop],
  ['generateBandLoop', generateBandLoop],
])('%s', (name, generate) => {
  const ctx = fakeCtx(48000);
  const buf = generate(ctx);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);

  it('renders 8 bars at 100 BPM in stereo at the context rate', () => {
    expect(LOOP_BPM).toBe(100);
    expect(LOOP_BARS).toBe(8);
    expect(LOOP_SECONDS).toBeCloseTo(19.2, 9);
    expect(buf.numberOfChannels).toBe(2);
    expect(buf.sampleRate).toBe(48000);
    expect(buf.length).toBe(Math.round(19.2 * 48000));
  });

  it('keeps every sample finite and peaks under full scale', () => {
    for (const ch of [L, R]) {
      let peak = 0;
      for (const v of ch) {
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(peak).toBeLessThanOrEqual(0.95 + 1e-6);
      expect(peak).toBeGreaterThan(0.3);
    }
  });

  it('sits at a training level comparable to the noise sources', () => {
    const level = rms(L);
    expect(level).toBeGreaterThan(0.08);
    expect(level).toBeLessThan(0.2);
  });

  it('renders identically every time (seeded)', () => {
    const again = generate(fakeCtx(48000)).getChannelData(0);
    expect(again.every((v, i) => v === L[i])).toBe(true);
  });

  it('wraps seamlessly: the jump across the loop point is ordinary', () => {
    // Tails are written modulo the length, so the seam is just another sample
    // step; it must not exceed the largest step anywhere inside the loop.
    let maxStep = 0;
    for (let i = 1; i < L.length; i++) maxStep = Math.max(maxStep, Math.abs(L[i] - L[i - 1]));
    expect(Math.abs(L[0] - L[L.length - 1])).toBeLessThanOrEqual(maxStep);
    // and the end of the loop isn't silent: the previous bar's tails run into it
    expect(rms(L.subarray(L.length - 2400))).toBeGreaterThan(0.001);
  });

  it('is a little wider than mono (panned hats / detuned pad)', () => {
    expect(L.some((v, i) => v !== R[i])).toBe(true);
  });
});

describe('generateBandLoop spectrum', () => {
  it('has energy in the lows, mids, and highs', () => {
    const L = generateBandLoop(fakeCtx(48000)).getChannelData(0);
    const s = bandShares(L, 48000);
    expect(s.lo).toBeGreaterThan(0.2);
    expect(s.mid).toBeGreaterThan(0.05);
    expect(s.hi).toBeGreaterThan(0.005);
  });

  it('has more mid content than the drum loop alone (the chord pad)', () => {
    const band = bandShares(generateBandLoop(fakeCtx(48000)).getChannelData(0), 48000);
    const drums = bandShares(generateDrumLoop(fakeCtx(48000)).getChannelData(0), 48000);
    expect(band.mid).toBeGreaterThan(drums.mid);
  });
});
