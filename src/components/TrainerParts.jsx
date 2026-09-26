// Presentational pieces of the trainer panel. They hold no state: the
// FrequencyTrainer owns the trial and passes in what to show and what to call.
import { InfoIcon } from './Icons.jsx';
import { rowInset, biquadCoeffs, magnitudeDb } from './FreqGraph.jsx';
import { FREQ_LABEL, FREQ_UNIT, EXPLORE_TYPES } from '../lib/trainer.js';
import { PINK_LINE } from '../lib/trackFormat.js';

// Quick start: one panel with three steps as columns, in the mode cards' style.
// Step 1 is lit: it's what to do next.
const QS_W = 60, QS_H = 26;
// Computed on first use: sketch() needs constants declared further down
let qsBellPts = null;
const qsBell = () => (qsBellPts ??= sketch({ type: 'peaking', frequency: 700, Q: 0.9, gain: 10 }));

function QuickStartGlyph({ step }) {
  return (
    <svg className="qs-glyph" viewBox={`0 0 ${QS_W} ${QS_H}`} width={QS_W} height={QS_H} aria-hidden="true">
      {step === 1 && <polyline points={PINK_LINE} transform={`translate(0 ${(QS_H - 28) / 2})`} />}
      {step === 2 && [0, 1, 2].flatMap(c => [0, 1].map(r => (
        <rect key={`${c}${r}`} x={6 + c * 17} y={2 + r * 12} width={14} height={10} rx={2} />
      )))}
      {step === 3 && (
        <>
          <line className="qs-flat" x1="0" y1={QS_H - 6} x2={QS_W} y2={QS_H - 6} />
          <polyline className="qs-eq" points={qsBell()} transform="translate(0 -2) scale(0.94 0.95)" />
        </>
      )}
    </svg>
  );
}

const QS_STEPS = [
  { title: 'Load a source', desc: 'Pink noise is best for learning. The music loops, or your own file, come next.' },
  { title: 'Choose a mode', desc: 'Spot boosts and cuts, find shelves and filter cutoffs, sweep for the exact spot, or just explore.' },
  { title: 'Listen and pick', desc: 'Switch between EQ and Flat as often as you like, then pick the change you hear.' },
];

