import { describe, it, expect } from 'vitest';
import { clampStartOffset, clampToLoopOffset } from '../src/lib/audioEngineMath.js';

describe('clampStartOffset', () => {
  it('passes offsets inside the buffer through unchanged', () => {
    expect(clampStartOffset(0, 10, 48000)).toBe(0);
    expect(clampStartOffset(9.5, 10, 48000)).toBe(9.5);
  });

  it('pulls offsets at/after the very end just inside so a sample plays', () => {
    expect(clampStartOffset(10, 10, 48000)).toBeCloseTo(10 - 1 / 48000, 10);
    expect(clampStartOffset(14.3, 10, 48000)).toBeCloseTo(10 - 1 / 48000, 10);
  });

  it('keeps the result above zero even for an impossibly short buffer', () => {
    expect(clampStartOffset(5, 0.00001, 48000)).toBe(0);
  });

  it('honours the sample rate when backing off', () => {
    const short = clampStartOffset(10, 10, 44100);
    const long = clampStartOffset(10, 10, 96000);
    expect(short).toBeCloseTo(10 - 1 / 44100, 10);
    expect(long).toBeCloseTo(10 - 1 / 96000, 10);
  });
});

describe('clampToLoopOffset', () => {
  const region = { start: 2, end: 5 };

  it('passes offsets inside the region through unchanged', () => {
    expect(clampToLoopOffset(2, region)).toBe(2);
    expect(clampToLoopOffset(4.9, region)).toBe(4.9);
  });

  it('snaps offsets before the region to its start', () => {
    expect(clampToLoopOffset(0, region)).toBe(2);
    expect(clampToLoopOffset(1.9, region)).toBe(2);
  });

  it('snaps offsets at/after the region end to its start', () => {
    expect(clampToLoopOffset(5, region)).toBe(2);
    expect(clampToLoopOffset(8, region)).toBe(2);
  });

  it('returns the offset unchanged when there is no region', () => {
    expect(clampToLoopOffset(8, null)).toBe(8);
    expect(clampToLoopOffset(0, undefined)).toBe(0);
  });
});