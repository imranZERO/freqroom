import { useState, useEffect, useRef } from 'react';
import { InfoIcon } from './Icons.jsx';
import { FreqGraph } from './FreqGraph.jsx';
import { heatFor, pickWeighted } from '../lib/progress.js';

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

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function freqToNote(hz) {
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `~${name}${octave}`;
}

function freqRegion(hz) {
  if (hz < 80)   return 'Sub Bass';
  if (hz < 250)  return 'Bass';
  if (hz < 500)  return 'Low Mid';
  if (hz < 2000) return 'Midrange';
  if (hz < 4000) return 'Upper Mid';
  if (hz < 8000) return 'Presence';
  return 'Brilliance';
}

function FreqRow({ shownBands, sign, dirLabel, getBtnState, selectBand, answered }) {
  return (
    <div className="freq-grid" style={{ '--n': shownBands.length }}>
      {shownBands.map(freq => (
        <button
          key={freq}
          className={`freq-btn ${getBtnState(freq, sign)}`}
          onClick={() => selectBand(freq, sign)}
          disabled={answered}
          aria-label={`${FREQ_LABEL(freq)} ${FREQ_UNIT(freq)}${dirLabel ? ` ${dirLabel}` : ''}`}
        >
          <span className="freq-num">{FREQ_LABEL(freq)}</span>
          <span className="freq-unit">{FREQ_UNIT(freq)}</span>
        </button>
      ))}
    </div>
  );
}

function makeFilter(freq, gain, q) {
  return [{ type: 'peaking', frequency: freq, Q: q, gain }];
}

// Returns +1 or -1
function signForMode(mode) {
  if (mode === 'boost') return 1;
  if (mode === 'cut') return -1;
  return Math.random() < 0.5 ? 1 : -1;
}

// Stats family the current modes record under (shelf/pass/sweep modes add their own)
const FAMILY = 'peak';

