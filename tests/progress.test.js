import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BUCKETS, EMPTY_PROGRESS, bucketOf, recordResult, heatFor, pickWeighted } from '../src/lib/progress.js';

describe('bucketOf', () => {
  it('maps the standard octave centres exactly', () => {
    expect(bucketOf(31.5)).toBe(0);
    expect(bucketOf(63)).toBe(1);
    expect(bucketOf(125)).toBe(2);
    expect(bucketOf(250)).toBe(3);
    expect(bucketOf(500)).toBe(4);
    expect(bucketOf(1000)).toBe(5);
    expect(bucketOf(2000)).toBe(6);
    expect(bucketOf(4000)).toBe(7);
    expect(bucketOf(8000)).toBe(8);
    expect(bucketOf(16000)).toBe(9);
  });

  it('buckets by the nearest octave from 31.5 Hz', () => {
    // Geometric means between centres: √(31.5·63) ≈ 44.55, √(63·125) ≈ 89.1
    expect(bucketOf(31.5)).toBe(0);
    expect(bucketOf(40)).toBe(0);
    expect(bucketOf(50)).toBe(1);
    expect(bucketOf(90)).toBe(2);
    expect(bucketOf(44)).toBe(0); // just under the 31.5/63 boundary
    expect(bucketOf(45)).toBe(1); // just over it
  });

  it('clamps to the outer buckets', () => {
    expect(bucketOf(20)).toBe(0);
    expect(bucketOf(1)).toBe(0);
    expect(bucketOf(22000)).toBe(9);
    expect(bucketOf(1e6)).toBe(9);
  });
});

describe('recordResult', () => {
  it('returns a new object and leaves the input untouched', () => {
    const before = { levels: {}, lifetime: { total: 0, correct: 0 }, stats: {} };
    const after = recordResult(before, { mode: 'boost', family: 'peak', freq: 1000, correct: true, level: 3 });
    expect(after).not.toBe(before);
    expect(before).toEqual(EMPTY_PROGRESS);
  });

  it('increments lifetime during and total', () => {
    const a = recordResult(EMPTY_PROGRESS, { mode: 'boost', family: 'peak', freq: 1000, correct: true, level: 3 });
    const b = recordResult(a, { mode: 'boost', family: 'peak', freq: 500, correct: false, level: 3 });
    expect(b.lifetime).toEqual({ total: 2, correct: 1 });
  });

  it('records the level per mode', () => {
    const a = recordResult(EMPTY_PROGRESS, { mode: 'sweep', family: 'sweep', freq: 1000, correct: true, level: 5 });
    expect(a.levels.sweep).toBe(5);
    // different modes are tracked separately
    const b = recordResult(a, { mode: 'boost', family: 'peak', freq: 1000, correct: false, level: 2 });
    expect(b.levels.boost).toBe(2);
    expect(b.levels.sweep).toBe(5);
  });

  it('keeps family stats in their own buckets', () => {
    const a = recordResult(EMPTY_PROGRESS, { mode: 'boost', family: 'peak', freq: 1000, correct: true, level: 3 });
    expect(a.stats.peak).toBeDefined();
    expect(a.stats.shelf).toBeUndefined();
    const b = recordResult(a, { mode: 'shelf', family: 'shelf', freq: 250, correct: false, level: 3 });
    expect(b.stats.peak[5]).toEqual({ n: 1, hits: 1 });
    expect(b.stats.shelf[3]).toEqual({ n: 1, hits: 0 });
  });
});

describe('heatFor', () => {
  it('returns one entry per octave bucket', () => {
    expect(heatFor(EMPTY_PROGRESS, 'peak')).toHaveLength(BUCKETS.length);
    expect(heatFor(EMPTY_PROGRESS, 'peak').every(b => b.n === 0 && b.acc === null)).toBe(true);
  });

  it('reports null accuracy until there are enough attempts', () => {
    let p = EMPTY_PROGRESS;
    p = recordResult(p, { mode: 'boost', family: 'peak', freq: 1000, correct: true, level: 3 });
    p = recordResult(p, { mode: 'boost', family: 'peak', freq: 1000, correct: false, level: 3 });
    expect(heatFor(p, 'peak')[5].acc).toBeNull();
    p = recordResult(p, { mode: 'boost', family: 'peak', freq: 1000, correct: true, level: 3 });
    expect(heatFor(p, 'peak')[5].acc).toBeCloseTo(2 / 3, 10);
  });

  it('ignores other families', () => {
    let p = recordResult(EMPTY_PROGRESS, { mode: 'shelf', family: 'shelf', freq: 1000, correct: true, level: 3 });
    p = recordResult(p, { mode: 'shelf', family: 'shelf', freq: 1000, correct: true, level: 3 });
    p = recordResult(p, { mode: 'shelf', family: 'shelf', freq: 1000, correct: true, level: 3 });
    expect(heatFor(p, 'peak').every(b => b.acc === null)).toBe(true);
  });
});

describe('pickWeighted', () => {
  const bands = [100, 1000, 10000];
  const call = (prog, rv) => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(rv);
    try { return pickWeighted(bands, prog, 'peak'); } finally { spy.mockRestore(); }
  };

  it('returns a band from the pool', () => {
    expect(bands).toContain(call(EMPTY_PROGRESS, 0.5));
  });

  it('is deterministic at the extremes of random()', () => {
    // r = 0 lands on the first band, r just under 1 exhausts the cumulative sum
    expect(call(EMPTY_PROGRESS, 0)).toBe(100);
    expect(call(EMPTY_PROGRESS, 0.9999)).toBe(10000);
  });

  it('favours buckets with lower accuracy', () => {
    // 3 misses in the 100 Hz bucket (acc 0 → weight 1.15) vs 3 hits in 1000/10000
    let p = EMPTY_PROGRESS;
    for (let i = 0; i < 3; i++) {
      p = recordResult(p, { mode: 'boost', family: 'peak', freq: 100, correct: false, level: 3 });
      p = recordResult(p, { mode: 'boost', family: 'peak', freq: 1000, correct: true, level: 3 });
      p = recordResult(p, { mode: 'boost', family: 'peak', freq: 10000, correct: true, level: 3 });
    }
    // weights: [1.15, 0.15, 0.15]; cumulative 1.45. r just under the first band
    // weight (1.15) must pick the low-accuracy 100 Hz band.
    const results = new Set();
    for (const rv of [0, 0.1, 0.5, 0.9, 0.999]) results.add(call(p, rv));
    expect(results).toContain(100);
  });
});