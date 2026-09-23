// Shows this session's score once you've answered; before that, your saved
// lifetime score (if any), so returning visitors see where they stand.
export function ScoreBoard({ scores, lifetime, onReset }) {
  const inSession = scores.total > 0;
  if (!inSession && lifetime.total === 0) return null;

  const { total, correct } = inSession ? scores : lifetime;
  const pct = Math.round((correct / total) * 100);
  const fill = `${pct}%`;

  return (
    <section className="card score-card">
      <div className="score-header">
        <h2>{inSession ? 'Score' : 'Lifetime Score'}</h2>
        {inSession && <button className="btn-ghost" onClick={onReset}>Reset</button>}
      </div>
      <div className="score-body">
        <div className="score-number">
          <span className="score-big">{correct}</span>
          <span className="score-sep">/</span>
          <span className="score-total">{total}</span>
        </div>
        <div className="score-bar-wrap">
          <div className="score-bar">
            <div
              className="score-fill"
              style={{ width: fill, background: pct >= 75 ? 'var(--green)' : pct >= 50 ? 'var(--a)' : 'var(--red)' }}
            />
          </div>
          <span className="score-pct">{pct}%</span>
        </div>
        <p className="score-note">
          {pct === 100 ? 'Perfect ear!' :
           pct >= 75 ? 'Great listening!' :
           pct >= 50 ? 'Keep training.' :
           'Chance level — try headphones or turn up the volume.'}
        </p>
        {inSession && lifetime.total > total && (
          <p className="score-lifetime">
            Lifetime {lifetime.correct}/{lifetime.total} · {Math.round((lifetime.correct / lifetime.total) * 100)}%
          </p>
        )}
      </div>
    </section>
  );
}
