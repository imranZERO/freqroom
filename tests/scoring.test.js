import { describe, it, expect } from 'vitest';
import {
  choicesFor, maxPoints, sweepCredit, trialPoints, addResult, accuracy,
  EMPTY_TALLY, RECENT_COUNT, POINTS_PER_BIT, SWEEP_ZERO_AT,
} from '../src/lib/scoring.js';
import { SWEEP_TOLERANCE } from '../src/lib/trainer.js';

describe('choicesFor / maxPoints', () => {
  it('counts bands, doubled where the direction is part of the answer', () => {
    expect(choicesFor('boost', 5)).toBe(5);
    expect(choicesFor('pass', 8)).toBe(8);
    expect(choicesFor('both', 5)).toBe(10);
    expect(choicesFor('shelf', 4)).toBe(8);
  });

  it('gives 10 points per bit of choice', () => {
    expect(POINTS_PER_BIT).toBe(10);
    expect(maxPoints('boost', 2)).toBe(10);   // 1 bit
    expect(maxPoints('boost', 4)).toBe(20);   // 2 bits
    expect(maxPoints('boost', 15)).toBe(39);  // log2(15) ≈ 3.91
    expect(maxPoints('both', 15)).toBe(49);   // 30 choices
    expect(maxPoints('shelf', 8)).toBe(40);
  });

  it('rewards harder levels in every mode', () => {
    for (const [mode, lo, hi] of [['boost', 2, 15], ['cut', 2, 15], ['both', 2, 15], ['shelf', 2, 8], ['pass', 2, 8], ['sweep', 1, 5]]) {
      for (let l = lo; l < hi; l++) expect(maxPoints(mode, l + 1)).toBeGreaterThan(maxPoints(mode, l));
    }
  });

  it('prices Sweep by how many tolerance windows fit its range', () => {
    // 40 Hz–16 kHz is log2(400) ≈ 8.64 octaves; ±1 oct → ~4.3 windows, ±⅙ → ~26
    expect(choicesFor('sweep', 1)).toBeCloseTo(4.32, 2);
    expect(choicesFor('sweep', 5)).toBeCloseTo(25.93, 2);
    expect(maxPoints('sweep', 1)).toBe(21);
    expect(maxPoints('sweep', 5)).toBe(47);
  });
});

describe('sweepCredit', () => {
  it('is full inside the tolerance and zero from SWEEP_ZERO_AT × tolerance', () => {
    SWEEP_TOLERANCE.forEach((tol, i) => {
      const level = i + 1;
      expect(sweepCredit(0, level)).toBe(1);
      expect(sweepCredit(tol, level)).toBe(1);
      expect(sweepCredit(tol * 2, level)).toBeCloseTo(0.5, 9);
      expect(sweepCredit(tol * SWEEP_ZERO_AT, level)).toBeCloseTo(0, 9);
      expect(sweepCredit(tol * 10, level)).toBe(0);
    });
  });
});

describe('trialPoints', () => {
  it('scores band answers all or nothing', () => {
    expect(trialPoints({ mode: 'boost', level: 4, correct: true })).toBe(20);
    expect(trialPoints({ mode: 'boost', level: 4, correct: false })).toBe(0);
  });

  it('gives Sweep partial credit for near misses', () => {
    // level 1: ±1 octave; 2 octaves off is halfway to zero credit
    expect(trialPoints({ mode: 'sweep', level: 1, correct: true, errOct: 0.4 })).toBe(21);
    expect(trialPoints({ mode: 'sweep', level: 1, correct: false, errOct: 2 })).toBe(11);
    expect(trialPoints({ mode: 'sweep', level: 1, correct: false, errOct: 3.5 })).toBe(0);
  });
});

describe('addResult', () => {
  const r = (correct, extra = {}) => ({ mode: 'boost', level: 3, correct, points: correct ? 16 : 0, ...extra });

  it('sums totals and points and leaves the input untouched', () => {
    const before = structuredClone(EMPTY_TALLY);
    const a = addResult(before, r(true));
    expect(before).toEqual(EMPTY_TALLY);
    expect(a).toMatchObject({ total: 1, correct: 1, points: 16 });
  });

  it('tracks the current and best streak', () => {
    let t = EMPTY_TALLY;
    for (const c of [true, true, true, false, true]) t = addResult(t, r(c));
    expect(t.streak).toBe(1);
    expect(t.bestStreak).toBe(3);
  });

  it('keeps only the last RECENT_COUNT answers, oldest first', () => {
    let t = EMPTY_TALLY;
    for (let i = 0; i < RECENT_COUNT + 3; i++) t = addResult(t, r(i % 2 === 0));
    expect(t.recent).toHaveLength(RECENT_COUNT);
    expect(t.recent.at(-1)).toBe((RECENT_COUNT + 2) % 2 === 0);
  });

  it('keeps a row per mode with current and best level and Sweep error', () => {
    let t = addResult(EMPTY_TALLY, r(true, { level: 4 }));
    t = addResult(t, r(false, { level: 3 }));
    t = addResult(t, { mode: 'sweep', level: 2, correct: true, points: 30, errOct: 0.2 });
    t = addResult(t, { mode: 'sweep', level: 2, correct: false, points: 5, errOct: 0.6 });
    expect(t.modes.boost).toMatchObject({ total: 2, correct: 1, points: 16, level: 3, bestLevel: 4, errN: 0 });
    expect(t.modes.sweep).toMatchObject({ total: 2, correct: 1, points: 35, errN: 2 });
    expect(t.modes.sweep.errSum).toBeCloseTo(0.8, 9);
    expect(t.points).toBe(51);
  });

  it('accepts an old saved lifetime with only total and correct', () => {
    const t = addResult({ total: 10, correct: 7 }, r(true));
    expect(t).toMatchObject({ total: 11, correct: 8, points: 16, streak: 1, bestStreak: 1, recent: [true] });
  });
});

describe('accuracy', () => {
  it('is a whole percentage, or null before any answers', () => {
    expect(accuracy({ total: 0, correct: 0 })).toBeNull();
    expect(accuracy({ total: 3, correct: 2 })).toBe(67);
  });
});
