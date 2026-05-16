const LABELS = {
  A: { hint: 'Flat (no EQ)', color: 'btn-a' },
  B: { hint: 'With EQ applied', color: 'btn-b' },
  X: { hint: 'Unknown — is this A or B?', color: 'btn-x' },
};

export function ABXPlayer({ engine, preset, trial, onNewTrial, onPlay, onAnswer }) {
  if (!engine.isLoaded) {
    return (
      <section className="card abx-card placeholder">
        <p>Load a source audio track above to begin.</p>
      </section>
    );
  }

  if (!trial) {
    return (
      <section className="card abx-card placeholder">
        <button className="btn-primary large" onClick={onNewTrial}>
          Start Trial
        </button>
        <p className="hint">A new trial randomly assigns X to either A or B</p>
      </section>
    );
  }

  const { playing, answered, userAnswer, wasCorrect, xIsA } = trial;

  function PlayButton({ which }) {
    const isActive = playing === which;
    return (
      <div className="play-section">
        <button
          className={`play-btn ${LABELS[which].color} ${isActive ? 'playing' : ''}`}
          onClick={() => onPlay(which)}
        >
          <span className="play-icon">{isActive ? '◼' : '▶'}</span>
          <span className="play-label">{which}</span>
        </button>
        {!answered && <span className="play-hint">{LABELS[which].hint}</span>}
        {answered && which === 'X' && (
          <span className={`reveal ${wasCorrect ? 'correct' : 'incorrect'}`}>
            X was {xIsA ? 'A' : 'B'}
          </span>
        )}
      </div>
    );
  }

  return (
    <section className="card abx-card">
      <div className="abx-controls">
        <PlayButton which="A" />
        <PlayButton which="B" />
        <PlayButton which="X" />
      </div>

      {!answered ? (
        <div className="answer-row">
          <p className="answer-prompt">Which does X sound like?</p>
          <div className="answer-btns">
            <button className="answer-btn btn-a" onClick={() => onAnswer('A')}>
              X = A
            </button>
            <button className="answer-btn btn-b" onClick={() => onAnswer('B')}>
              X = B
            </button>
          </div>
        </div>
      ) : (
        <div className="result-row">
          <div className={`result-badge ${wasCorrect ? 'correct' : 'incorrect'}`}>
            {wasCorrect ? '✓ Correct' : '✗ Incorrect'}
            <span className="result-sub">
              {wasCorrect
                ? 'You identified the EQ difference!'
                : `You chose ${userAnswer}, but X was ${xIsA ? 'A' : 'B'}`}
            </span>
          </div>
          <button className="btn-primary" onClick={onNewTrial}>
            Next Trial
          </button>
        </div>
      )}
    </section>
  );
}
