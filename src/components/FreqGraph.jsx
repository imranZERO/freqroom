import { useMediaQuery } from '../hooks/useMediaQuery.js';

const F_MIN = 20, F_MAX = 20000;
const N = 300;
// Horizontal layout is fixed so the band buttons (rowInset) always line up
const P = { r: 14, l: 32 };
const VW = 600;
const IW = VW - P.l - P.r;

// Vertical layout. On wide screens the graph is shallow; on phones (where the
// whole SVG is scaled down) it's taller and its text is scaled up by k so labels
// stay readable. T = space above the plot, B = below it (frequency labels and
// the accuracy strip). The wide values make the panel match the source buttons.
const WIDE = { k: 1, T: 17, IH: 144, B: 39.4 };
const COMPACT = { k: 1.7, T: 17 * 1.7, IH: 190, B: 39.4 * 1.7 };
const layout = g => ({ ...g, VH: g.T + g.IH + g.B });
const COMPACT_QUERY = '(max-width: 600px)';

const FREQ_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

const toX = f => P.l + (Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN)) * IW;
const fromX = x => F_MIN * Math.pow(F_MAX / F_MIN, (Math.max(P.l, Math.min(P.l + IW, x)) - P.l) / IW);
const toY = (db, range, g) => g.T + ((range - db) / (2 * range)) * g.IH;
const fmtFreq = f => f >= 1000 ? `${f / 1000}k` : `${f}`;

// Readout format for arbitrary frequencies, e.g. "87 Hz", "1.24 kHz", "12.5 kHz"
export const fmtHz = f => f >= 10000 ? `${(f / 1000).toFixed(1)} kHz`
  : f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${Math.round(f)} Hz`;

// Text anchor that keeps a label inside the plot near its edges
const anchorAt = x => x < P.l + 40 ? 'start' : x > P.l + IW - 40 ? 'end' : 'middle';

// Sweep mode: the listener's guess, and after answering, a bracket to the answer
function SweepMarker({ marker, answerFreq, g }) {
  const mx = toX(marker);
  const ax = answerFreq ? toX(answerFreq) : null;
  const errOct = answerFreq ? Math.abs(Math.log2(marker / answerFreq)) : null;
  const by = g.T + g.IH - 10 * g.k;
  return (
    <g className="graph-marker">
      <line x1={mx} y1={g.T} x2={mx} y2={g.T + g.IH} className="marker-line" />
      <text x={mx} y={g.T + 10 * g.k} textAnchor={anchorAt(mx)} className="marker-label">{fmtHz(marker)}</text>
      {ax !== null && (
        <g className="marker-error">
          <line x1={mx} y1={by} x2={ax} y2={by} />
          <line x1={ax} y1={by - 4 * g.k} x2={ax} y2={by + 4 * g.k} />
          <text x={(mx + ax) / 2} y={by - 5 * g.k} textAnchor="middle" className="marker-label">
            {`${errOct.toFixed(2)} oct`}
          </text>
        </g>
      )}
    </g>
  );
}

// Biquad coefficients per the Web Audio spec (RBJ cookbook), so the drawn curve
// matches what BiquadFilterNode plays. Takes the same { type, frequency, Q, gain }
// descriptor the engine receives. Shelves use slope S = 1; lowpass/highpass read
// Q in dB, as BiquadFilterNode does.
export function biquadCoeffs({ type, frequency, Q = 1, gain = 0 }, sr) {
  const A = Math.pow(10, gain / 40);
  const w0 = 2 * Math.PI * frequency / sr;
  const cw = Math.cos(w0), sw = Math.sin(w0);
  let b0, b1, b2, a0, a1, a2;

  if (type === 'lowpass' || type === 'highpass') {
    const alpha = sw / (2 * Math.pow(10, Q / 20));
    const k = type === 'lowpass' ? 1 - cw : 1 + cw;
    b0 = k / 2; b1 = type === 'lowpass' ? k : -k; b2 = k / 2;
    a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
  } else if (type === 'lowshelf' || type === 'highshelf') {
    const t = 2 * Math.sqrt(A) * (sw / 2) * Math.SQRT2; // 2·√A·alpha with S = 1
    const s = type === 'lowshelf' ? 1 : -1;
    b0 = A * ((A + 1) - s * (A - 1) * cw + t);
    b1 = 2 * s * A * ((A - 1) - s * (A + 1) * cw);
    b2 = A * ((A + 1) - s * (A - 1) * cw - t);
    a0 = (A + 1) + s * (A - 1) * cw + t;
    a1 = -2 * s * ((A - 1) + s * (A + 1) * cw);
    a2 = (A + 1) + s * (A - 1) * cw - t;
  } else {
    const alpha = sw / (2 * Q);
    b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A;
    a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

export function magnitudeDb([b0, b1, b2, a1, a2], f, sr) {
  const w = 2 * Math.PI * f / sr;
  const cw = Math.cos(w), sw = Math.sin(w);
  const c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = b0 + b1 * cw + b2 * c2, ni = -(b1 * sw + b2 * s2);
  const dr = 1 + a1 * cw + a2 * c2, di = -(a1 * sw + a2 * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

function computeCurve(filter, sr, range, g) {
  const coeffs = biquadCoeffs(filter, sr);
  return Array.from({ length: N + 1 }, (_, i) => {
    const f = F_MIN * Math.pow(F_MAX / F_MIN, i / N);
    const db = magnitudeDb(coeffs, f, sr);
    return { x: toX(f), y: toY(Math.max(-range, Math.min(range, db)), range, g) };
  });
}

// Horizontal inset (as % of the graph width) that lines a row of n equal columns
// up with n bands spaced over [lo, hi] on the plot's log axis
export function rowInset(lo = F_MIN, hi = F_MAX) {
  const frac = f => Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN);
  return {
    left: `${((P.l + IW * frac(lo)) / VW) * 100}%`,
    right: `${((P.r + IW * (1 - frac(hi))) / VW) * 100}%`,
  };
}

function makeLine(pts) {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
}

function makeFill(pts, range, g) {
  const y0 = toY(0, range, g);
  const x0 = pts[0].x.toFixed(1), xN = pts[pts.length - 1].x.toFixed(1);
  return `${makeLine(pts)}L${xN},${y0.toFixed(1)}L${x0},${y0.toFixed(1)}Z`;
}

const heatClass = acc => acc === null ? 'heat-none' : acc < 0.5 ? 'heat-low' : acc < 0.8 ? 'heat-mid' : 'heat-high';
const hzLabel = f => f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`;

