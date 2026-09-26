import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateBands, octaveError, withinSweepTolerance, bandRange, typeAt, makeFilter,
  signForMode, pickDirection, freqToNote, freqRegion, FREQ_LABEL, FREQ_UNIT,
  SWEEP_TOLERANCE, SWEEP_RANGE, SWEEP_GRID, FREQ_MIN, FREQ_MAX, describeRegion, EXPLORE_TYPES,
  GAIN_LEVELS, GAIN_FREQS, MATCH_TOLERANCE, MATCH_GAINS, MATCH_RANGE_DB, withinMatchTolerance,
} from '../src/lib/trainer.js';

afterEach(() => vi.restoreAllMocks());

describe('generateBands', () => {
  it('returns one band at the geometric midpoint for n = 1', () => {
    expect(generateBands(1, 20, 20000)).toEqual([632]); // round(√(20·20000))
  });

  it('spaces n bands across [lo, hi] in log frequency', () => {
    const bands = generateBands(5, 20, 20000);
    expect(bands).toHaveLength(5);
    expect(bands[0]).toBe(40);
    expect(bands[4]).toBe(10024);
    for (const b of bands) {
      expect(b).toBeGreaterThanOrEqual(20);
      expect(b).toBeLessThanOrEqual(20000);
    }
    for (let i = 1; i < bands.length; i++) expect(bands[i]).toBeGreaterThan(bands[i - 1]);
    // consecutive bands climb by the same log ratio (≈ 1000^(1/5))
    const ratio = bands[3] / bands[2];
    expect(Math.abs(ratio - Math.pow(1000, 1 / 5)) / Math.pow(1000, 1 / 5)).toBeLessThan(0.01);
  });

  it('handles degenerate counts and defaults to 20 Hz..20 kHz', () => {
    expect(generateBands(0)).toEqual([]);
    expect(generateBands(2)[0]).toBeGreaterThanOrEqual(FREQ_MIN);
    expect(generateBands(2)[1]).toBeLessThanOrEqual(FREQ_MAX);
  });

  it('keeps the sweep grid at 72 bands within the sweep range', () => {
    expect(SWEEP_GRID).toHaveLength(72);
    expect(SWEEP_GRID[0]).toBeGreaterThanOrEqual(SWEEP_RANGE[0]);
    expect(SWEEP_GRID[71]).toBeLessThanOrEqual(SWEEP_RANGE[1]);
  });
});

describe('octaveError', () => {
  it('is 0 at the same frequency and symmetric about it', () => {
    expect(octaveError(1000, 1000)).toBe(0);
    expect(octaveError(2000, 1000)).toBe(1);
    expect(octaveError(500, 1000)).toBe(1);
  });

  it('reports whole octaves and fractions', () => {
    expect(octaveError(1500, 12000)).toBe(3); // 8× away
    expect(octaveError(1200, 1000)).toBeCloseTo(Math.log2(1.2), 10);
  });
});

describe('withinSweepTolerance', () => {
  it('uses the per-level tolerance table', () => {
    expect(SWEEP_TOLERANCE).toEqual([1, 2 / 3, 1 / 2, 1 / 3, 1 / 6]);
  });

  it('accepts an error inside the level tolerance (≤, inclusive)', () => {
    for (let lv = 1; lv <= 5; lv++) {
      expect(withinSweepTolerance(SWEEP_TOLERANCE[lv - 1], lv)).toBe(true);
      expect(withinSweepTolerance(SWEEP_TOLERANCE[lv - 1] / 2, lv)).toBe(true);
    }
  });

  it('rejects an error beyond the level tolerance', () => {
    expect(withinSweepTolerance(1.01, 1)).toBe(false);
    expect(withinSweepTolerance(0.7, 2)).toBe(false);
    expect(withinSweepTolerance(0.2, 5)).toBe(false);
  });
});

describe('bandRange', () => {
  it('covers the whole band for peaking modes', () => {
    expect(bandRange('peak', 'peaking')).toEqual([20, 20000]);
  });

  it('narrows shelves and splits the pass filters by kind', () => {
    expect(bandRange('shelf', 'shelf')).toEqual([60, 10000]);
    expect(bandRange('pass', 'highpass')).toEqual([40, 1000]);
    expect(bandRange('pass', 'lowpass')).toEqual([1000, 16000]);
  });
});

