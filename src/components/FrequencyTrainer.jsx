import { useState, useEffect, useRef } from 'react';
import { InfoIcon } from './Icons.jsx';
import { FreqGraph, rowInset, fmtHz } from './FreqGraph.jsx';
import { heatFor, pickWeighted } from '../lib/progress.js';
import { buildChallengeUrl, copyText } from '../lib/challenge.js';
import { applyAnswer, CORRECT_TO_ADVANCE, WRONG_TO_DECREASE, MIN_LEVEL, MAX_LEVEL } from '../lib/progression.js';
import {
  generateBands, octaveError, withinSweepTolerance, bandRange, typeAt, makeFilter,
  signForMode, pickDirection, freqToNote, freqRegion, FREQ_LABEL, FREQ_UNIT,
  SWEEP_RANGE, SWEEP_GRID,
} from '../lib/trainer.js';

// family: which stats bucket set a mode records under; maxLevel caps the band count
export const MODES = [
  { id: 'boost', label: 'Boosts',       family: 'peak',  badge: g => `+${g}dB`, desc: 'Identify which band was boosted' },
  { id: 'cut',   label: 'Cuts',         family: 'peak',  badge: g => `−${g}dB`, desc: 'Identify which band was cut' },
  { id: 'both',  label: 'Mixed',        family: 'peak',  badge: g => `±${g}dB`, desc: 'Identify the frequency and whether it was a boost or a cut' },
  { id: 'shelf', label: 'Shelves',      family: 'shelf', badge: g => `±${g}dB`, desc: 'Find the corner of a low or high shelf and whether it boosts or cuts', maxLevel: 8 },
  { id: 'pass',  label: 'Pass Filters', family: 'pass',  badge: () => 'HP / LP', desc: 'Find the cutoff of a high-pass or low-pass filter', maxLevel: 8 },
  { id: 'sweep', label: 'Sweep',        family: 'sweep', badge: g => `+${g}dB`, desc: 'Drag on the graph to where you hear the boost', minLevel: 1, maxLevel: 5 },
];

// Sweep mode: the per-level tolerance labels ("within ±1 octave counts")
const SWEEP_TOL_LABEL = ['1', '⅔', '½', '⅓', '⅙'];

// Filter type names used in the answer reveal ("low shelf cut", "low-pass")
const TYPE_LABELS = {
  lowshelf: 'low shelf', highshelf: 'high shelf', lowpass: 'low-pass', highpass: 'high-pass',
};

