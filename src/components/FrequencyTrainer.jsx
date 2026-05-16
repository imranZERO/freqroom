import { useState, useEffect } from 'react';

const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const CORRECT_TO_ADVANCE = 3;
const WRONG_TO_DECREASE = 2;
const MAX_LEVEL = 15;
const MIN_LEVEL = 2;

const MODES = [
  { id: 'boost', label: 'Boosts', sign: '+', desc: 'Identify which band was boosted' },
  { id: 'cut',   label: 'Cuts',   sign: '−', desc: 'Identify which band was cut' },
  { id: 'both',  label: 'Mixed',  sign: '±', desc: 'Identify the frequency and whether it was a boost or a cut' },
];

function generateBands(n) {
  if (n === 0) return [];
  return Array.from({ length: n }, (_, i) =>
    Math.round(FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, (i + 0.5) / n))
  );
}

const FREQ_LABEL = (hz) => {
  if (hz >= 1000) {
    const k = hz / 1000;
    return Number.isInteger(k) ? `${k}` : k.toFixed(1);
  }
  return `${hz}`;
};
const FREQ_UNIT = (hz) => hz >= 1000 ? 'kHz' : 'Hz';

function makeFilter(freq, gain, q) {
  return [{ type: 'peaking', frequency: freq, Q: q, gain }];
}

// Returns +1 or -1
function signForMode(mode) {
  if (mode === 'boost') return 1;
  if (mode === 'cut') return -1;
  return Math.random() < 0.5 ? 1 : -1;
}