describe('typeAt', () => {
  it('picks the shelf type from the corner at 1 kHz', () => {
    expect(typeAt('shelf', 999)).toBe('lowshelf');
    expect(typeAt('shelf', 1000)).toBe('highshelf');
  });

  it('passes fixed kinds through', () => {
    expect(typeAt('peaking', 500)).toBe('peaking');
    expect(typeAt('lowpass', 500)).toBe('lowpass');
    expect(typeAt('highpass', 500)).toBe('highpass');
  });
});

describe('makeFilter', () => {
  it('builds the descriptor each filter type feeds to engine and graph', () => {
    expect(makeFilter('lowpass', 500, 6, 1.4)).toEqual({ type: 'lowpass', frequency: 500, Q: -3.01 });
    expect(makeFilter('highpass', 500, 6, 1.4)).toEqual({ type: 'highpass', frequency: 500, Q: -3.01 });
    expect(makeFilter('peaking', 1000, 6, 1.4)).toEqual({ type: 'peaking', frequency: 1000, Q: 1.4, gain: 6 });
    expect(makeFilter('lowshelf', 200, 6, 1.4)).toEqual({ type: 'lowshelf', frequency: 200, gain: 6 });
    expect(makeFilter('highshelf', 4000, -6, 1.4)).toEqual({ type: 'highshelf', frequency: 4000, gain: -6 });
  });
});

describe('signForMode', () => {
  it('is deterministic for the fixed-direction modes', () => {
    expect(signForMode('boost')).toBe(1);
    expect(signForMode('sweep')).toBe(1);
    expect(signForMode('cut')).toBe(-1);
    expect(signForMode('pass')).toBe(-1);
  });

  it('randomly picks a direction in the mixed modes', () => {
    const spy = vi.spyOn(Math, 'random');
    spy.mockReturnValue(0.4);
    expect(signForMode('both')).toBe(1);
    spy.mockReturnValue(0.6);
    expect(signForMode('shelf')).toBe(-1);
  });
});

describe('pickDirection', () => {
  it('is true only where the direction is part of the puzzle', () => {
    expect(pickDirection('both')).toBe(true);
    expect(pickDirection('shelf')).toBe(true);
    expect(pickDirection('boost')).toBe(false);
    expect(pickDirection('cut')).toBe(false);
    expect(pickDirection('pass')).toBe(false);
    expect(pickDirection('sweep')).toBe(false);
  });
});

describe('freqToNote', () => {
  it('converts frequencies to the nearest MIDI note', () => {
    expect(freqToNote(440)).toBe('~A4');
    expect(freqToNote(261.63)).toBe('~C4');
    expect(freqToNote(27.5)).toBe('~A0');
  });
});

describe('freqRegion', () => {
  it('maps frequency ranges to their mixing-region labels', () => {
    expect(freqRegion(20)).toBe('Sub Bass');
    expect(freqRegion(79)).toBe('Sub Bass');
    expect(freqRegion(80)).toBe('Bass');
    expect(freqRegion(249)).toBe('Bass');
    expect(freqRegion(250)).toBe('Low Mid');
    expect(freqRegion(500)).toBe('Midrange');
    expect(freqRegion(1999)).toBe('Midrange');
    expect(freqRegion(2000)).toBe('Upper Mid');
    expect(freqRegion(4000)).toBe('Presence');
    expect(freqRegion(7999)).toBe('Presence');
    expect(freqRegion(8000)).toBe('Brilliance');
    expect(freqRegion(20000)).toBe('Brilliance');
  });
});