export function FrequencyTrainer({ engine, gainDb, q, progress, focus, onResult }) {
  const [testMode, setTestMode] = useState(null);
  // Level is remembered per mode in saved progress
  const level = (testMode && progress.levels[testMode]) || MIN_LEVEL;
  const [correctStreak, setCorrectStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [trial, setTrial] = useState(null);
  const [playMode, setPlayMode] = useState(null);
  const answeringRef = useRef(false);

  // Apply Gain/Q slider changes to the live EQ without restarting playback
  useEffect(() => {
    if (trial && playMode === 'eq') {
      engine.play(makeFilter(trial.activeBand, trial.activeSign * gainDb, q));
    }
  }, [gainDb, q]); // eslint-disable-line react-hooks/exhaustive-deps

  // Engine stopped elsewhere (e.g. source track changed) — clear the play toggle
  useEffect(() => {
    if (!engine.isPlaying && playMode !== null) setPlayMode(null);
  }, [engine.isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key;

      if (key === 'Enter') {
        if (!testMode) return;
        if (!trial || trial.answered) { startTrial(); return; }
        if (trial.userSelection !== null) { e.preventDefault(); checkAnswer(); }
        return;
      }

      if (!trial || trial.answered) return;

      if (key === ' ') {
        e.preventDefault();
        handlePlayMode(playMode === 'eq' ? 'flat' : 'eq');
      } else if ((key === 'ArrowLeft' || key === 'ArrowRight') && testMode !== 'both') {
        e.preventDefault();
        const bands = trial.shownBands;
        const cur = trial.userSelection ? bands.indexOf(trial.userSelection.freq) : -1;
        if (key === 'ArrowLeft' && cur <= 0) return;
        const next = key === 'ArrowLeft' ? cur - 1 : Math.min(bands.length - 1, cur + 1);
        selectBand(bands[next === -1 ? 0 : next], trial.activeSign);
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [trial, testMode, playMode, gainDb, q, level]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectMode(mode) {
    answeringRef.current = false;
    engine.stop();
    setTestMode(mode);
    setTrial(null);
    setPlayMode(null);
    setCorrectStreak(0);
    setWrongStreak(0);
  }

  function startTrial() {
    answeringRef.current = false;
    engine.stop();
    setPlayMode(null);
    const shownBands = generateBands(level);
    const activeBand = focus
      ? pickWeighted(shownBands, progress, FAMILY)
      : shownBands[Math.floor(Math.random() * shownBands.length)];
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
    if (!trial || trial.userSelection === null || answeringRef.current) return;
    answeringRef.current = true;
    const { activeBand, activeSign, userSelection } = trial;
    const correct = userSelection.freq === activeBand && userSelection.sign === activeSign;

    engine.stop();
    setPlayMode(null);

    let cs = correct ? correctStreak + 1 : 0;
    let ws = correct ? 0 : wrongStreak + 1;
    let lv = level;

    if (cs >= CORRECT_TO_ADVANCE) { lv = Math.min(MAX_LEVEL, level + 1); cs = 0; }
    else if (ws >= WRONG_TO_DECREASE) { lv = Math.max(MIN_LEVEL, level - 1); ws = 0; }

    setCorrectStreak(cs);
    setWrongStreak(ws);
    onResult({ mode: testMode, family: FAMILY, freq: activeBand, correct, level: lv });
    setTrial(prev => ({ ...prev, answered: true, wasCorrect: correct }));
  }

  const currentMode = MODES.find(m => m.id === testMode);
  const isMixed = testMode === 'both';
  const liveGain = trial ? trial.activeSign * gainDb : gainDb;

  // The graph is the instrument's "screen" and is shown in every state
  const screen = (
    <FreqGraph
      bands={trial?.shownBands ?? []}
      gains={!trial ? [] : isMixed ? [gainDb, -gainDb] : [liveGain]}
      gainDb={liveGain}
      centerFreq={trial?.answered ? trial.activeBand : null}
      Q={q}
      sampleRate={engine.sampleRate}
      heat={heatFor(progress, FAMILY)}
    />
  );

  // `outside` renders below the panel (the empty state's quick-start steps)
  let header = null, body = null, outside = null;

  if (!engine.isLoaded) {
    // ── Empty state ───────────────────────────────────────────────────────
    outside = (
      <ol className="quickstart">
        <li><strong>Load a source</strong> — pink noise is best for learning; your own music works too.</li>
        <li><strong>Choose a mode</strong> — spot boosts, cuts, or both.</li>
        <li><strong>Compare EQ and Flat</strong>, then pick the band you hear changing.</li>
      </ol>
    );
  } else if (!testMode) {
    // ── Mode picker ───────────────────────────────────────────────────────
    header = <h2>Choose Test Mode</h2>;
    body = (
      <div className="mode-grid">
        {MODES.map(m => (
          <button key={m.id} className="mode-card" onClick={() => selectMode(m.id)}>
            <span className="mode-label">{m.label}</span>
            <span className="mode-sign">{m.sign}{gainDb}dB</span>
            <span className="mode-desc">{m.desc}</span>
          </button>
        ))}
      </div>
    );
  } else if (!trial) {
    // ── Start state ───────────────────────────────────────────────────────
    header = (
      <>
        <div className="level-chip">Level {level}</div>
        <div className="mode-badge">{currentMode.sign}{gainDb}dB · {currentMode.label}</div>
        <button className="btn-ghost trainer-header-end" onClick={() => setTestMode(null)}>Change mode</button>
      </>
    );
    body = (
      <div className="trainer-start">
        <p className="start-desc">{currentMode.desc} — pick from <strong>{level}</strong> {level === 1 ? 'band' : 'bands'}</p>
        <button className="btn-primary large" onClick={startTrial}>Start Trial</button>
      </div>
    );
  } else {
    // ── Active trial ──────────────────────────────────────────────────────
    const { shownBands, activeBand, activeSign, userSelection, answered, wasCorrect } = trial;
    const dirLabel = activeSign > 0 ? 'boost' : 'cut';
    const hasSelection = userSelection !== null;

    const getBtnState = (freq, sign) => {
      const isSel = hasSelection && userSelection.freq === freq && userSelection.sign === sign;
      const isAct = freq === activeBand && sign === activeSign;
      if (answered) {
        if (isAct && isSel) return 'f-hit';
        if (isAct) return 'f-missed';
        if (isSel) return 'f-wrong';
      }
      return isSel ? 'f-selected' : '';
    };
    const rowProps = { shownBands, getBtnState, selectBand, answered };

    const isWrongStreak = wrongStreak > 0;
    const streakCount = isWrongStreak ? wrongStreak : correctStreak;
    const streakMax = isWrongStreak ? WRONG_TO_DECREASE : CORRECT_TO_ADVANCE;

    header = (
      <>
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
            <span className="result-note">{freqToNote(activeBand)} · {freqRegion(activeBand)}</span>
          </span>
        )}
      </>
    );

    body = (
      <>
        {/* Band keys sit directly under their curve peaks; mixed mode adds a cut row */}
        {isMixed ? (
          <div className="freq-grid-mixed">
            <div className="mixed-row">
              <span className="mixed-row-label boost-label" title="Boost">▲</span>
              <FreqRow {...rowProps} sign={1} dirLabel="boost" />
            </div>
            <div className="mixed-row">
              <span className="mixed-row-label cut-label" title="Cut">▼</span>
              <FreqRow {...rowProps} sign={-1} dirLabel="cut" />
            </div>
          </div>
        ) : (
          <FreqRow {...rowProps} sign={activeSign} />
        )}

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

        {/* Transport: compare EQ vs flat, then check */}
        <div className="transport">
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
          <div className="transport-action">
            <button
              className="icon-btn trainer-kb-hint"
              aria-label="Keyboard shortcuts"
              data-tooltip={isMixed ? 'Space EQ/Flat · Enter check/next' : 'Space EQ/Flat · ← → select · Enter check/next'}
            >
              <InfoIcon />
            </button>
            {!answered ? (
              <button className="btn-primary" onClick={checkAnswer} disabled={!hasSelection}>
                Check Answer
              </button>
            ) : (
              <button className="btn-primary" onClick={startTrial}>Next Trial →</button>
            )}
          </div>
        </div>

        <div className="streak-row">
          <span className={`streak-label ${isWrongStreak ? 'wrong-label' : ''}`}>
            {isWrongStreak
              ? `${streakCount}/${streakMax} wrong → level down`
              : `${streakCount}/${streakMax} correct → level up`}
          </span>
          <div className="streak-pips">
            {Array.from({ length: streakMax }, (_, i) => (
              <span key={i} className={`pip ${i < streakCount ? (isWrongStreak ? 'pip-wrong' : 'pip-correct') : ''}`} />
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="panel-group">
      <h2 className="panel-label">Trainer</h2>
      <section className="card instrument">
        {header && <div className="trainer-header">{header}</div>}
        {screen}
        {body}
      </section>
      {outside}
    </div>
  );
}