export function FrequencyTrainer({ engine, onScore, onEqChange, gainDb, q }) {
  const [testMode, setTestMode] = useState(null);
  const [level, setLevel] = useState(2);
  const [correctStreak, setCorrectStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [trial, setTrial] = useState(null);
  const [playMode, setPlayMode] = useState(null);

  // trial.activeSign is ±1; activeGain is always derived from live gainDb prop
  const activeGain = trial ? trial.activeSign * gainDb : null;

  useEffect(() => {
    if (trial) {
      const liveGain = trial.activeSign * gainDb;
      const gains = testMode === 'both' ? [gainDb, -gainDb] : [liveGain];
      onEqChange?.({
        bands: trial.shownBands,
        gains,
        gainDb: liveGain,
        centerFreq: trial.answered ? trial.activeBand : null,
      });
    } else {
      onEqChange?.(null);
    }
  }, [trial, testMode, gainDb]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectMode(mode) {
    engine.stop();
    setTestMode(mode);
    setTrial(null);
    setPlayMode(null);
    setLevel(2);
    setCorrectStreak(0);
    setWrongStreak(0);
  }

  function startTrial() {
    engine.stop();
    setPlayMode(null);
    const shownBands = generateBands(level);
    const activeBand = shownBands[Math.floor(Math.random() * shownBands.length)];
    const activeSign = signForMode(testMode);
    setTrial({ shownBands, activeBand, activeSign, userSelection: null, answered: false, wasCorrect: null });
  }

  function handlePlayMode(mode) {
    if (playMode === mode) { engine.stop(); setPlayMode(null); return; }
    engine.play(mode === 'eq' ? makeFilter(trial.activeBand, trial.activeSign * gainDb, q) : []);
    setPlayMode(mode);
  }

  // userSelection stores { freq, sign } where sign is ±1
  function selectBand(freq, sign) {
    if (!trial || trial.answered) return;
    setTrial(prev => ({ ...prev, userSelection: { freq, sign } }));
  }

  function checkAnswer() {
    if (!trial || trial.userSelection === null) return;
    const { activeBand, activeSign, userSelection } = trial;
    const correct = userSelection.freq === activeBand && userSelection.sign === activeSign;

    onScore(correct);
    engine.stop();
    setPlayMode(null);

    let cs = correct ? correctStreak + 1 : 0;
    let ws = correct ? 0 : wrongStreak + 1;
    let lv = level;

    if (cs >= CORRECT_TO_ADVANCE) { lv = Math.min(MAX_LEVEL, level + 1); cs = 0; }
    else if (ws >= WRONG_TO_DECREASE) { lv = Math.max(MIN_LEVEL, level - 1); ws = 0; }

    setCorrectStreak(cs);
    setWrongStreak(ws);
    setLevel(lv);
    setTrial(prev => ({ ...prev, answered: true, wasCorrect: correct }));
  }

  // ── Empty state ─────────────────────────────────────────────────────────
  if (!engine.isLoaded) {
    return (
      <section className="card trainer-empty">
        <p className="muted">Load a source audio track above to start training.</p>
      </section>
    );
  }

  // ── Mode picker ─────────────────────────────────────────────────────────
  if (!testMode) {
    return (
      <section className="card trainer-modepick">
        <h2>Choose Test Mode</h2>
        <div className="mode-grid">
          {MODES.map(m => (
            <button key={m.id} className="mode-card" onClick={() => selectMode(m.id)}>
              <span className="mode-sign">{m.sign}{gainDb}dB</span>
              <span className="mode-label">{m.label}</span>
              <span className="mode-desc">{m.desc}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  const currentMode = MODES.find(m => m.id === testMode);

  // ── Start state ─────────────────────────────────────────────────────────
  if (!trial) {
    return (
      <section className="card trainer-start">
        <div className="trainer-start-top">
          <div className="level-chip">Level {level}</div>
          <button className="btn-ghost" onClick={() => setTestMode(null)}>Change mode</button>
        </div>
        <div className="mode-badge">{currentMode.sign}{gainDb}dB · {currentMode.label}</div>
        <p className="start-desc">{currentMode.desc} — pick from <strong>{level}</strong> {level === 1 ? 'band' : 'bands'}</p>
        <button className="btn-primary large" onClick={startTrial}>Start Trial</button>
      </section>
    );
  }

  // ── Active trial ────────────────────────────────────────────────────────
  const { shownBands, activeBand, activeSign, userSelection, answered, wasCorrect } = trial;
  const isMixed = testMode === 'both';
  const dirLabel = activeSign > 0 ? 'boost' : 'cut';

  function getBtnState(freq, sign) {
    const isSel = userSelection !== null && userSelection.freq === freq && userSelection.sign === sign;
    const isAct = freq === activeBand && sign === activeSign;
    if (answered) {
      if (isAct && isSel) return 'f-hit';
      if (isAct) return 'f-missed';
      if (isSel) return 'f-wrong';
    }
    return isSel ? 'f-selected' : '';
  }

  function FreqRow({ sign }) {
    return (
      <div className="freq-grid">
        {shownBands.map(freq => (
          <button
            key={freq}
            className={`freq-btn ${getBtnState(freq, sign)}`}
            onClick={() => selectBand(freq, sign)}
            disabled={answered}
          >
            <span className="freq-num">{FREQ_LABEL(freq)}</span>
            <span className="freq-unit">{FREQ_UNIT(freq)}</span>
          </button>
        ))}
      </div>
    );
  }

  const hasSelection = userSelection !== null;

  return (
    <section className="card trainer-card">

      {/* Header row */}
      <div className="trainer-header">
        <div className="level-chip">Level {level}</div>
        <div className="mode-badge">{currentMode.sign}{gainDb}dB · {currentMode.label}</div>
        {!answered ? (
          <span className="trainer-status">
            {!hasSelection
              ? isMixed ? 'Pick the frequency and direction' : `Select the ${activeSign > 0 ? 'boosted' : 'cut'} band`
              : 'Ready to check'}
          </span>
        ) : (
          <span className={`trainer-result ${wasCorrect ? 'result-correct' : 'result-incorrect'}`}>
            {wasCorrect ? '✓ Correct!' : '✗ Incorrect'}
          </span>
        )}
      </div>

      {/* Playback controls */}
      <div className="playback-row">
        <button
          className={`play-toggle play-toggle-eq ${playMode === 'eq' ? 'ptog-eq' : ''}`}
          onClick={() => handlePlayMode('eq')}
        >
          {playMode === 'eq' ? '◼' : '▶'} EQ
        </button>
        <button
          className={`play-toggle play-toggle-flat ${playMode === 'flat' ? 'ptog-flat' : ''}`}
          onClick={() => handlePlayMode('flat')}
        >
          {playMode === 'flat' ? '◼' : '▶'} Flat
        </button>
        <span className="playback-tip">Toggle between both to compare</span>
      </div>

      {/* Frequency grid — two rows for mixed, one row otherwise */}
      {isMixed ? (
        <div className="freq-grid-mixed">
          <div className="mixed-row">
            <div className="mixed-row-label boost-label">▲ Boost</div>
            <FreqRow sign={1} />
          </div>
          <div className="mixed-row">
            <div className="mixed-row-label cut-label">▼ Cut</div>
            <FreqRow sign={-1} />
          </div>
        </div>
      ) : (
        <FreqRow sign={activeSign} />
      )}

      {/* Legend */}
      {answered && (
        <div className="freq-legend">
          <span className="legend-item"><span className="legend-dot ld-hit" />Correct</span>
          {!wasCorrect && (
            <span className="legend-item"><span className="legend-dot ld-missed" />Was the answer</span>
          )}
          {hasSelection && !wasCorrect && (
            <span className="legend-item"><span className="legend-dot ld-wrong" />Your pick</span>
          )}
          {isMixed && (
            <span className="legend-item muted mixed-dir-reveal">
              Answer was a <strong>{dirLabel}</strong>
            </span>
          )}
        </div>
      )}

      {/* Streak progress */}
      <div className="streak-row">
        {wrongStreak > 0 ? (
          <>
            <span className="streak-label wrong-label">{wrongStreak}/{WRONG_TO_DECREASE} wrong → level down</span>
            <div className="streak-pips">
              {Array.from({ length: WRONG_TO_DECREASE }, (_, i) => (
                <span key={i} className={`pip ${i < wrongStreak ? 'pip-wrong' : ''}`} />
              ))}
            </div>
          </>
        ) : (
          <>
            <span className="streak-label">{correctStreak}/{CORRECT_TO_ADVANCE} correct → level up</span>
            <div className="streak-pips">
              {Array.from({ length: CORRECT_TO_ADVANCE }, (_, i) => (
                <span key={i} className={`pip ${i < correctStreak ? 'pip-correct' : ''}`} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Action button */}
      <div className="trainer-action">
        {!answered ? (
          <button className="btn-primary" onClick={checkAnswer} disabled={!hasSelection}>
            Check Answer ({hasSelection ? 1 : 0}/1)
          </button>
        ) : (
          <button className="btn-primary" onClick={startTrial}>Next Trial →</button>
        )}
      </div>

    </section>
  );
}
