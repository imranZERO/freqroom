import { useState, useEffect, useRef } from 'react';
import { FreqGraph, fmtHz } from './FreqGraph.jsx';
import { QuickStart, ModePicker, BandRows, GainRow, AnswerLegend, Transport, StreakMeter, ExploreBody } from './TrainerParts.jsx';
import { heatFor, pickWeighted } from '../lib/progress.js';
import { buildChallengeUrl, copyText } from '../lib/challenge.js';
import { applyAnswer, CORRECT_TO_ADVANCE, WRONG_TO_DECREASE, MIN_LEVEL, MAX_LEVEL } from '../lib/progression.js';
import {
  generateBands, octaveError, withinSweepTolerance, withinMatchTolerance, bandRange, typeAt, makeFilter,
  signForMode, pickDirection, freqToNote, freqRegion, describeRegion,
  SWEEP_RANGE, SWEEP_GRID, EXPLORE_TYPES, GAIN_LEVELS, GAIN_FREQS, MATCH_TOLERANCE, MATCH_GAINS, MATCH_RANGE_DB,
} from '../lib/trainer.js';
import { trialPoints } from '../lib/scoring.js';

// family: which stats bucket set a mode records under; maxLevel caps the band count
export const MODES = [
  { id: 'boost', label: 'Boosts',       family: 'peak',  badge: g => `+${g}dB`, desc: 'Identify which band was boosted' },
  { id: 'cut',   label: 'Cuts',         family: 'peak',  badge: g => `−${g}dB`, desc: 'Identify which band was cut' },
  { id: 'both',  label: 'Mixed',        family: 'peak',  badge: g => `±${g}dB`, desc: 'Identify the frequency and whether it was a boost or a cut' },
  { id: 'shelf', label: 'Shelves',      family: 'shelf', badge: g => `±${g}dB`, desc: 'Find the corner of a low or high shelf and whether it boosts or cuts', maxLevel: 8 },
  { id: 'pass',  label: 'Pass Filters', family: 'pass',  badge: () => 'HP / LP', desc: 'Find the cutoff of a high-pass or low-pass filter', maxLevel: 8 },
  { id: 'sweep', label: 'Sweep',        family: 'sweep', badge: g => `±${g}dB`, desc: 'Drag on the graph to where you hear the boost or dip', minLevel: 1, maxLevel: 5 },
  { id: 'gain',  label: 'How Much?',    family: 'gain',  badge: () => '? dB',    desc: 'The frequency is marked — pick how many dB it was boosted or cut', minLevel: 1, maxLevel: 6 },
  { id: 'match', label: 'Match EQ',     family: 'match', badge: () => 'FREQ + dB', desc: 'Drag your own curve until it sounds like the hidden one', minLevel: 1, maxLevel: 5 },
];

// Sweep and Match EQ: the per-level octave tolerance labels ("within ±1 octave counts")
const SWEEP_TOL_LABEL = ['1', '⅔', '½', '⅓', '⅙'];
// Match EQ: where a guess starts when first nudged from the keyboard
const MATCH_START = { freq: 1000, gain: 0 };
const fmtGain = db => `${db > 0 ? '+' : db < 0 ? '−' : ''}${Math.abs(db)} dB`;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Explore mode: free play with one draggable filter (not a scored mode)
const EXPLORE_START = { type: 'peaking', freq: 1000, gain: 6 };
const EXPLORE_RANGE_DB = 18;
const isPassType = type => type === 'highpass' || type === 'lowpass';
const clampFreq = f => Math.max(20, Math.min(20000, f));
const clampGain = db => Math.max(-EXPLORE_RANGE_DB, Math.min(EXPLORE_RANGE_DB, db));
const clampMatchFreq = f => Math.max(SWEEP_RANGE[0], Math.min(SWEEP_RANGE[1], f));
const clampMatchGain = db => Math.max(-MATCH_RANGE_DB, Math.min(MATCH_RANGE_DB, db));

// Filter type names used in the answer reveal ("low shelf cut", "low-pass")
const TYPE_LABELS = {
  lowshelf: 'low shelf', highshelf: 'high shelf', lowpass: 'low-pass', highpass: 'high-pass',
};

