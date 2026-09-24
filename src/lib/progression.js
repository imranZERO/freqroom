// Level progression rules: 3 correct in a row to advance, 2 wrong in a row to
// drop, with the band count clamped between MIN_LEVEL and MAX_LEVEL (per-mode
// overrides can narrow that range).
export const CORRECT_TO_ADVANCE = 3;
export const WRONG_TO_DECREASE = 2;
export const MIN_LEVEL = 2;
export const MAX_LEVEL = 15;

// Applies a single answer to the current level and streak counters.
export function applyAnswer({ correct, correctStreak = 0, wrongStreak = 0, level, minLevel = MIN_LEVEL, maxLevel = MAX_LEVEL }) {
  let cs = correct ? correctStreak + 1 : 0;
  let ws = correct ? 0 : wrongStreak + 1;
  let lv = level;

  if (cs >= CORRECT_TO_ADVANCE) { lv = Math.min(maxLevel, level + 1); cs = 0; }
  else if (ws >= WRONG_TO_DECREASE) { lv = Math.max(minLevel, level - 1); ws = 0; }

  return { level: lv, correctStreak: cs, wrongStreak: ws };
}