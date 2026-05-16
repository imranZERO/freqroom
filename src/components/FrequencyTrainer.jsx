import { useState } from 'react';

const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const GAIN_DB = 6;
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
  const intervals = [[FREQ_MIN, FREQ_MAX]];
  const bands = [];
  while (bands.length < n) {
    let best = 0;
    for (let i = 1; i < intervals.length; i++) {
      const aSize = Math.log(intervals[best][1] / intervals[best][0]);
      const bSize = Math.log(intervals[i][1] / intervals[i][0]);
      if (bSize > aSize || (bSize === aSize && intervals[i][0] < intervals[best][0])) best = i;
    }
    const [lo, hi] = intervals.splice(best, 1)[0];
    const mid = Math.round(Math.sqrt(lo * hi));
    bands.push(mid);
    intervals.push([lo, mid], [mid, hi]);
  }
  return bands.sort((a, b) => a - b);
}

const FREQ_LABEL = (hz) => {
  if (hz >= 1000) {
    const k = hz / 1000;
    return Number.isInteger(k) ? `${k}` : k.toFixed(1);
  }
  return `${hz}`;
};
const FREQ_UNIT = (hz) => hz >= 1000 ? 'kHz' : 'Hz';

function makeFilter(freq, gain) {
  return [{ type: 'peaking', frequency: freq, Q: 1.4, gain }];
}

function gainForMode(mode) {
  if (mode === 'boost') return GAIN_DB;
  if (mode === 'cut') return -GAIN_DB;
  return Math.random() < 0.5 ? GAIN_DB : -GAIN_DB;
}

export function FrequencyTrainer({ engine, onScore }) {
  const [testMode, setTestMode] = useState(null);
  const [level, setLevel] = useState(2);
  const [correctStreak, setCorrectStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [trial, setTrial] = useState(null);
  const [playMode, setPlayMode] = useState(null);

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
    const activeGain = gainForMode(testMode);
    setTrial({ shownBands, activeBand, activeGain, userSelection: null, answered: false, wasCorrect: null });
  }

  function handlePlayMode(mode) {
    if (playMode === mode) { engine.stop(); setPlayMode(null); return; }
    engine.play(mode === 'eq' ? makeFilter(trial.activeBand, trial.activeGain) : []);
    setPlayMode(mode);
  }

  // userSelection is { freq, gain } | null
  function selectBand(freq, gain) {
    if (!trial || trial.answered) return;
    setTrial(prev => ({ ...prev, userSelection: { freq, gain } }));
  }

  function checkAnswer() {
    if (!trial || trial.userSelection === null) return;
    const { activeBand, activeGain, userSelection } = trial;
    const correct = userSelection.freq === activeBand && userSelection.gain === activeGain;

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
              <span className="mode-sign">{m.sign}{GAIN_DB}dB</span>
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
        <div className="mode-badge">{currentMode.sign}{GAIN_DB}dB · {currentMode.label}</div>
        <p className="start-desc">{currentMode.desc} — pick from <strong>{level}</strong> {level === 1 ? 'band' : 'bands'}</p>
        <button className="btn-primary large" onClick={startTrial}>Start Trial</button>
      </section>
    );
  }

  // ── Active trial ────────────────────────────────────────────────────────
  const { shownBands, activeBand, activeGain, userSelection, answered, wasCorrect } = trial;
  const isMixed = testMode === 'both';
  const dirLabel = activeGain > 0 ? 'boost' : 'cut';

  function getBtnState(freq, gain) {
    const isSel = userSelection !== null && userSelection.freq === freq && userSelection.gain === gain;
    const isAct = freq === activeBand && gain === activeGain;
    if (answered) {
      if (isAct && isSel) return 'f-hit';
      if (isAct) return 'f-missed';
      if (isSel) return 'f-wrong';
    }
    return isSel ? 'f-selected' : '';
  }

  function FreqRow({ gain }) {
    return (
      <div className="freq-grid">
        {shownBands.map(freq => (
          <button
            key={freq}
            className={`freq-btn ${getBtnState(freq, gain)}`}
            onClick={() => selectBand(freq, gain)}
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
        <div className="mode-badge">{currentMode.sign}{GAIN_DB}dB · {currentMode.label}</div>
        {!answered ? (
          <span className="trainer-status">
            {!hasSelection
              ? isMixed ? 'Pick the frequency and direction' : `Select the ${activeGain > 0 ? 'boosted' : 'cut'} band`
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
          className={`play-toggle ${playMode === 'eq' ? 'ptog-eq' : ''}`}
          onClick={() => handlePlayMode('eq')}
        >
          {playMode === 'eq' ? '◼' : '▶'} {isMixed ? 'With EQ' : activeGain > 0 ? 'With Boost' : 'With Cut'}
        </button>
        <button
          className={`play-toggle ${playMode === 'flat' ? 'ptog-flat' : ''}`}
          onClick={() => handlePlayMode('flat')}
        >
          {playMode === 'flat' ? '◼' : '▶'} Flat Reference
        </button>
        <span className="playback-tip">Toggle between both to compare</span>
      </div>

      {/* Frequency grid — two rows for mixed, one row otherwise */}
      {isMixed ? (
        <div className="freq-grid-mixed">
          <div className="mixed-row">
            <div className="mixed-row-label boost-label">▲ Boost</div>
            <FreqRow gain={GAIN_DB} />
          </div>
          <div className="mixed-row">
            <div className="mixed-row-label cut-label">▼ Cut</div>
            <FreqRow gain={-GAIN_DB} />
          </div>
        </div>
      ) : (
        <FreqRow gain={activeGain} />
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
