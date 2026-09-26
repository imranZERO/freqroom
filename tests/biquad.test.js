import { describe, it, expect } from 'vitest';
import { biquadCoeffs, magnitudeDb, rowInset, fmtHz, toY, fromY, graphLayout, spectrumDb, spectrumToAxis } from '../src/components/FreqGraph.jsx';

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
describe('toY / fromY', () => {
  for (const compact of [false, true]) {
    it(`round-trips dB through the ${compact ? 'compact' : 'wide'} layout`, () => {
      const g = graphLayout(compact);
      for (const range of [12, 18]) {
        for (const db of [-range, -7.5, 0, 3, range]) {
          expect(fromY(toY(db, range, g), range, g)).toBeCloseTo(db, 9);
        }
      }
    });
  }

  it('clamps positions outside the plot to the range', () => {
    const g = graphLayout(false);
    expect(fromY(-100, 12, g)).toBe(12);
    expect(fromY(g.VH + 100, 12, g)).toBe(-12);
  });
});

describe('spectrumDb', () => {
  // Analyser-style bins (dB per bin) for a spectrum with power ∝ f^slope
  const bins = (slope, n = 8192, sr = 48000) => Float32Array.from({ length: n }, (_, i) => {
    const f = Math.max(1, (i * sr) / 2 / n);
    return 10 * Math.log10(Math.pow(f, slope));
  });
  const freqs = [50, 100, 1000, 5000, 15000];

  it('reads pink noise (power ∝ 1/f) as flat, after the +3 dB/octave tilt', () => {
    const out = spectrumDb(bins(-1), 48000, freqs);
    for (const v of out) expect(v).toBeCloseTo(out[2], 0);
  });

  it('shows white noise rising 3 dB per octave', () => {
    // a 160-point log grid like the graph's, so each point spans a narrow slice
    const grid = Array.from({ length: 160 }, (_, i) => 20 * Math.pow(1000, i / 159));
    const out = spectrumDb(bins(0), 48000, grid);
    const at = hz => out[grid.findIndex(f => f >= hz)];
    const octaves = Math.log2(grid.find(f => f >= 4000) / grid.find(f => f >= 250));
    expect(at(4000) - at(250)).toBeCloseTo(3.01 * octaves, 0);
  });

  it('stays finite for silence', () => {
    const silent = new Float32Array(1024).fill(-Infinity);
    for (const v of spectrumDb(silent, 48000, freqs)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('spectrumToAxis', () => {
  it('maps the spectrum onto the axis on its own scale, never reaching the edges', () => {
    expect(spectrumToAxis(0, 12)).toBe(0);
    // small levels are drawn at about 0.75×
    expect(spectrumToAxis(2, 12)).toBeCloseTo(1.5, 1);
    expect(spectrumToAxis(6, 12)).toBeCloseTo(4.3, 1);
    // big swings round off inside the plot instead of clipping at ±range
    expect(spectrumToAxis(30, 12)).toBeLessThan(12);
    expect(spectrumToAxis(-60, 12)).toBeGreaterThan(-12);
    // near the middle, about the same size on ±12 and ±18 dB axes
    expect(spectrumToAxis(4, 18)).toBeCloseTo(spectrumToAxis(4, 12), 0);
  });
});