describe('freq labels', () => {
  it('shows Hz below 1 kHz and compact kHz above', () => {
    expect(FREQ_UNIT(999)).toBe('Hz');
    expect(FREQ_UNIT(1000)).toBe('kHz');
    expect(FREQ_LABEL(800)).toBe('800');
    expect(FREQ_LABEL(999)).toBe('999');
    expect(FREQ_LABEL(1000)).toBe('1');
    expect(FREQ_LABEL(1240)).toBe('1.2');
    expect(FREQ_LABEL(20000)).toBe('20');
  });
});
describe('describeRegion', () => {
  it('names the region and note and describes a boost or a cut', () => {
    expect(describeRegion(100, 1)).toEqual({ region: 'Bass', note: freqToNote(100), character: 'fuller, boomy' });
    expect(describeRegion(100, -1).character).toBe('thinner, lighter');
    expect(describeRegion(10000, 1).character).toBe('airy, sparkly');
    expect(describeRegion(10000, -1).character).toBe('dull, dark');
  });

  it('has a boost and a cut description for every region', () => {
    for (const f of [40, 150, 350, 1000, 3000, 6000, 12000]) {
      const up = describeRegion(f, 1), down = describeRegion(f, -1);
      expect(up.region).toBe(freqRegion(f));
      expect(up.character).toMatch(/\w/);
      expect(down.character).toMatch(/\w/);
      expect(up.character).not.toBe(down.character);
    }
  });

  it('follows the region edges used by freqRegion', () => {
    expect(describeRegion(79, 1).region).toBe('Sub Bass');
    expect(describeRegion(80, 1).region).toBe('Bass');
    expect(describeRegion(7999, 1).region).toBe('Presence');
    expect(describeRegion(8000, 1).region).toBe('Brilliance');
  });

  it('reports no change for zero gain', () => {
    expect(describeRegion(1000, 0).character).toBe('no change');
  });
});

describe('EXPLORE_TYPES', () => {
  it('offers bell, shelves, and pass filters in keyboard order', () => {
    expect(EXPLORE_TYPES.map(t => t.type)).toEqual(['peaking', 'lowshelf', 'highshelf', 'highpass', 'lowpass']);
  });
});

describe('How Much? levels', () => {
  it('adds choices every level, sorted, never 0 dB, within ±12 dB', () => {
    GAIN_LEVELS.forEach((opts, i) => {
      if (i > 0) expect(opts.length).toBeGreaterThan(GAIN_LEVELS[i - 1].length);
      expect([...opts].sort((a, b) => a - b)).toEqual(opts);
      expect(opts).not.toContain(0);
      for (const g of opts) expect(Math.abs(g)).toBeLessThanOrEqual(12);
    });
    // cuts join in at level 5
    expect(GAIN_LEVELS[3].every(g => g > 0)).toBe(true);
    expect(GAIN_LEVELS[4].some(g => g < 0)).toBe(true);
  });

  it('places the bell between 60 Hz and 12 kHz', () => {
    expect(GAIN_FREQS).toHaveLength(24);
    expect(Math.min(...GAIN_FREQS)).toBeGreaterThanOrEqual(60);
    expect(Math.max(...GAIN_FREQS)).toBeLessThanOrEqual(12000);
  });
});

describe('Match EQ tolerance', () => {
  it('tightens in both octaves and dB as the level rises', () => {
    for (let i = 1; i < MATCH_TOLERANCE.length; i++) {
      expect(MATCH_TOLERANCE[i].oct).toBeLessThan(MATCH_TOLERANCE[i - 1].oct);
      expect(MATCH_TOLERANCE[i].db).toBeLessThan(MATCH_TOLERANCE[i - 1].db);
    }
    // frequency tolerances match Sweep's
    expect(MATCH_TOLERANCE.map(t => t.oct)).toEqual(SWEEP_TOLERANCE);
  });

  it('needs both errors inside the level\'s tolerance', () => {
    expect(withinMatchTolerance(1, 4, 1)).toBe(true);
    expect(withinMatchTolerance(1.01, 0, 1)).toBe(false);
    expect(withinMatchTolerance(0, 4.5, 1)).toBe(false);
    expect(withinMatchTolerance(1 / 6, 1.5, 5)).toBe(true);
    expect(withinMatchTolerance(0.2, 1, 5)).toBe(false);
  });

  it('hides gains the match range can reach', () => {
    for (const g of MATCH_GAINS) expect(g).toBeLessThanOrEqual(MATCH_RANGE_DB);
    expect(Math.min(...MATCH_GAINS)).toBeGreaterThanOrEqual(3);
  });
});
