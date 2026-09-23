const F_MIN = 20, F_MAX = 20000;
const N = 300;
const P = { t: 14, r: 14, b: 28, l: 32 };
const VW = 600, VH = 186;
const IW = VW - P.l - P.r;
const IH = VH - P.t - P.b;

const FREQ_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

const toX = f => P.l + (Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN)) * IW;
const fromX = x => F_MIN * Math.pow(F_MAX / F_MIN, (Math.max(P.l, Math.min(P.l + IW, x)) - P.l) / IW);
const toY = (db, range) => P.t + ((range - db) / (2 * range)) * IH;
const fmtFreq = f => f >= 1000 ? `${f / 1000}k` : `${f}`;

// Readout format for arbitrary frequencies, e.g. "87 Hz", "1.24 kHz", "12.5 kHz"
export const fmtHz = f => f >= 10000 ? `${(f / 1000).toFixed(1)} kHz`
  : f >= 1000 ? `${(f / 1000).toFixed(2)} kHz` : `${Math.round(f)} Hz`;

// Text anchor that keeps a label inside the plot near its edges
const anchorAt = x => x < P.l + 40 ? 'start' : x > P.l + IW - 40 ? 'end' : 'middle';

// Sweep mode: the listener's guess, and after answering, a bracket to the answer
function SweepMarker({ marker, answerFreq }) {
  const mx = toX(marker);
  const ax = answerFreq ? toX(answerFreq) : null;
  const errOct = answerFreq ? Math.abs(Math.log2(marker / answerFreq)) : null;
  const by = P.t + IH - 10;
  return (
    <g className="graph-marker">
      <line x1={mx} y1={P.t} x2={mx} y2={P.t + IH} className="marker-line" />
      <text x={mx} y={P.t + 10} textAnchor={anchorAt(mx)} className="marker-label">{fmtHz(marker)}</text>
      {ax !== null && (
        <g className="marker-error">
          <line x1={mx} y1={by} x2={ax} y2={by} />
          <line x1={ax} y1={by - 4} x2={ax} y2={by + 4} />
          <text x={(mx + ax) / 2} y={by - 5} textAnchor="middle" className="marker-label">
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

function computeCurve(filter, sr, range) {
  const coeffs = biquadCoeffs(filter, sr);
  return Array.from({ length: N + 1 }, (_, i) => {
    const f = F_MIN * Math.pow(F_MAX / F_MIN, i / N);
    const db = magnitudeDb(coeffs, f, sr);
    return { x: toX(f), y: toY(Math.max(-range, Math.min(range, db)), range) };
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

function makeFill(pts, range) {
  const y0 = toY(0, range);
  const x0 = pts[0].x.toFixed(1), xN = pts[pts.length - 1].x.toFixed(1);
  return `${makeLine(pts)}L${xN},${y0.toFixed(1)}L${x0},${y0.toFixed(1)}Z`;
}

const heatClass = acc => acc === null ? 'heat-none' : acc < 0.5 ? 'heat-low' : acc < 0.8 ? 'heat-mid' : 'heat-high';

// Weak-spot strip: one segment per octave bucket, just under the plot area
function HeatStrip({ heat }) {
  if (!heat.some(b => b.n > 0)) return null;
  const y = P.t + IH + 2;
  return (
    <g className="graph-heat">
      {heat.map(({ center, n, hits, acc }) => {
        const x0 = toX(Math.max(F_MIN, center / Math.SQRT2));
        const x1 = toX(Math.min(F_MAX, center * Math.SQRT2));
        return (
          <rect key={center} x={x0 + 0.5} y={y} width={Math.max(0, x1 - x0 - 1)} height={3} rx={1} className={heatClass(acc)}>
            <title>{`${center >= 1000 ? `${center / 1000} kHz` : `${center} Hz`} octave: ${n ? `${hits}/${n} correct (${Math.round((hits / n) * 100)}%)` : 'no answers yet'}${acc === null && n ? ' — needs 3+ to rate' : ''}`}</title>
          </rect>
        );
      })}
    </g>
  );
}

const sameFilter = (a, b) => a.type === b.type && a.frequency === b.frequency && a.gain === b.gain;

// curves: candidate filters drawn in gray; answer: the revealed filter (or null).
// gainDb sets the dB range so the axis follows the Gain slider.
// Sweep mode passes marker (the current guess) and onPick, which makes the plot an input
// highlight: candidate filters to emphasise (the band button being hovered)
export function FreqGraph({ curves = [], answer = null, highlight = [], gainDb = 6, sampleRate = 48000, heat = [], marker = null, onPick = null }) {
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
        viewBox={`0 0 ${VW} ${VH}`} width="100%"
        className={`freq-graph-svg${onPick ? ' graph-interactive' : ''}`}
        {...pointerProps}
      >

        {/* dB grid */}
        {dbTicks.map(db => (
          <g key={db}>
            <line x1={P.l} y1={toY(db, range)} x2={P.l + IW} y2={toY(db, range)}
              className={`graph-hline ${db === 0 ? 'graph-zero' : 'graph-grid'}`} />
            <text x={P.l - 5} y={toY(db, range)} textAnchor="end" dominantBaseline="middle" className="graph-label">
              {db > 0 ? `+${db}` : db}
            </text>
          </g>
        ))}

        {/* Frequency grid */}
        {FREQ_TICKS.map(f => (
          <g key={f}>
            <line x1={toX(f)} y1={P.t} x2={toX(f)} y2={P.t + IH} className="graph-vline graph-grid" />
            <text x={toX(f)} y={P.t + IH + 12} textAnchor="middle" className="graph-label">
              {fmtFreq(f)}
            </text>
          </g>
        ))}

        {/* Candidate curves in gray, skipping the revealed one */}
        {curves.map(c => {
          if (answer && sameFilter(c, answer)) return null;
          return (
            <path key={`${c.type}-${c.frequency}-${c.gain}`} d={makeLine(computeCurve(c, sampleRate, range))}
              className="graph-curve-gray" />
          );
        })}

        {/* Hovered candidate(s): amber for boosts, blue for cuts and pass filters */}
        {highlight.map(h => {
          const pts = computeCurve(h, sampleRate, range);
          const up = (h.gain ?? 0) > 0;
          return (
            <g key={`hl-${h.type}-${h.frequency}-${h.gain}`} className="graph-highlight">
              <path d={makeFill(pts, range)} className={up ? 'graph-fill-boost' : 'graph-fill-cut'} />
              <path d={makeLine(pts)} className={up ? 'graph-hl-boost' : 'graph-hl-cut'} />
            </g>
          );
        })}

        {/* Correct curve — revealed after answer */}
        {answer && (() => {
          const pts = computeCurve(answer, sampleRate, range);
          return (
            <g className="graph-reveal">
              <path d={makeFill(pts, range)} className={isBoost ? 'graph-fill-boost' : 'graph-fill-cut'} />
              <path d={makeLine(pts)} pathLength="1" className={isBoost ? 'graph-curve-boost' : 'graph-curve-cut'} />
            </g>
          );
        })()}

        {marker && <SweepMarker marker={marker} answerFreq={answer?.frequency ?? null} />}

        {/* Placeholder */}
        {curves.length === 0 && !answer && !marker && (
          <text x={P.l + IW / 2} y={P.t + IH / 2} textAnchor="middle" dominantBaseline="middle" className="graph-placeholder">
            {onPick ? 'Click or drag where you hear the boost' : 'EQ curve appears here during a trial'}
          </text>
        )}

        <HeatStrip heat={heat} />

        {/* Border */}
        <rect x={P.l} y={P.t} width={IW} height={IH} className="graph-border" />
      </svg>
    </div>
  );
}
