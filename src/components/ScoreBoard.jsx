export function ScoreBoard({ scores, onReset }) {
  const { total, correct } = scores;
  if (total === 0) return null;

  const pct = Math.round((correct / total) * 100);
  const fill = `${pct}%`;

  return (
    <section className="card score-card">
      <div className="score-header">
        <h2>Score</h2>
        <button className="btn-ghost" onClick={onReset}>Reset</button>
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
              style={{ width: fill, background: pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444' }}
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
      </div>
    </section>
  );
}
