import { describe, it, expect } from 'vitest';
import { applyAnswer, CORRECT_TO_ADVANCE, WRONG_TO_DECREASE, MIN_LEVEL, MAX_LEVEL } from '../src/lib/progression.js';

// Helper: run applyAnswer for a streak of answers (strings of true/false)
const run = (answers, { level = 5 } = {}) => {
  let s = { level, correctStreak: 0, wrongStreak: 0 };
  for (const correct of answers) s = applyAnswer({ ...s, correct });
  return s;
};

describe('constants', () => {
  it('advances after 3 correct, drops after 2 wrong, bands 2..15', () => {
    expect(CORRECT_TO_ADVANCE).toBe(3);
    expect(WRONG_TO_DECREASE).toBe(2);
    expect(MIN_LEVEL).toBe(2);
    expect(MAX_LEVEL).toBe(15);
  });
});

describe('applyAnswer', () => {
  it('builds a correct streak and levels up after 3', () => {
    const s = run([true, true, true], { level: 5 });
    expect(s).toEqual({ level: 6, correctStreak: 0, wrongStreak: 0 });
  });

  it('a wrong answer resets the correct streak', () => {
    const s = run([true, true, false], { level: 5 });
    expect(s).toEqual({ level: 5, correctStreak: 0, wrongStreak: 1 });
  });

  it('drops a level after 2 wrong answers and resets the wrong streak', () => {
    const s = run([false, false], { level: 5 });
    expect(s).toEqual({ level: 4, correctStreak: 0, wrongStreak: 0 });
  });

  it('resets a wrong streak on a correct answer', () => {
    const s = run([false, true], { level: 5 });
    expect(s).toEqual({ level: 5, correctStreak: 1, wrongStreak: 0 });
  });

  it('clamps at the floor', () => {
    const s = run([false, false], { level: MIN_LEVEL });
    expect(s.level).toBe(MIN_LEVEL);
  });

  it('clamps at the ceiling', () => {
    const s = run([true, true, true], { level: MAX_LEVEL });
    expect(s.level).toBe(MAX_LEVEL);
  });

  it('respects a tighter per-mode range', () => {
    // floor: advancing the wrong streak would drop below minLevel → clamps there
    const atFloor = applyAnswer({ correct: false, wrongStreak: 1, level: 3, minLevel: 3, maxLevel: 8 });
    expect(atFloor.level).toBe(3);
    // ceiling: the correct streak would exceed maxLevel → clamps there
    const atCap = applyAnswer({ correct: true, correctStreak: 2, level: 8, minLevel: 3, maxLevel: 8 });
    expect(atCap.level).toBe(8);
  });

  it('does not advance when the streak is interrupted by its own advance', () => {
    // 3 correct advances and resets; the 4th correct starts a new streak
    const s = run([true, true, true, true], { level: 5 });
    expect(s).toEqual({ level: 6, correctStreak: 1, wrongStreak: 0 });
  });
});