// Weak-spot strip: your accuracy per octave, on its own line below the frequency
// labels. Every octave has a faint placeholder segment; it takes a colour once it
// has enough answers to rate (see MIN_ATTEMPTS in progress.js).
function HeatStrip({ heat, g }) {
  const y = g.T + g.IH + 20 * g.k;
  const h = 7 * g.k;
  return (
    <g className="graph-heat">
      <text x={P.l - 4} y={y + h / 2} textAnchor="end" dominantBaseline="middle" className="graph-label graph-heat-label">
        acc
        <title>Your accuracy per octave (red under 50%, amber under 80%, green above)</title>
      </text>
      {heat.map(({ center, n, hits, acc }) => {
        const x0 = toX(Math.max(F_MIN, center / Math.SQRT2));
        const x1 = toX(Math.min(F_MAX, center * Math.SQRT2));
        return (
          <rect key={center} x={x0 + 0.5} y={y} width={Math.max(0, x1 - x0 - 1)} height={h} rx={1.5} className={heatClass(acc)}>
            <title>{`${hzLabel(center)} octave: ${acc === null
              ? `not rated yet (${n} of 3 answers)`
              : `${hits}/${n} correct (${Math.round(acc * 100)}%)`}`}</title>
          </rect>
        );
      })}
    </g>
  );
}

// L-shaped marks just inside each plot corner
function corners(g) {
  const L = 7 * g.k, o = 3 * g.k, x0 = P.l + o, x1 = P.l + IW - o, y0 = g.T + o, y1 = g.T + g.IH - o;
  return [
    `M${x0},${y0 + L}V${y0}H${x0 + L}`,
    `M${x1 - L},${y0}H${x1}V${y0 + L}`,
    `M${x0},${y1 - L}V${y1}H${x0 + L}`,
    `M${x1 - L},${y1}H${x1}V${y1 - L}`,
  ].join('');
}

const sameFilter = (a, b) => a.type === b.type && a.frequency === b.frequency && a.gain === b.gain;