function FreqRow({ shownBands, range, sign, dirLabel, getBtnState, selectBand, answered, onHover }) {
  const inset = rowInset(...range);
  return (
    <div
      className="freq-grid"
      style={{ '--n': shownBands.length, paddingLeft: inset.left, paddingRight: inset.right }}
    >
      {shownBands.map(freq => (
        <button
          key={freq}
          className={`freq-btn ${getBtnState(freq, sign)}`}
          onClick={() => selectBand(freq, sign)}
          onMouseEnter={() => onHover({ freq, sign })}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover({ freq, sign })}
          onBlur={() => onHover(null)}
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

export function FrequencyTrainer({ engine, gainDb, q, progress, focus, autoplay, onResult, initialMode, initialLevel, sourceId }) {
  const [testMode, setTestMode] = useState(initialMode ?? null);
  const [copied, setCopied] = useState(false);
  const currentMode = MODES.find(m => m.id === testMode);
  const family = currentMode?.family ?? 'peak';
  const isSweep = family === 'sweep';
  const minLevel = currentMode?.minLevel ?? MIN_LEVEL;
  const maxLevel = currentMode?.maxLevel ?? MAX_LEVEL;
  const answeringRef = useRef(false);
  // A challenge link can set the starting level for its mode without writing to
  // saved progress; it yields to the adaptive level once the first answer lands.
  const challengeLevelRef = useRef(initialLevel ?? null);
  // Level is remembered per mode in saved progress
  const savedLevel = testMode === initialMode && challengeLevelRef.current != null
    ? challengeLevelRef.current
    : testMode ? progress.levels[testMode] : null;
  const level = Math.max(minLevel, Math.min(maxLevel, savedLevel ?? minLevel));
  const [correctStreak, setCorrectStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [trial, setTrial] = useState(null);
  const [playMode, setPlayMode] = useState(null);
  // Band button under the pointer (or keyboard focus); its curve is highlighted on the graph
  const [hovered, setHovered] = useState(null);

  // The hidden filter for a trial at the current Gain/Q settings. engine.play
  // takes a list of filters, so calls wrap this in [ ]; an empty list is Flat.
  const activeFilter = t => makeFilter(typeAt(t.kind === 'sweep' ? 'peaking' : t.kind, t.activeBand), t.activeBand, t.activeSign * gainDb, q);

  // Apply Gain/Q slider changes to the live EQ without restarting playback
  useEffect(() => {
    if (trial && playMode === 'eq') engine.play([activeFilter(trial)]);
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

      if (!trial) return;

      // EQ/Flat stays available after answering so the reveal can be re-heard
      if (key === ' ') {
        e.preventDefault();
        handlePlayMode(playMode === 'eq' ? 'flat' : 'eq');
        return;
      }
      if (trial.answered || e.metaKey || e.ctrlKey || e.altKey) return;

      if (trial.kind === 'sweep') {
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
          e.preventDefault();
          const from = trial.userSelection?.freq ?? 1000;
          const to = from * Math.pow(2, (key === 'ArrowLeft' ? -1 : 1) / 12);
          selectBand(Math.max(20, Math.min(20000, to)), 1);
        }
        return;
      }

      const bands = trial.shownBands;
      const sel = trial.userSelection;
      // Mixed mode picks a row as well as a band; other modes have one fixed row
      const sign = pickDirection(testMode) ? (sel?.sign ?? 1) : trial.activeSign;
      const cur = sel ? bands.indexOf(sel.freq) : -1;

      if (/^[0-9]$/.test(key)) {
        const idx = key === '0' ? 9 : Number(key) - 1;
        if (idx < bands.length) selectBand(bands[idx], sign);
      } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
        e.preventDefault();
        const next = key === 'ArrowLeft' ? Math.max(0, cur - 1) : Math.min(bands.length - 1, cur + 1);
        selectBand(bands[next], sign);
      } else if ((key === 'ArrowUp' || key === 'ArrowDown') && pickDirection(testMode)) {
        e.preventDefault();
        selectBand(bands[Math.max(0, cur)], key === 'ArrowUp' ? 1 : -1);
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [trial, testMode, playMode, gainDb, q, level]); // eslint-disable-line react-hooks/exhaustive-deps

  // Copies a link that recreates this setup (only the settings the mode uses)
  async function shareChallenge() {
    const url = buildChallengeUrl({
      mode: testMode,
      gainDb: family === 'pass' ? undefined : gainDb,
      q: family === 'peak' || family === 'sweep' ? q : undefined,
      source: sourceId,
      level,
    });
    if (await copyText(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }
  const shareButton = (
    <button className="btn-ghost trainer-share" onClick={shareChallenge} data-tooltip="Copy a link to this exact challenge">
      {copied ? 'Link copied' : 'Share'}
    </button>
  );

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
    setHovered(null);
    engine.stop();
    setPlayMode(null);
    // kind: 'peaking', 'shelf' (low/high chosen by the corner), 'highpass' or 'lowpass'
    const kind = family === 'shelf' ? 'shelf'
      : family === 'pass' ? (Math.random() < 0.5 ? 'highpass' : 'lowpass')
      : isSweep ? 'sweep'
      : 'peaking';
    const range = isSweep ? SWEEP_RANGE : bandRange(family, kind);
    // Sweep has no buttons: the hidden frequency comes from a fine grid instead
    const shownBands = isSweep ? [] : generateBands(level, ...range);
    const pool = isSweep ? SWEEP_GRID : shownBands;
    const activeBand = focus
      ? pickWeighted(pool, progress, family)
      : pool[Math.floor(Math.random() * pool.length)];
    const activeSign = signForMode(testMode);
    const next = { kind, range, shownBands, activeBand, activeSign, userSelection: null, answered: false, wasCorrect: null };
    setTrial(next);
    if (autoplay) {
      engine.play([activeFilter(next)]);
      setPlayMode('eq');
    }
  }

  function handlePlayMode(mode) {
    if (playMode === mode) { engine.stop(); setPlayMode(null); return; }
    engine.play(mode === 'eq' ? [activeFilter(trial)] : []);
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
    const correct = trial.kind === 'sweep'
      ? withinSweepTolerance(octaveError(userSelection.freq, activeBand), level)
      : userSelection.freq === activeBand && userSelection.sign === activeSign;

    engine.stop();
    setPlayMode(null);

    const next = applyAnswer({ correct, correctStreak, wrongStreak, level, minLevel, maxLevel });
    setCorrectStreak(next.correctStreak);
    setWrongStreak(next.wrongStreak);
    // The challenge's starting level has done its job; let saved progress take over
    if (testMode === initialMode) challengeLevelRef.current = null;
    onResult({ mode: testMode, family, freq: activeBand, correct, level: next.level });
    setTrial(prev => ({ ...prev, answered: true, wasCorrect: correct }));
  }

  const isMixed = testMode === 'both';
  const twoRows = pickDirection(testMode);

  // Candidates in gray: both directions where the direction is part of the puzzle
  let curves = [];
  if (trial && trial.kind !== 'sweep') {
    const gains = twoRows ? [gainDb, -gainDb] : [trial.activeSign * gainDb];
    curves = trial.shownBands.flatMap(f => gains.map(g => makeFilter(typeAt(trial.kind, f), f, g, q)));
  }

  // Before answering, the selected button's curve is emphasised on the graph and
  // the hovered button's curve is previewed faintly (its row sets the direction)
  const curveFor = ({ freq, sign }) => makeFilter(typeAt(trial.kind, freq), freq, sign * gainDb, q);
  let selectedCurve = null, hoverCurve = null;
  if (trial && !trial.answered && trial.kind !== 'sweep') {
    const sel = trial.userSelection;
    if (sel) selectedCurve = curveFor(sel);
    if (hovered && !(sel && sel.freq === hovered.freq && sel.sign === hovered.sign)) hoverCurve = curveFor(hovered);
  }

  // Status line on the graph: which filter is in play and its settings
  const SIGN = { boost: '+', cut: '−', both: '±', shelf: '±', sweep: '+' };
  const qText = `Q ${q.toFixed(1)}`;
  const readout = !currentMode ? `±${gainDb} dB · ${qText}`
    : family === 'pass' ? `${trial ? (trial.kind === 'highpass' ? 'HIGH-PASS' : 'LOW-PASS') : 'HP / LP'} · 12 dB/oct`
    : family === 'shelf' ? `SHELF · ±${gainDb} dB`
    : `PEAK · ${SIGN[testMode]}${gainDb} dB · ${qText}`;

  // The graph is the instrument's "screen" and is shown in every state
  const screen = (
    <FreqGraph
      curves={curves}
      hover={hoverCurve}
      selected={selectedCurve}
      answer={trial?.answered ? activeFilter(trial) : null}
      gainDb={gainDb}
      sampleRate={engine.sampleRate}
      heat={heatFor(progress, family)}
      marker={trial?.kind === 'sweep' ? trial.userSelection?.freq ?? null : null}
      onPick={trial?.kind === 'sweep' && !trial.answered ? f => selectBand(f, 1) : null}
      readout={readout}
      idle={!engine.isLoaded}
    />
  );

  // `outside` renders below the panel (the empty state's quick-start steps)
  let header = null, body = null, outside = null;

  if (!engine.isLoaded) {
    // ── Empty state ───────────────────────────────────────────────────────
    outside = (
      <ol className="quickstart">
        <li><strong>Load a source</strong> — pink noise is best for learning; your own music works too.</li>
        <li><strong>Choose a mode</strong> — spot boosts and cuts, shelves, filter cutoffs, or sweep for the exact spot.</li>
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
            <span className="mode-sign">{m.badge(gainDb)}</span>
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
        <div className="mode-badge">{currentMode.badge(gainDb)} · {currentMode.label}</div>
        <span className="trainer-header-end">
          {shareButton}
          <button className="btn-ghost" onClick={() => setTestMode(null)}>Change mode</button>
        </span>
      </>
    );
    body = (
      <div className="trainer-start">
        <p className="start-desc">{currentMode.desc} — {isSweep
          ? <>within <strong>±{SWEEP_TOL_LABEL[level - 1]}</strong> octave counts</>
          : <>pick from <strong>{level}</strong> {family === 'shelf' ? 'corners' : family === 'pass' ? 'cutoffs' : 'bands'}</>}
        </p>
        <button className="btn-primary large" onClick={startTrial}>Start Trial</button>
      </div>
    );
  } else {
    // ── Active trial ──────────────────────────────────────────────────────
    const { kind, range, shownBands, activeBand, activeSign, userSelection, answered, wasCorrect } = trial;
    const dirLabel = activeSign > 0 ? 'boost' : 'cut';
    const activeType = typeAt(kind === 'sweep' ? 'peaking' : kind, activeBand);
    const sweepError = kind === 'sweep' && userSelection ? octaveError(userSelection.freq, activeBand) : null;
    // What the answer was, spelled out after answering (e.g. "low shelf cut")
    const answerLabel = kind === 'peaking' || kind === 'sweep' ? dirLabel
      : kind === 'shelf' ? `${TYPE_LABELS[activeType]} ${dirLabel}` : TYPE_LABELS[activeType];
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
    const rowProps = { shownBands, range, getBtnState, selectBand, answered, onHover: setHovered };

    const isWrongStreak = wrongStreak > 0;
    const streakCount = isWrongStreak ? wrongStreak : correctStreak;
    const streakMax = isWrongStreak ? WRONG_TO_DECREASE : CORRECT_TO_ADVANCE;

    header = (
      <>
        <div className="level-chip">Level {level}</div>
        <div className="mode-badge">{currentMode.badge(gainDb)} · {currentMode.label}</div>
        {!answered ? (
          <span className="trainer-status">
            {hasSelection ? (kind === 'sweep' ? `Guess ${fmtHz(userSelection.freq)} — ready to check` : 'Ready to check')
              : kind === 'sweep' ? 'Click or drag on the graph'
              : isMixed ? 'Pick the frequency and direction'
              : kind === 'shelf' ? 'Pick the shelf corner and direction'
              : kind !== 'peaking' ? `Find the ${TYPE_LABELS[kind]} cutoff`
              : `Select the ${activeSign > 0 ? 'boosted' : 'cut'} band`}
          </span>
        ) : (
          <span className={`trainer-result ${wasCorrect ? 'result-correct' : 'result-incorrect'}`}>
            {wasCorrect ? '✓ Correct!' : '✗ Incorrect'}
            <span className="result-note">
              {kind === 'sweep' ? `${fmtHz(activeBand)} · ${sweepError.toFixed(2)} oct off`
                : kind === 'peaking' ? freqToNote(activeBand) : answerLabel} · {freqRegion(activeBand)}
            </span>
          </span>
        )}
        <span className="trainer-header-end">{shareButton}</span>
      </>
    );

    body = (
      <>
        {/* Band keys sit directly under their curve peaks; mixed mode adds a cut row */}
        {kind === 'sweep' ? (
          <p className="sweep-hint">
            Within <strong>±{SWEEP_TOL_LABEL[level - 1]} oct</strong> counts · ← → nudge by a semitone
          </p>
        ) : twoRows ? (
          <div className="freq-grid-mixed">
            <div className="mixed-row">
              <span className="mixed-row-label boost-label" data-tooltip="Boost row">▲</span>
              <FreqRow {...rowProps} sign={1} dirLabel="boost" />
            </div>
            <div className="mixed-row">
              <span className="mixed-row-label cut-label" data-tooltip="Cut row">▼</span>
              <FreqRow {...rowProps} sign={-1} dirLabel="cut" />
            </div>
          </div>
        ) : (
          <FreqRow {...rowProps} sign={activeSign} />
        )}

        {answered && kind !== 'sweep' && (
          <div className="freq-legend">
            <span className="legend-item"><span className="legend-dot ld-hit" />Correct</span>
            {!wasCorrect && (
              <span className="legend-item"><span className="legend-dot ld-missed" />Was the answer</span>
            )}
            {hasSelection && !wasCorrect && (
              <span className="legend-item"><span className="legend-dot ld-wrong" />Your pick</span>
            )}
            {(isMixed || kind === 'shelf') && (
              <span className="legend-item muted mixed-dir-reveal">
                Answer was a <strong>{answerLabel}</strong>
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
            <span
              className="icon-btn trainer-kb-hint"
              aria-hidden="true"
              data-tooltip={kind === 'sweep'
                ? 'Click/drag the graph · ← → nudge · Space EQ/Flat · Enter check/next'
                : `1–9, 0 pick band · ← → move${twoRows ? ' · ↑ ↓ boost/cut' : ''} · Space EQ/Flat · Enter check/next`}
            >
              <InfoIcon />
            </span>
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
    <>
      <div className="panel-group">
        <h2 className="panel-label">Trainer</h2>
        <section className="card instrument">
          {header && <div className="trainer-header">{header}</div>}
          {screen}
          {body}
        </section>
      </div>
      {outside && (
        <div className="panel-group">
          <h2 className="panel-label">Quick Start</h2>
          {outside}
        </div>
      )}
    </>
  );
}
