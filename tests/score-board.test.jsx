// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { ScoreBoard } from '../src/components/ScoreBoard.jsx';
import { EMPTY_TALLY, addResult } from '../src/lib/scoring.js';

afterEach(() => cleanup());

const MODES = [{ id: 'boost', label: 'Boosts' }, { id: 'sweep', label: 'Sweep' }];

function tallyOf(results) {
  return results.reduce(addResult, EMPTY_TALLY);
}

function renderBoard({ session = EMPTY_TALLY, lifetime = EMPTY_TALLY } = {}) {
  const onReset = vi.fn();
  const utils = render(<ScoreBoard session={session} lifetime={lifetime} modes={MODES} onReset={onReset} />);
  return { onReset, ...utils };
}

describe('ScoreBoard', () => {
  it('is visible before any answers, dimmed, with no Reset or mode table', () => {
    const { container } = renderBoard();
    expect(screen.getByText('Score')).toBeInTheDocument();
    expect(container.querySelector('.score-card')).toHaveClass('is-empty');
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/Answer a trial to start scoring/)).toBeInTheDocument();
    expect(screen.queryByText('Reset')).toBeNull();
    expect(container.querySelector('.score-modes')).toBeNull();
    expect(container.querySelectorAll('.score-lamp')).toHaveLength(10);
  });

  it('shows points, accuracy, streaks, recent lamps, and a row per mode', () => {
    const session = tallyOf([
      { mode: 'boost', level: 3, correct: true, points: 10 },
      { mode: 'boost', level: 3, correct: true, points: 16 },
      { mode: 'boost', level: 2, correct: false, points: 0 },
      { mode: 'sweep', level: 1, correct: false, points: 11, errOct: 2 },
    ]);
    const { container } = renderBoard({ session });
    expect(container.querySelector('.score-big').textContent).toBe('37');
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(container.querySelector('.score-facts').textContent).toBe('2/4 correctStreak 0Best 2');
    expect(container.querySelectorAll('.score-lamp.is-hit')).toHaveLength(2);
    expect(container.querySelectorAll('.score-lamp.is-miss')).toHaveLength(2);
    const rows = [...container.querySelectorAll('.score-modes tbody tr')].map(tr => tr.textContent);
    expect(rows).toEqual([
      'Boosts2best 32/367%26',
      'Sweepavg 2.00 oct off10/10%11',
    ]);
  });

  it('switches to the lifetime tally and back', () => {
    const lifetime = tallyOf([{ mode: 'boost', level: 5, correct: true, points: 23 }]);
    const { container } = renderBoard({ lifetime });
    fireEvent.click(screen.getByRole('tab', { name: 'Lifetime' }));
    expect(container.querySelector('.score-big').textContent).toBe('23');
    expect(screen.getByRole('tab', { name: 'Lifetime' })).toHaveAttribute('aria-selected', 'true');
    // Reset clears the session only, so it isn't offered on the lifetime view
    expect(screen.queryByText('Reset')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Session' }));
    expect(container.querySelector('.score-card')).toHaveClass('is-empty');
  });

  it('handles an old saved lifetime with only total and correct', () => {
    const { container } = renderBoard({ lifetime: { total: 40, correct: 30 } });
    fireEvent.click(screen.getByRole('tab', { name: 'Lifetime' }));
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(container.querySelector('.score-big').textContent).toBe('0');
  });

  it('resets the session', () => {
    const { onReset } = renderBoard({ session: tallyOf([{ mode: 'boost', level: 2, correct: true, points: 10 }]) });
    fireEvent.click(screen.getByText('Reset'));
    expect(onReset).toHaveBeenCalled();
  });
});