export function FrequencyTrainer({ engine, gainDb, q, progress, focus, autoplay, onResult, initialMode, initialLevel, sourceId, initialSweepDir }) {
  const [testMode, setTestMode] = useState(initialMode ?? null);
  const [copied, setCopied] = useState(false);
  const currentMode = MODES.find(m => m.id === testMode);
  const family = currentMode?.family ?? 'peak';
  const isSweep = family === 'sweep';
  const isGain = family === 'gain';
  const isMatch = family === 'match';
  const minLevel = currentMode?.minLevel ?? MIN_LEVEL;
  const maxLevel = currentMode?.maxLevel ?? MAX_LEVEL;
  const answeringRef = useRef(false);
  // Last mode opened, so the picker's grouped cards reopen that variant
  const lastModeRef = useRef(initialMode ?? null);
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
  // Sweep direction chosen on the Start Trial screen: +1 boost, −1 dip
  // (a challenge link can set it, e.g. ?mode=sweep&dir=dip)
  const [sweepSign, setSweepSign] = useState(initialSweepDir === 'dip' ? -1 : 1);
  // Band button under the pointer (or keyboard focus); its curve is highlighted on the graph
  const [hovered, setHovered] = useState(null);
  // Explore mode's filter: type, frequency, and gain (Q comes from the Controls fader)
  const isExplore = testMode === 'explore';
  const [explore, setExplore] = useState(EXPLORE_START);
  const exploreFilter = makeFilter(explore.type, explore.freq, explore.gain, q);

  // The hidden filter for a trial at the current Gain/Q settings. engine.play
  // takes a list of filters, so calls wrap this in [ ]; an empty list is Flat.
  // How Much? and Match EQ carry their own gain (activeGain), so the Gain
  // slider doesn't apply to them.
  const activeFilter = t => t.activeGain !== undefined
    ? makeFilter('peaking', t.activeBand, t.activeGain, q)
    : makeFilter(typeAt(t.kind === 'sweep' ? 'peaking' : t.kind, t.activeBand), t.activeBand, t.activeSign * gainDb, q);
  // Match EQ: the player's own bell
  const guessFilter = sel => makeFilter('peaking', sel.freq, sel.gain, q);

  // Apply Gain/Q slider changes to the live EQ without restarting playback
  useEffect(() => {
    if (trial && playMode === 'eq') engine.play([activeFilter(trial)]);
  }, [gainDb, q]); // eslint-disable-line react-hooks/exhaustive-deps

  // Match EQ: retune "Yours" live as the guess is dragged or Q changes
  const guess = trial?.kind === 'match' ? trial.userSelection : null;
  useEffect(() => {
    if (guess && playMode === 'mine') engine.play([guessFilter(guess)]);
  }, [guess, q]); // eslint-disable-line react-hooks/exhaustive-deps

  // Explore: retune the live EQ as the curve is dragged or Q changes
  useEffect(() => {
    if (isExplore && playMode === 'eq') engine.play([exploreFilter]);
  }, [explore, q]); // eslint-disable-line react-hooks/exhaustive-deps

  // Engine stopped elsewhere (e.g. source track changed) — clear the play toggle
  useEffect(() => {
    if (!engine.isPlaying && playMode !== null) setPlayMode(null);
  }, [engine.isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key;

      if (isExplore) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (key === ' ') { e.preventDefault(); handlePlayMode(playMode === 'eq' ? 'flat' : 'eq'); }
        else if (key === 'ArrowLeft' || key === 'ArrowRight') {
          e.preventDefault();
          const step = Math.pow(2, (key === 'ArrowLeft' ? -1 : 1) / 12); // a semitone
          setExplore(x => ({ ...x, freq: clampFreq(x.freq * step) }));
        } else if (key === 'ArrowUp' || key === 'ArrowDown') {
          e.preventDefault();
          setExplore(x => isPassType(x.type) ? x : { ...x, gain: clampGain(Math.round(x.gain) + (key === 'ArrowUp' ? 1 : -1)) });
        } else if (/^[1-5]$/.test(key)) {
          setExplore(x => ({ ...x, type: EXPLORE_TYPES[Number(key) - 1].type }));
        }
        return;
      }

      if (key === 'Enter') {
        if (!testMode) return;
        if (!trial || trial.answered) { startTrial(); return; }
        if (trial.userSelection !== null) { e.preventDefault(); checkAnswer(); }
        return;
      }

      if (!trial) return;

      // EQ/Flat stays available after answering so the reveal can be re-heard.
      // Match EQ compares Target with Yours once there's a guess.
      if (key === ' ') {
        e.preventDefault();
        const other = trial.kind === 'match' && trial.userSelection ? 'mine' : 'flat';
        handlePlayMode(playMode === 'eq' ? other : 'eq');
        return;
      }
      if (trial.answered || e.metaKey || e.ctrlKey || e.altKey) return;

      if (trial.kind === 'match') {
        // Steps build on the latest guess, so held or rapid keys all count
        const nudge = f => setTrial(prev => (prev.answered ? prev : { ...prev, userSelection: f(prev.userSelection ?? MATCH_START) }));
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
          e.preventDefault();
          const step = Math.pow(2, (key === 'ArrowLeft' ? -1 : 1) / 12); // a semitone
          nudge(g => ({ ...g, freq: clampMatchFreq(g.freq * step) }));
        } else if (key === 'ArrowUp' || key === 'ArrowDown') {
          e.preventDefault();
          const step = key === 'ArrowUp' ? 0.5 : -0.5;
          nudge(g => ({ ...g, gain: clampMatchGain(g.gain + step) }));
        }
        return;
      }

      if (trial.kind === 'gain') {
        const opts = trial.options;
        const cur = trial.userSelection ? opts.indexOf(trial.userSelection.gain) : -1;
        if (/^[0-9]$/.test(key)) {
          const idx = key === '0' ? 9 : Number(key) - 1;
          if (idx < opts.length) select({ gain: opts[idx] });
        } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
          e.preventDefault();
          const next = key === 'ArrowLeft' ? Math.max(0, cur - 1) : Math.min(opts.length - 1, cur + 1);
          select({ gain: opts[next] });
        }
        return;
      }

      if (trial.kind === 'sweep') {
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
          e.preventDefault();
          const from = trial.userSelection?.freq ?? 1000;
          const to = from * Math.pow(2, (key === 'ArrowLeft' ? -1 : 1) / 12);
          selectBand(Math.max(20, Math.min(20000, to)), trial.activeSign);
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
  }, [trial, testMode, playMode, gainDb, q, level, sweepSign, explore]); // eslint-disable-line react-hooks/exhaustive-deps

  // Copies a link that recreates this setup (only the settings the mode uses)
  async function shareChallenge() {
    const url = buildChallengeUrl({
      mode: testMode,
      // How Much? and Match EQ pick their own gains, so only Q applies
      gainDb: family === 'pass' || isGain || isMatch ? undefined : gainDb,
      q: family === 'peak' || isSweep || isGain || isMatch ? q : undefined,
      source: sourceId,
      level,
      sweepDir: isSweep ? (sweepSign > 0 ? 'boost' : 'dip') : undefined,
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
    if (mode) lastModeRef.current = mode;
    // Leaving the challenge's mode ends the challenge's starting level
    if (mode !== initialMode) challengeLevelRef.current = null;
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
    if (isGain || isMatch) { startGainOrMatchTrial(); return; }
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
    const activeSign = isSweep ? sweepSign : signForMode(testMode);
    const next = { kind, range, shownBands, activeBand, activeSign, userSelection: null, answered: false, wasCorrect: null };
    setTrial(next);
    if (autoplay) {
      engine.play([activeFilter(next)]);
      setPlayMode('eq');
    }
  }

  // How Much?: a bell at a marked frequency with a gain from this level's keys.
  // Match EQ: a bell anywhere on the Sweep grid with a random gain to match.
  function startGainOrMatchTrial() {
    const pool = isGain ? GAIN_FREQS : SWEEP_GRID;
    const activeBand = focus ? pickWeighted(pool, progress, family) : pick(pool);
    const options = isGain ? GAIN_LEVELS[level - 1] : null;
    const activeGain = isGain ? pick(options) : pick(MATCH_GAINS) * (Math.random() < 0.5 ? -1 : 1);
    const next = {
      kind: family, range: SWEEP_RANGE, shownBands: [], options, activeBand, activeGain,
      activeSign: Math.sign(activeGain), userSelection: null, answered: false, wasCorrect: null,
    };
    setTrial(next);
    if (autoplay) {
      engine.play([activeFilter(next)]);
      setPlayMode('eq');
    }
  }

  // playMode: 'eq' (the hidden filter), 'flat', or 'mine' (Match EQ's own curve)
  function handlePlayMode(mode) {
    if (playMode === mode) { engine.stop(); setPlayMode(null); return; }
    if (mode === 'mine' && !trial?.userSelection) return;
    engine.play(mode === 'eq' ? [isExplore ? exploreFilter : activeFilter(trial)]
      : mode === 'mine' ? [guessFilter(trial.userSelection)]
      : []);
    setPlayMode(mode);
  }

  // Explore: dragging on the graph moves the curve (gain only for bell and shelves)
  function handleExplorePoint({ freq, db }) {
    setExplore(x => ({
      ...x,
      freq: clampFreq(freq),
      gain: isPassType(x.type) ? x.gain : clampGain(Math.round(db * 2) / 2),
    }));
  }

  // userSelection is { freq, sign } for band modes and Sweep (sign ±1),
  // { gain } for How Much?, and { freq, gain } for Match EQ
  function select(sel) {
    if (!trial || trial.answered) return;
    setTrial(prev => ({ ...prev, userSelection: sel }));
  }
  const selectBand = (freq, sign) => select({ freq, sign });

  // Match EQ: dragging on the graph moves your bell (frequency and gain)
  function handleMatchPoint({ freq, db }) {
    select({ freq: clampMatchFreq(freq), gain: clampMatchGain(Math.round(db * 2) / 2) });
  }

  function checkAnswer() {
    if (!trial || trial.userSelection === null || answeringRef.current) return;
    answeringRef.current = true;
    const { kind, activeBand, activeSign, activeGain, userSelection } = trial;
    const errOct = kind === 'sweep' || kind === 'match' ? octaveError(userSelection.freq, activeBand) : null;
    const errDb = kind === 'match' ? Math.abs(userSelection.gain - activeGain) : null;
    const correct = kind === 'sweep' ? withinSweepTolerance(errOct, level)
      : kind === 'match' ? withinMatchTolerance(errOct, errDb, level)
      : kind === 'gain' ? userSelection.gain === activeGain
      : userSelection.freq === activeBand && userSelection.sign === activeSign;
    // Scored at the level it was answered at, before any level change
    const points = trialPoints({ mode: testMode, level, correct, errOct, errDb });

    engine.stop();
    setPlayMode(null);

    const next = applyAnswer({ correct, correctStreak, wrongStreak, level, minLevel, maxLevel });
    setCorrectStreak(next.correctStreak);
    setWrongStreak(next.wrongStreak);
    // The challenge's starting level has done its job; let saved progress take over
    if (testMode === initialMode) challengeLevelRef.current = null;
    onResult({ mode: testMode, family, freq: activeBand, correct, level: next.level, points, errOct, errDb });
    setTrial(prev => ({ ...prev, answered: true, wasCorrect: correct, points }));
  }

  const isMixed = testMode === 'both';
  const twoRows = pickDirection(testMode);

  // Candidates in gray: both directions where the direction is part of the puzzle
  let curves = [];
  if (trial?.kind === 'gain') {
    // How Much?: every gain choice at the marked frequency
    curves = trial.options.map(g => makeFilter('peaking', trial.activeBand, g, q));
  } else if (trial && trial.kind !== 'sweep' && trial.kind !== 'match') {
    const gains = twoRows ? [gainDb, -gainDb] : [trial.activeSign * gainDb];
    curves = trial.shownBands.flatMap(f => gains.map(g => makeFilter(typeAt(trial.kind, f), f, g, q)));
  }

  // Before answering, the selected button's curve is emphasised on the graph and
  // the hovered button's curve is previewed faintly (its row sets the direction)
  const curveFor = ({ freq, sign }) => makeFilter(typeAt(trial.kind, freq), freq, sign * gainDb, q);
  let selectedCurve = null, hoverCurve = null;
  if (trial?.kind === 'match') {
    // Your bell stays drawn after answering, beside the revealed target
    if (trial.userSelection) selectedCurve = guessFilter(trial.userSelection);
  } else if (trial?.kind === 'gain') {
    const gainCurve = g => makeFilter('peaking', trial.activeBand, g, q);
    const sel = trial.userSelection;
    if (!trial.answered && sel) selectedCurve = gainCurve(sel.gain);
    if (!trial.answered && hovered !== null && hovered !== sel?.gain) hoverCurve = gainCurve(hovered);
  } else if (trial && !trial.answered && trial.kind !== 'sweep') {
    const sel = trial.userSelection;
    if (sel) selectedCurve = curveFor(sel);
    if (hovered && !(sel && sel.freq === hovered.freq && sel.sign === hovered.sign)) hoverCurve = curveFor(hovered);
  }

  // Status line on the graph: which filter is in play and its settings
  const SIGN = { boost: '+', cut: '−', both: '±', shelf: '±', sweep: sweepSign > 0 ? '+' : '−' };
  const qText = `Q ${q.toFixed(1)}`;
  const exploreLabel = EXPLORE_TYPES.find(t => t.type === explore.type).label.toUpperCase();
  const readout = isExplore
    ? (isPassType(explore.type) ? `${exploreLabel} · 12 dB/oct` : `${exploreLabel} · ${fmtGain(explore.gain)}${explore.type === 'peaking' ? ` · ${qText}` : ''}`)
    : !currentMode ? `±${gainDb} dB · ${qText}`
    : isGain ? `PEAK · ${trial ? fmtHz(trial.activeBand) : '?'} · ${trial?.answered ? fmtGain(trial.activeGain) : '? dB'} · ${qText}`
    : isMatch ? (guess ? `YOURS · ${fmtHz(guess.freq)} · ${fmtGain(guess.gain)} · ${qText}` : `PEAK · ? · ? dB · ${qText}`)
    : family === 'pass' ? `${trial ? (trial.kind === 'highpass' ? 'HIGH-PASS' : 'LOW-PASS') : 'HP / LP'} · 12 dB/oct`
    : family === 'shelf' ? `SHELF · ±${gainDb} dB`
    : `PEAK · ${SIGN[testMode]}${gainDb} dB · ${qText}`;

  // The graph is the instrument's "screen" and is shown in every state
  const screen = (
    <FreqGraph
      curves={curves}
      hover={hoverCurve}
      selected={isExplore ? exploreFilter : selectedCurve}
      selectedTone={trial?.kind === 'match' ? 'mine' : null}
      answer={trial?.answered ? activeFilter(trial) : null}
      gainDb={isExplore ? EXPLORE_RANGE_DB : isGain || isMatch ? MATCH_RANGE_DB : gainDb}
      sampleRate={engine.sampleRate}
      heat={heatFor(progress, family)}
      marker={isExplore ? explore.freq
        : trial?.kind === 'sweep' || trial?.kind === 'match' ? trial.userSelection?.freq ?? null
        : trial?.kind === 'gain' && !trial.answered ? trial.activeBand
        : null}
      onPick={trial?.kind === 'sweep' && !trial.answered ? f => selectBand(f, trial.activeSign) : null}
      onPoint={isExplore ? handleExplorePoint : trial?.kind === 'match' && !trial.answered ? handleMatchPoint : null}
      pickText={isMatch ? 'Click or drag to place your curve'
        : sweepSign > 0 ? 'Click or drag where you hear the boost' : 'Click or drag where you hear the dip'}
      readout={readout}
      idle={!engine.isLoaded}
    />
  );

  // `outside` renders below the panel (the empty state's quick-start steps)
  let header = null, body = null, outside = null;

  if (!engine.isLoaded) {
    // ── Empty state ───────────────────────────────────────────────────────
    outside = <QuickStart />;
  } else if (!testMode) {
    // ── Mode picker ───────────────────────────────────────────────────────
    body = (
      <>
        <h2 className="mode-title">Choose Test Mode</h2>
        <ModePicker modes={MODES} gainDb={gainDb} lastMode={lastModeRef.current} onSelect={selectMode} />
      </>
    );
  } else if (isExplore) {
    // ── Explore (free play) ───────────────────────────────────────────────
    const pass = isPassType(explore.type);
    const where = describeRegion(explore.freq, pass ? -1 : Math.sign(explore.gain));
    const guide = pass
      ? `${exploreLabel === 'HIGH-PASS' ? 'Removes the lows below' : 'Removes the highs above'} ${fmtHz(explore.freq)} (${where.region}): ${
          exploreLabel === 'HIGH-PASS' ? 'thinner, less weight' : 'darker, duller'}`
      : `${fmtHz(explore.freq)} · ${where.note} · ${where.region}: ${where.character}`;
    header = (
      <>
        <div className="mode-badge">Explore · free play</div>
        <span className="trainer-status">Drag the curve on the graph</span>
        <span className="trainer-header-end">
          <button className="btn-ghost trainer-back" onClick={() => selectMode(null)}>← Back</button>
        </span>
      </>
    );
    body = (
      <ExploreBody
        type={explore.type} onType={type => setExplore(x => ({ ...x, type }))}
        guide={guide} playMode={playMode} onPlay={handlePlayMode}
      />
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
        {isSweep && (
          <div className="sweep-dir" role="group" aria-label="Sweep direction">
            <button
              className={`btn-ghost sweep-opt sweep-opt-boost${sweepSign === 1 ? ' is-active' : ''}`}
              onClick={() => setSweepSign(1)} aria-pressed={sweepSign === 1}
            >▲ Boost</button>
            <button
              className={`btn-ghost sweep-opt sweep-opt-dip${sweepSign === -1 ? ' is-active' : ''}`}
              onClick={() => setSweepSign(-1)} aria-pressed={sweepSign === -1}
            >▼ Dip</button>
          </div>
        )}
        <p className="start-desc">{isSweep
          ? <>Drag on the graph to where you hear the <strong>{sweepSign > 0 ? 'boost' : 'dip'}</strong> — within <strong>±{SWEEP_TOL_LABEL[level - 1]}</strong> octave counts</>
          : isGain
          ? <>Pick how many dB the marked bell adds or removes — from <strong>{GAIN_LEVELS[level - 1].map(g => (g > 0 ? `+${g}` : `−${-g}`)).join(' ')}</strong> dB</>
          : isMatch
          ? <>Drag your own bell until it sounds like the hidden one — within <strong>±{SWEEP_TOL_LABEL[level - 1]} oct</strong> and <strong>±{MATCH_TOLERANCE[level - 1].db} dB</strong> counts</>
          : <>{currentMode.desc} — pick from <strong>{level}</strong> {family === 'shelf' ? 'corners' : family === 'pass' ? 'cutoffs' : 'bands'}</>}
        </p>
        <button className="btn-primary large" onClick={startTrial}>Start Trial</button>
      </div>
    );
  } else {
    // ── Active trial ──────────────────────────────────────────────────────
    const { kind, range, shownBands, options, activeBand, activeSign, activeGain, userSelection, answered, wasCorrect, points } = trial;
    const dirLabel = activeSign > 0 ? 'boost' : 'cut';
    const activeType = kind === 'sweep' || kind === 'gain' || kind === 'match' ? 'peaking' : typeAt(kind, activeBand);
    const sweepError = (kind === 'sweep' || kind === 'match') && userSelection ? octaveError(userSelection.freq, activeBand) : null;
    // What the answer was, spelled out after answering (e.g. "low shelf cut")
    const answerLabel = kind === 'peaking' || kind === 'sweep' ? dirLabel
      : kind === 'shelf' ? `${TYPE_LABELS[activeType]} ${dirLabel}` : TYPE_LABELS[activeType];
    const hasSelection = userSelection !== null;

    // How Much? keys, by gain value
    const getGainState = g => {
      const isSel = hasSelection && userSelection.gain === g;
      const isAct = g === activeGain;
      if (answered) {
        if (isAct && isSel) return 'f-hit';
        if (isAct) return 'f-missed';
        if (isSel) return 'f-wrong';
      }
      return isSel ? 'f-selected' : '';
    };

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

    header = (
      <>
        <div className="level-chip">Level {level}</div>
        <div className="mode-badge">{currentMode.badge(gainDb)} · {currentMode.label}</div>
        {!answered ? (
          <span className="trainer-status">
            {hasSelection ? (kind === 'sweep' ? `Guess ${fmtHz(userSelection.freq)} — ready to check`
                : kind === 'match' ? `Yours ${fmtHz(userSelection.freq)} ${fmtGain(userSelection.gain)} — ready to check`
                : 'Ready to check')
              : kind === 'sweep' ? 'Click or drag on the graph'
              : kind === 'gain' ? `How many dB at ${fmtHz(activeBand)}?`
              : kind === 'match' ? 'Drag your curve to match the EQ'
              : isMixed ? 'Pick the frequency and direction'
              : kind === 'shelf' ? 'Pick the shelf corner and direction'
              : kind !== 'peaking' ? `Find the ${TYPE_LABELS[kind]} cutoff`
              : `Select the ${activeSign > 0 ? 'boosted' : 'cut'} band`}
          </span>
        ) : (
          <span className={`trainer-result ${wasCorrect ? 'result-correct' : 'result-incorrect'}`}>
            {wasCorrect ? '✓ Correct!' : '✗ Incorrect'}
            {/* Sweep near misses still earn partial points */}
            {points > 0 && <span className="result-points">+{points} pts</span>}
            <span className="result-note">
              {kind === 'sweep' ? `${fmtHz(activeBand)} · ${sweepError.toFixed(2)} oct off`
                : kind === 'match' ? `${fmtHz(activeBand)} ${fmtGain(activeGain)} · ${sweepError.toFixed(2)} oct, ${Math.abs(userSelection.gain - activeGain).toFixed(1)} dB off`
                : kind === 'gain' ? `${fmtGain(activeGain)} at ${fmtHz(activeBand)}`
                : kind === 'peaking' ? freqToNote(activeBand) : answerLabel} · {freqRegion(activeBand)}
            </span>
          </span>
        )}
        <span className="trainer-header-end">
          <button className="btn-ghost trainer-back" onClick={() => selectMode(null)}>← Back</button>
          {shareButton}
        </span>
      </>
    );

    const shortcuts = kind === 'sweep'
      ? 'Click/drag the graph · ← → nudge · Space EQ/Flat · Enter check/next'
      : kind === 'match'
      ? 'Drag the graph · ← → frequency · ↑ ↓ gain · Space Target/Yours · Enter check/next'
      : kind === 'gain'
      ? `1–${Math.min(options.length, 9)}${options.length > 9 ? ', 0' : ''} pick gain · ← → move · Space EQ/Flat · Enter check/next`
      : `1–9, 0 pick band · ← → move${twoRows ? ' · ↑ ↓ boost/cut' : ''} · Space EQ/Flat · Enter check/next`;

    body = (
      <>
        {kind === 'sweep' ? (
          <p className="sweep-hint">
            Within <strong>±{SWEEP_TOL_LABEL[level - 1]} oct</strong> counts · ← → nudge by a semitone
          </p>
        ) : kind === 'match' ? (
          <p className="sweep-hint">
            Within <strong>±{SWEEP_TOL_LABEL[level - 1]} oct</strong> and <strong>±{MATCH_TOLERANCE[level - 1].db} dB</strong> counts · ← → frequency · ↑ ↓ gain
          </p>
        ) : kind === 'gain' ? (
          <GainRow
            options={options} getBtnState={getGainState} select={g => select({ gain: g })}
            answered={answered} onHover={setHovered}
          />
        ) : (
          <BandRows
            twoRows={twoRows} sign={activeSign}
            shownBands={shownBands} range={range} getBtnState={getBtnState}
            selectBand={selectBand} answered={answered} onHover={setHovered}
          />
        )}

        {answered && kind !== 'sweep' && kind !== 'match' && (
          <AnswerLegend
            wasCorrect={wasCorrect} hasSelection={hasSelection}
            directionLabel={twoRows ? answerLabel : null}
          />
        )}

        <Transport
          playMode={playMode} onPlay={handlePlayMode} shortcuts={shortcuts}
          answered={answered} canCheck={hasSelection} onCheck={checkAnswer} onNext={startTrial}
          yours={kind === 'match' ? { disabled: !hasSelection } : null}
        />

        <StreakMeter
          correctStreak={correctStreak} wrongStreak={wrongStreak}
          correctToAdvance={CORRECT_TO_ADVANCE} wrongToDecrease={WRONG_TO_DECREASE}
        />
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
