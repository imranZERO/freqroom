// Scoring: points scaled by how hard each trial was, partial credit for Sweep,
// and the running tallies (session and lifetime) the ScoreBoard shows.
import { SWEEP_TOLERANCE, SWEEP_RANGE, GAIN_LEVELS, MATCH_TOLERANCE, MATCH_RANGE_DB, pickDirection } from './trainer.js';

// 10 points per bit: doubling the number of possible answers adds 10 points
export const POINTS_PER_BIT = 10;
// Sweep and Match credit is full inside the tolerance and fades to zero at this multiple of it
export const SWEEP_ZERO_AT = 3;
// How many recent answers the hit/miss lamps show
export const RECENT_COUNT = 10;

const SWEEP_OCTAVES = Math.log2(SWEEP_RANGE[1] / SWEEP_RANGE[0]);

// How many distinct answers a trial offers. Mixed and Shelves double the bands
// (each has a boost and a cut row); How Much? counts its dB keys; Sweep counts
// how many tolerance-wide windows fit across its range, and Match EQ multiplies
// that by the tolerance-wide windows across its ±12 dB gain range.
export function choicesFor(mode, level) {
  if (mode === 'sweep') return SWEEP_OCTAVES / (2 * SWEEP_TOLERANCE[level - 1]);
  if (mode === 'gain') return GAIN_LEVELS[level - 1].length;
  if (mode === 'match') {
    const tol = MATCH_TOLERANCE[level - 1];
    return (SWEEP_OCTAVES / (2 * tol.oct)) * ((2 * MATCH_RANGE_DB) / (2 * tol.db));
  }
  return level * (pickDirection(mode) ? 2 : 1);
}

// Points for a fully correct answer at this mode and level
export function maxPoints(mode, level) {
  return Math.round(POINTS_PER_BIT * Math.log2(Math.max(2, choicesFor(mode, level))));
}

// Share of the points an error earns: 1 within the tolerance, then a linear
// fade to 0 at SWEEP_ZERO_AT × tolerance
export function fadeCredit(err, tol) {
  if (err <= tol) return 1;
  return Math.max(0, 1 - (err - tol) / ((SWEEP_ZERO_AT - 1) * tol));
}

export const sweepCredit = (errOct, level) => fadeCredit(errOct, SWEEP_TOLERANCE[level - 1]);

// Match EQ: the weaker of the frequency and gain credits
export function matchCredit(errOct, errDb, level) {
  const tol = MATCH_TOLERANCE[level - 1];
  return Math.min(fadeCredit(errOct, tol.oct), fadeCredit(errDb, tol.db));
}

// Points for one answered trial; `level` is the level it was answered at
export function trialPoints({ mode, level, correct, errOct = null, errDb = null }) {
  const credit = mode === 'sweep' ? sweepCredit(errOct, level)
    : mode === 'match' ? matchCredit(errOct, errDb, level)
    : correct ? 1 : 0;
  return Math.round(maxPoints(mode, level) * credit);
}

// A tally: totals, streaks, the last few answers, and a row per mode.
// Older saved lifetimes only have { total, correct }; the ?? defaults cover them.
export const EMPTY_TALLY = { total: 0, correct: 0, points: 0, streak: 0, bestStreak: 0, recent: [], modes: {} };
const EMPTY_MODE = { total: 0, correct: 0, points: 0, level: 0, bestLevel: 0, errSum: 0, errN: 0, errDbSum: 0, errDbN: 0 };

// Returns a new tally with one result added. `level` is the mode's level after
// the answer (what the breakdown shows as current); `errOct` is set for Sweep and
// Match EQ, `errDb` for Match EQ.
export function addResult(tally, { mode, level, correct, points = 0, errOct = null, errDb = null }) {
  const m = { ...EMPTY_MODE, ...tally.modes?.[mode] };
  const streak = correct ? (tally.streak ?? 0) + 1 : 0;
  return {
    total: (tally.total ?? 0) + 1,
    correct: (tally.correct ?? 0) + (correct ? 1 : 0),
    points: (tally.points ?? 0) + points,
    streak,
    bestStreak: Math.max(tally.bestStreak ?? 0, streak),
    recent: [...(tally.recent ?? []), correct].slice(-RECENT_COUNT),
    modes: {
      ...tally.modes,
      [mode]: {
        total: m.total + 1,
        correct: m.correct + (correct ? 1 : 0),
        points: m.points + points,
        level,
        bestLevel: Math.max(m.bestLevel, level),
        errSum: m.errSum + (errOct ?? 0),
        errN: m.errN + (errOct === null ? 0 : 1),
        errDbSum: m.errDbSum + (errDb ?? 0),
        errDbN: m.errDbN + (errDb === null ? 0 : 1),
      },
    },
  };
}

// Accuracy as a whole percentage, or null before any answers
export const accuracy = ({ total = 0, correct = 0 }) => (total ? Math.round((correct / total) * 100) : null);