// curves: candidate filters drawn in gray; answer: the revealed filter (or null).
// gainDb sets the dB range so the axis follows the Gain slider.
// Sweep mode passes marker (the current guess) and onPick, which makes the plot an input
// hover: faint preview of the hovered band's curve; selected: the chosen band's
// curve, drawn prominently until the answer is revealed
// readout: short status line drawn in the top-right of the plot (filter, gain, Q)
// idle: nothing loaded yet, so the display runs its scanning animation
export function FreqGraph({ curves = [], answer = null, hover = null, selected = null, gainDb = 6, sampleRate = 48000, heat = [], marker = null, onPick = null, readout = '', idle = false }) {
  const g = layout(useMediaQuery(COMPACT_QUERY) ? COMPACT : WIDE);
  const isBoost = answer ? (answer.gain ?? 0) > 0 : false;
  // ±12 dB by default; widens in 6 dB steps so high gains aren't clipped
  const range = Math.max(12, Math.ceil(Math.abs(gainDb) / 6) * 6);
  const dbTicks = Array.from({ length: range / 3 + 1 }, (_, i) => i * 6 - range);

  function pickAt(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    onPick(fromX(((e.clientX - rect.left) / rect.width) * VW));
  }
  const pointerProps = onPick ? {
    onPointerDown: e => {
      e.preventDefault(); // don't start a text selection while dragging
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
      pickAt(e);
    },
    onPointerMove: e => { if (e.buttons) pickAt(e); },
  } : {};

  return (
    <div className="freq-graph-wrap">
      <svg
        viewBox={`0 0 ${VW} ${g.VH}`} width="100%"
        className={`freq-graph-svg${onPick ? ' graph-interactive' : ''}`}
        style={{ '--gk': g.k }}
        {...pointerProps}
      >
        <defs>
          <linearGradient id="graph-scan-trail" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--a)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--a)" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* dB grid */}
        {dbTicks.map(db => (
          <g key={db}>
            <line x1={P.l} y1={toY(db, range, g)} x2={P.l + IW} y2={toY(db, range, g)}
              className={`graph-hline ${db === 0 ? 'graph-zero' : 'graph-grid'}`} />
            <text x={P.l - 4} y={toY(db, range, g)} textAnchor="end" dominantBaseline="middle" className="graph-label">
              {db > 0 ? `+${db}` : db}
            </text>
          </g>
        ))}

        {/* Frequency grid */}
        {FREQ_TICKS.map(f => (
          <g key={f}>
            <line x1={toX(f)} y1={g.T} x2={toX(f)} y2={g.T + g.IH} className="graph-vline graph-grid" />
            <text x={toX(f)} y={g.T + g.IH + 12 * g.k} textAnchor={f === F_MAX ? 'end' : 'middle'} dx={f === F_MAX ? 6 : 0} className="graph-label">
              {fmtFreq(f)}
            </text>
          </g>
        ))}

        {/* Candidate curves in gray, skipping the revealed one */}
        {curves.map(c => {
          if (answer && sameFilter(c, answer)) return null;
          return (
            <path key={`${c.type}-${c.frequency}-${c.gain}`} d={makeLine(computeCurve(c, sampleRate, range, g))}
              className="graph-curve-gray" />
          );
        })}

        {/* Selected, then hovered candidate: amber for boosts, blue for cuts and pass filters */}
        {selected && (() => {
          const pts = computeCurve(selected, sampleRate, range, g);
          const up = (selected.gain ?? 0) > 0;
          return (
            <g key={`sel-${selected.type}-${selected.frequency}-${selected.gain}`} className="graph-selected">
              <path d={makeFill(pts, range, g)} className={up ? 'graph-fill-boost' : 'graph-fill-cut'} />
              <path d={makeLine(pts)} className={up ? 'graph-hl-boost' : 'graph-hl-cut'} />
            </g>
          );
        })()}
        {hover && (() => {
          const up = (hover.gain ?? 0) > 0;
          return (
            <path
              key={`hover-${hover.type}-${hover.frequency}-${hover.gain}`}
              d={makeLine(computeCurve(hover, sampleRate, range, g))}
              className={`graph-hover ${up ? 'graph-hl-boost' : 'graph-hl-cut'}`}
            />
          );
        })()}

        {/* Correct curve — revealed after answer */}
        {answer && (() => {
          const pts = computeCurve(answer, sampleRate, range, g);
          return (
            <g className="graph-reveal">
              <path d={makeFill(pts, range, g)} className={isBoost ? 'graph-fill-boost' : 'graph-fill-cut'} />
              <path d={makeLine(pts)} pathLength="1" className={isBoost ? 'graph-curve-boost' : 'graph-curve-cut'} />
            </g>
          );
        })()}

        {marker && <SweepMarker marker={marker} answerFreq={answer?.frequency ?? null} g={g} />}

        {/* Idle: a glowing dot sweeps along 0 dB, like a scanning display */}
        {idle && (
          <g className="graph-scan" aria-hidden="true">
            <line x1={P.l - 36} y1={toY(0, range, g)} x2={P.l} y2={toY(0, range, g)} stroke="url(#graph-scan-trail)" />
            <circle cx={P.l} cy={toY(0, range, g)} r={2.2 * g.k} />
          </g>
        )}

        {/* Placeholder */}
        {curves.length === 0 && !answer && !marker && (
          // Sits just above the 0 dB line so no grid line runs through it
          <text x={P.l + IW / 2} y={toY(0, range, g) - 10 * g.k} textAnchor="middle" className="graph-placeholder">
            {onPick ? 'Click or drag where you hear the boost' : 'EQ curve appears here during a trial'}
          </text>
        )}

        <HeatStrip heat={heat} g={g} />

        {/* Border with crop marks at the corners */}
        <rect x={P.l} y={g.T} width={IW} height={g.IH} className="graph-border" />
        <path className="graph-corners" d={corners(g)} />

        {/* Readout */}
        <text x={P.l + 13 * g.k} y={g.T + 13 * g.k} className="graph-readout graph-readout-title">RESPONSE</text>
        {readout && (
          <text x={P.l + IW - 13 * g.k} y={g.T + 13 * g.k} textAnchor="end" className="graph-readout">{readout}</text>
        )}
      </svg>
    </div>
  );
}
