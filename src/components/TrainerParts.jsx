// Presentational pieces of the trainer panel. They hold no state: the
// FrequencyTrainer owns the trial and passes in what to show and what to call.
import { InfoIcon } from './Icons.jsx';
import { rowInset } from './FreqGraph.jsx';
import { FREQ_LABEL, FREQ_UNIT } from '../lib/trainer.js';

export function QuickStart() {
  return (
    <ol className="quickstart">
      <li><strong>Load a source</strong> — pink noise is best for learning; your own music works too.</li>
      <li><strong>Choose a mode</strong> — spot boosts and cuts, shelves, filter cutoffs, or sweep for the exact spot.</li>
      <li><strong>Compare EQ and Flat</strong>, then pick the band you hear changing.</li>
    </ol>
  );
}

export function ModePicker({ modes, gainDb, onSelect }) {
  return (
    <div className="mode-grid">
      {modes.map(m => (
        <button key={m.id} className="mode-card" onClick={() => onSelect(m.id)}>
          <span className="mode-label">{m.label}</span>
          <span className="mode-sign">{m.badge(gainDb)}</span>
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
export function Transport({ playMode, onPlay, shortcuts, answered, canCheck, onCheck, onNext }) {
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
        {!answered ? (
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
