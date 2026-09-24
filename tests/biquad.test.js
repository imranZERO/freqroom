import { describe, it, expect } from 'vitest';
import { biquadCoeffs, magnitudeDb, rowInset, fmtHz } from '../src/components/FreqGraph.jsx';

const SR = 48000;
const db = (filter, f) => magnitudeDb(biquadCoeffs(filter, SR), f, SR);

describe('biquadCoeffs / magnitudeDb', () => {
  it('a peaking filter with zero gain is flat at 0 dB', () => {
    const coeffs = biquadCoeffs({ type: 'peaking', frequency: 1000, Q: 1.4, gain: 0 }, SR);
    for (const f of [20, 100, 1000, 10000, 20000]) {
      expect(Math.abs(magnitudeDb(coeffs, f, SR))).toBeLessThan(1e-9);
    }
  });

  it('peaking reaches exactly the gain at its centre', () => {
    for (const [gain, q] of [[6, 1.4], [12, 0.5], [3, 8], [18, 1.4]]) {
      expect(db({ type: 'peaking', frequency: 1000, Q: q, gain }, 1000)).toBeCloseTo(gain, 6);
    }
  });

  it('peaking is symmetrical about its centre in log frequency', () => {
    const filter = { type: 'peaking', frequency: 1000, Q: 1.4, gain: 6 };
    const up = db(filter, 2000);
    const down = db(filter, 500);
    expect(Math.abs(up - down)).toBeLessThan(0.01);
  });

  it('low-pass with Butterworth Q is −3 dB at the cutoff and −3 dB/octave past it', () => {
    const lp = { type: 'lowpass', frequency: 1000, Q: -3.01 };
    expect(db(lp, 20)).toBeCloseTo(0, 1);
    expect(db(lp, 1000)).toBeCloseTo(-3.01, 1);
    expect(db(lp, 20000)).toBeLessThan(-40); // 4+ octaves down
    // 2× the cutoff ≈ −12 dB for a 2nd-order filter
    expect(db(lp, 2000)).toBeCloseTo(-12.37, 1);
  });

  it('high-pass with Butterworth Q is −3 dB at the cutoff and rolls off below it', () => {
    const hp = { type: 'highpass', frequency: 1000, Q: -3.01 };
    expect(db(hp, 1000)).toBeCloseTo(-3.01, 1);
    expect(db(hp, 20000)).toBeCloseTo(0, 1);
    expect(db(hp, 20)).toBeLessThan(-40);
  });

  it('a shelf sits at half its gain (in dB) at the corner', () => {
    const g = 12;
    expect(db({ type: 'lowshelf', frequency: 1000, gain: g }, 20)).toBeCloseTo(g, 1);
    expect(db({ type: 'lowshelf', frequency: 1000, gain: g }, 1000)).toBeCloseTo(g / 2, 1);
    expect(db({ type: 'lowshelf', frequency: 1000, gain: g }, 20000)).toBeCloseTo(0, 1);
    expect(db({ type: 'highshelf', frequency: 1000, gain: g }, 20)).toBeCloseTo(0, 1);
    expect(db({ type: 'highshelf', frequency: 1000, gain: g }, 1000)).toBeCloseTo(g / 2, 1);
    expect(db({ type: 'highshelf', frequency: 1000, gain: g }, 20000)).toBeCloseTo(g, 1);
  });

  it('every filter type stays finite across the whole band', () => {
    const cases = [
      { type: 'peaking', frequency: 250, Q: 1.4, gain: 12 },
      { type: 'lowshelf', frequency: 250, gain: 12 },
      { type: 'highshelf', frequency: 4000, gain: -12 },
      { type: 'lowpass', frequency: 1000, Q: -3.01 },
      { type: 'highpass', frequency: 250, Q: -3.01 },
    ];
    for (const filter of cases) {
      const coeffs = biquadCoeffs(filter, SR);
      for (let i = 0; i <= 300; i++) {
        const f = 20 * Math.pow(20000 / 20, i / 300);
        expect(Number.isFinite(magnitudeDb(coeffs, f, SR))).toBe(true);
      }
    }
  });
});

describe('rowInset', () => {
  it('returns percentage insets that line columns up with the log axis', () => {
    const full = rowInset(); // default 20 Hz..20 kHz
    // (P.l + IW · 0) / VW: 32/600 and 14/600 in JS give these exact strings
    expect(full.left).toBe('5.333333333333334%');
    expect(full.right).toBe('2.3333333333333335%');
    const half = rowInset(1000, 16000);
    expect(parseFloat(half.left)).toBeGreaterThan(parseFloat(full.left));
    // narrower [lo, hi] pushes both edges inward, so right grows too
    expect(parseFloat(half.right)).toBeGreaterThan(parseFloat(full.right));
  });
});

describe('fmtHz', () => {
  it('shows hertz below 1 kHz and kHz above with appropriate precision', () => {
    expect(fmtHz(87)).toBe('87 Hz');
    expect(fmtHz(999)).toBe('999 Hz');
    expect(fmtHz(1000)).toBe('1.00 kHz');
    expect(fmtHz(1240)).toBe('1.24 kHz');
    expect(fmtHz(9998)).toBe('10.00 kHz');
    expect(fmtHz(10000)).toBe('10.0 kHz');
    expect(fmtHz(12500)).toBe('12.5 kHz');
    expect(fmtHz(19999)).toBe('20.0 kHz');
  });
});