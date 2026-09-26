// Presentational pieces of the trainer panel. They hold no state: the
// FrequencyTrainer owns the trial and passes in what to show and what to call.
import { InfoIcon } from './Icons.jsx';
import { rowInset, biquadCoeffs, magnitudeDb } from './FreqGraph.jsx';
import { FREQ_LABEL, FREQ_UNIT, EXPLORE_TYPES } from '../lib/trainer.js';

export function QuickStart() {
  return (
    <ol className="quickstart">
      <li><strong>Load a source</strong> — pink noise is best for learning; your own music works too.</li>
      <li><strong>Choose a mode</strong> — spot boosts and cuts, shelves, filter cutoffs, or sweep for the exact spot.</li>
      <li><strong>Compare EQ and Flat</strong>, then pick the band you hear changing.</li>
    </ol>
  );
}

// Small response sketches for the mode cards, drawn with the same biquad math
// as the graph so each shows the real shape of that mode's filter. Each curve
// is tagged boost or cut so it can take the matching colour on hover.
const GLYPH_W = 64, GLYPH_H = 28, GLYPH_DB = 13, GLYPH_SR = 48000;
function sketch(filter) {
  const coeffs = biquadCoeffs(filter, GLYPH_SR);
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const f = 20 * Math.pow(1000, i / 48);
    const db = Math.max(-GLYPH_DB, Math.min(GLYPH_DB, magnitudeDb(coeffs, f, GLYPH_SR)));
    pts.push(`${((i / 48) * GLYPH_W).toFixed(1)},${(GLYPH_H / 2 - (db / GLYPH_DB) * (GLYPH_H / 2 - 1.5)).toFixed(1)}`);
  }
  return pts.join(' ');
}
// A wider bell than the app default (Q 1.4) so it reads at this tiny size
const peak = (frequency, gain) => ({ type: 'peaking', frequency, Q: 0.9, gain });
const MODE_SKETCHES = {
  boost: [['boost', sketch(peak(1000, 11))]],
  cut:   [['cut', sketch(peak(1000, -11))]],
  both:  [['boost', sketch(peak(250, 11))], ['cut', sketch(peak(4000, -11))]],
  shelf: [['boost', sketch({ type: 'lowshelf', frequency: 250, gain: 9 })], ['cut', sketch({ type: 'highshelf', frequency: 4000, gain: -9 })]],
  pass:  [['cut', sketch({ type: 'highpass', frequency: 120, Q: -3.01 })], ['cut', sketch({ type: 'lowpass', frequency: 8000, Q: -3.01 })]],
  sweep: [['boost', sketch(peak(1400, 11))]],
  explore: [['boost', sketch(peak(500, 10))], ['cut', sketch(peak(5000, -7))]],
};

function ModeGlyph({ id }) {
  return (
    <svg className="mode-glyph" viewBox={`0 0 ${GLYPH_W} ${GLYPH_H}`} width={GLYPH_W} height={GLYPH_H} aria-hidden="true">
      <line className="mode-glyph-zero" x1="0" y1={GLYPH_H / 2} x2={GLYPH_W} y2={GLYPH_H / 2} />
      {id === 'sweep' && <line className="mode-glyph-marker" x1={GLYPH_W * 0.62} y1="1" x2={GLYPH_W * 0.62} y2={GLYPH_H - 1} />}
      {(MODE_SKETCHES[id] ?? []).map(([dir, pts], i) => (
        <polyline key={i} className={`mode-glyph-${dir}`} points={pts} />
      ))}
    </svg>
  );
}

export function ModePicker({ modes, gainDb, onSelect }) {
  return (
    <div className="mode-grid">
      {/* Explore: free play, no quiz; full width above the six test modes */}
      <button className="mode-card mode-card-explore" onClick={() => onSelect('explore')}>
        <span className="mode-sign">FREE PLAY</span>
        <ModeGlyph id="explore" />
        <span className="mode-label">Explore</span>
        <span className="mode-desc">
          No quiz: drag an EQ curve on the graph and hear what each region sounds like before testing yourself.
        </span>
      </button>
      {modes.map(m => (
        <button key={m.id} className="mode-card" onClick={() => onSelect(m.id)}>
          <span className="mode-sign">{m.badge(gainDb)}</span>
          <ModeGlyph id={m.id} />
          <span className="mode-label">{m.label}</span>
          <span className="mode-desc">{m.desc}</span>
        </button>
      ))}
    </div>
  );
}