export function QuickStart() {
  return (
    <ol className="quickstart">
      {QS_STEPS.map((st, i) => (
        <li key={st.title} className={`qs-step${i === 0 ? ' is-current' : ''}`}>
          <span className="qs-num">STEP {String(i + 1).padStart(2, '0')}</span>
          <QuickStartGlyph step={i + 1} />
          <span className="qs-title">{st.title}</span>
          <span className="qs-desc">{st.desc}</span>
        </li>
      ))}
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
  'sweep-dip': [['cut', sketch(peak(1400, -11))]],
  explore: [['boost', sketch(peak(500, 10))], ['cut', sketch(peak(5000, -7))]],
  gain:  [['boost', sketch(peak(1000, 4))], ['boost', sketch(peak(1000, 8))], ['boost', sketch(peak(1000, 12))]],
  match: [['cut', sketch(peak(1300, 8))], ['boost', sketch(peak(900, 11))]],
};

function ModeGlyph({ id, small = false }) {
  // small: the keys inside a grouped panel; the viewBox scales the same sketch
  const w = small ? 52 : GLYPH_W, h = small ? 22 : GLYPH_H;
  return (
    <svg className="mode-glyph" viewBox={`0 0 ${GLYPH_W} ${GLYPH_H}`} width={w} height={h} aria-hidden="true">
      <line className="mode-glyph-zero" x1="0" y1={GLYPH_H / 2} x2={GLYPH_W} y2={GLYPH_H / 2} />
      {id.startsWith('sweep') && <line className="mode-glyph-marker" x1={GLYPH_W * 0.62} y1="1" x2={GLYPH_W * 0.62} y2={GLYPH_H - 1} />}
      {(MODE_SKETCHES[id] ?? []).map(([dir, pts], i) => (
        <polyline key={i} className={`mode-glyph-${dir}`} points={pts} />
      ))}
    </svg>
  );
}

// Modes that differ only in direction or filter type share a card with a strip
// of keys along its bottom, one per mode (each opens it); the rest get a card each
// A key's `opts` go to onSelect with its mode (Sweep's keys set the direction)
const MODE_GROUPS = [
  { id: 'bands', label: 'Bands', desc: 'Hear a peak change and pick its band', modes: ['boost', 'cut', 'both'] },
  { id: 'filters', label: 'Filters', desc: "Find a shelf's corner or a pass filter's cutoff", modes: ['shelf', 'pass'] },
  {
    id: 'sweep', label: 'Sweep', desc: 'Drag on the graph to where you hear the change',
    keys: [
      { mode: 'sweep', opts: { dir: 'boost' }, label: 'Boost', name: 'Sweep boost', glyph: 'sweep', badge: g => `+${g}dB`, desc: 'Drag to where you hear the boost' },
      { mode: 'sweep', opts: { dir: 'dip' }, label: 'Dip', name: 'Sweep dip', glyph: 'sweep-dip', badge: g => `−${g}dB`, desc: 'Drag to where you hear the dip' },
    ],
  },
  { modes: ['gain'] },
  { modes: ['match'] },
];
// Shorter key labels where the full mode name won't fit a key
const KEY_LABEL = { pass: 'Pass' };

function ModeGroupPanel({ group, modes, gainDb, onSelect }) {
  const keys = group.keys ?? group.modes.map(id => {
    const m = modes.find(x => x.id === id);
    return { mode: id, label: KEY_LABEL[id] ?? m.label, name: m.label, glyph: id, badge: m.badge, desc: m.desc };
  });
  return (
    <div className="mode-panel" role="group" aria-label={group.label}>
      <div className="mode-panel-head">
        <span className="mode-label">{group.label}</span>
        <span className="mode-desc">{group.desc}</span>
      </div>
      <div className="mode-keys" style={{ '--n': keys.length }}>
        {keys.map(k => (
          <button
            key={k.name}
            className="mode-key"
            onClick={() => onSelect(k.mode, k.opts)}
            aria-label={`${k.name}: ${k.desc}`}
            data-tooltip={k.desc}
          >
            <ModeGlyph id={k.glyph} small />
            <span className="mode-key-label">{k.label}</span>
            <span className="mode-key-sign">{k.badge(gainDb)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ModePicker({ modes, gainDb, onSelect }) {
  return (
    <div className="mode-grid">
      {MODE_GROUPS.map(group => {
        if (group.keys || group.modes.length > 1) {
          return <ModeGroupPanel key={group.id} group={group} modes={modes} gainDb={gainDb} onSelect={onSelect} />;
        }
        const m = modes.find(x => x.id === group.modes[0]);
        return (
          <button key={m.id} className="mode-card" onClick={() => onSelect(m.id)}>
            <span className="mode-sign">{m.badge(gainDb)}</span>
            <ModeGlyph id={m.id} />
            <span className="mode-label">{m.label}</span>
            <span className="mode-desc">{m.desc}</span>
          </button>
        );
      })}
      {/* Explore: free play, no quiz; last in the grid */}
      <button className="mode-card mode-card-explore" onClick={() => onSelect('explore')}>
        <span className="mode-sign">FREE PLAY</span>
        <ModeGlyph id="explore" />
        <span className="mode-label">Explore</span>
        <span className="mode-desc">
          No quiz: drag an EQ curve on the graph and hear what each region sounds like before testing yourself.
        </span>
      </button>
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

// How Much? keys: one per gain choice, in equal columns under the graph
export function GainRow({ options, getBtnState, select, answered, onHover }) {
  return (
    <div className="freq-grid gain-grid" style={{ '--n': options.length }}>
      {options.map(g => (
        <button
          key={g}
          className={`freq-btn ${getBtnState(g)}`}
          onClick={() => select(g)}
          onMouseEnter={() => onHover(g)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(g)}
          onBlur={() => onHover(null)}
          disabled={answered}
          aria-label={`${g > 0 ? 'plus' : 'minus'} ${Math.abs(g)} dB`}
        >
          <span className="freq-num">{g > 0 ? '+' : '−'}{Math.abs(g)}</span>
          <span className="freq-unit">dB</span>
        </button>
      ))}
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
// yours: Match EQ's third toggle for hearing your own curve ({ disabled });
// the EQ toggle is then labelled Target
export function Transport({ playMode, onPlay, shortcuts, answered, canCheck, onCheck, onNext, hideAction = false, yours = null }) {
  return (
    <div className="transport">
      <button
        className={`play-toggle play-toggle-eq ${playMode === 'eq' ? 'ptog-eq' : ''}`}
        onClick={() => onPlay('eq')}
      >
        {playMode === 'eq' ? '◼' : '▶'} {yours ? 'Target' : 'EQ'}
      </button>
      {yours && (
        <button
          className={`play-toggle play-toggle-mine ${playMode === 'mine' ? 'ptog-mine' : ''}`}
          onClick={() => onPlay('mine')}
          disabled={yours.disabled}
        >
          {playMode === 'mine' ? '◼' : '▶'} Yours
        </button>
      )}
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
