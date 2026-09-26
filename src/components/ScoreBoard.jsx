import { useState } from 'react';
import { EMPTY_TALLY, RECENT_COUNT, accuracy } from '../lib/scoring.js';

const VIEWS = [['session', 'Session'], ['lifetime', 'Lifetime']];

// Points, accuracy, streaks, the last few answers, and a row per mode played,
// for this session or all time. Always shown; dimmed until there's a score.
export function ScoreBoard({ session, lifetime, modes, onReset }) {
  const [view, setView] = useState('session');
  const tally = { ...EMPTY_TALLY, ...(view === 'session' ? session : lifetime) };
  const started = tally.total > 0;
  const pct = accuracy(tally);
  const rows = modes.filter(m => tally.modes[m.id]?.total);

  // Newest answer on the right; unused slots on the left stay dark
  const pad = RECENT_COUNT - tally.recent.length;
  const lamps = Array.from({ length: RECENT_COUNT }, (_, i) => (i < pad ? null : tally.recent[i - pad]));

  return (
    <section className={`card score-card${started ? '' : ' is-empty'}`}>
      <div className="score-header">
        <h2>Score</h2>
        <div className="score-tabs" role="tablist" aria-label="Score period">
          {VIEWS.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              className={`score-tab${view === id ? ' is-active' : ''}`}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {view === 'session' && started && (
          <button className="btn-ghost score-reset" onClick={onReset}>Reset</button>
        )}
      </div>

      <div className="score-summary">
        <div className="score-points">
          <span className="score-big">{tally.points.toLocaleString('en-US')}</span>
          <span className="score-unit">pts</span>
        </div>
        <div className="score-stats">
          <div className="score-bar-wrap">
            <div className="score-bar">
              <div
                className="score-fill"
                style={{ width: `${pct ?? 0}%`, background: pct >= 75 ? 'var(--green)' : pct >= 50 ? 'var(--a)' : 'var(--red)' }}
              />
            </div>
            <span className="score-pct">{pct === null ? '—' : `${pct}%`}</span>
          </div>
          <div className="score-facts">
            <span><strong>{tally.correct}/{tally.total}</strong> correct</span>
            <span>Streak <strong>{tally.streak}</strong></span>
            <span>Best <strong>{tally.bestStreak}</strong></span>
          </div>
        </div>
        <div className="score-recent">
          <span className="score-mini-label">Last {RECENT_COUNT}</span>
          <div className="score-lamps" aria-label={`Last ${tally.recent.length} answers: ${tally.recent.map(r => (r ? 'hit' : 'miss')).join(', ') || 'none yet'}`}>
            {lamps.map((r, i) => (
              <span key={i} className={`score-lamp${r === true ? ' is-hit' : r === false ? ' is-miss' : ''}`} />
            ))}
          </div>
        </div>
      </div>

      {!started ? (
        <p className="score-note">
          {view === 'session'
            ? 'Answer a trial to start scoring. Harder trials earn more points: more bands, picking the direction too, or a tighter Sweep.'
            : 'Nothing saved yet — your all-time score builds up here as you train.'}
        </p>
      ) : (
        <div className="score-modes-wrap">
          <table className="score-modes">
            <thead>
              <tr><th>Mode</th><th>Level</th><th>Correct</th><th>Points</th></tr>
            </thead>
            <tbody>
              {rows.map(m => {
                const r = tally.modes[m.id];
                return (
                  <tr key={m.id}>
                    <td>
                      {m.label}
                      {r.errN > 0 && <span className="score-mode-note">avg {(r.errSum / r.errN).toFixed(2)} oct off</span>}
                    </td>
                    <td>{r.level}{r.bestLevel > r.level && <span className="score-mode-note">best {r.bestLevel}</span>}</td>
                    <td>{r.correct}/{r.total}<span className="score-mode-note">{accuracy(r)}%</span></td>
                    <td className="score-mode-points">{r.points.toLocaleString('en-US')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