// One row of band keys, laid out as n equal columns inset so each key sits
// under its curve on the graph. `sign` is the direction this row answers.
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

// Band keys: one row, or a boost row above a cut row when the direction is
// part of the answer
export function BandRows({ twoRows, sign, ...rowProps }) {
  if (!twoRows) return <FreqRow {...rowProps} sign={sign} />;
  return (
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
  );
}

// Key to the button colours after answering, plus the direction reveal
export function AnswerLegend({ wasCorrect, hasSelection, directionLabel }) {
  return (
    <div className="freq-legend">
      <span className="legend-item"><span className="legend-dot ld-hit" />Correct</span>
      {!wasCorrect && (
        <span className="legend-item"><span className="legend-dot ld-missed" />Was the answer</span>
      )}
      {hasSelection && !wasCorrect && (
        <span className="legend-item"><span className="legend-dot ld-wrong" />Your pick</span>
      )}
      {directionLabel && (
        <span className="legend-item muted mixed-dir-reveal">
          Answer was a <strong>{directionLabel}</strong>
        </span>
      )}
    </div>
  );
}

// EQ/Flat toggles on the left; keyboard hint and Check / Next on the right
// hideAction: no Check / Next buttons (Explore mode has nothing to answer)
export function Transport({ playMode, onPlay, shortcuts, answered, canCheck, onCheck, onNext, hideAction = false }) {
  return (
    <div className="transport">
      <button
        className={`play-toggle play-toggle-eq ${playMode === 'eq' ? 'ptog-eq' : ''}`}
        onClick={() => onPlay('eq')}
      >
        {playMode === 'eq' ? '◼' : '▶'} EQ
      </button>
      <button
        className={`play-toggle play-toggle-flat ${playMode === 'flat' ? 'ptog-flat' : ''}`}
        onClick={() => onPlay('flat')}
      >
        {playMode === 'flat' ? '◼' : '▶'} Flat
      </button>
      <div className="transport-action">
        <span className="icon-btn trainer-kb-hint" aria-hidden="true" data-tooltip={shortcuts}>
          <InfoIcon />
        </span>
        {hideAction ? null : !answered ? (
          <button className="btn-primary" onClick={onCheck} disabled={!canCheck}>Check Answer</button>
        ) : (
          <button className="btn-primary" onClick={onNext}>Next Trial →</button>
        )}
      </div>
    </div>
  );
}

// Progress toward the next level change: correct streak toward level up, or
// wrong streak toward level down
export function StreakMeter({ correctStreak, wrongStreak, correctToAdvance, wrongToDecrease }) {
  const isWrong = wrongStreak > 0;
  const count = isWrong ? wrongStreak : correctStreak;
  const max = isWrong ? wrongToDecrease : correctToAdvance;
  return (
    <div className="streak-row">
      <span className={`streak-label ${isWrong ? 'wrong-label' : ''}`}>
        {`${count}/${max} ${isWrong ? 'wrong → level down' : 'correct → level up'}`}
      </span>
      <div className="streak-pips">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={`pip ${i < count ? (isWrong ? 'pip-wrong' : 'pip-correct') : ''}`} />
        ))}
      </div>
    </div>
  );
}

// Explore mode controls: filter type, the region guide, and EQ/Flat
export function ExploreBody({ type, onType, guide, playMode, onPlay }) {
  return (
    <>
      <div className="explore-types" role="group" aria-label="Filter type">
        {EXPLORE_TYPES.map((t, i) => (
          <button
            key={t.type}
            className={`btn-ghost explore-type${type === t.type ? ' is-active' : ''}`}
            onClick={() => onType(t.type)}
            aria-pressed={type === t.type}
          >
            <span className="explore-key">{i + 1}</span>{t.label}
          </button>
        ))}
      </div>
      <p className="explore-guide" aria-live="polite">{guide}</p>
      <Transport
        playMode={playMode} onPlay={onPlay} hideAction
        shortcuts="Drag the graph · ← → frequency · ↑ ↓ gain · 1–5 filter type · Space EQ/Flat"
      />
    </>
  );
}
