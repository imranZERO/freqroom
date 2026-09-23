const F_MIN = 20, F_MAX = 20000;
const N = 300;
const P = { t: 14, r: 14, b: 28, l: 32 };
const VW = 600, VH = 160;
const IW = VW - P.l - P.r;
const IH = VH - P.t - P.b;

const FREQ_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

const toX = f => P.l + (Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN)) * IW;
const toY = (db, range) => P.t + ((range - db) / (2 * range)) * IH;
const fmtFreq = f => f >= 1000 ? `${f / 1000}k` : `${f}`;

function computeCurve(centerFreq, gainDb, Q, sr, range) {
  const A = Math.pow(10, gainDb / 40);
  const w0 = 2 * Math.PI * centerFreq / sr;
  const alpha = Math.sin(w0) / (2 * Q);
  const b0 = 1 + alpha * A, b1 = -2 * Math.cos(w0), b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A, a1 = -2 * Math.cos(w0), a2 = 1 - alpha / A;
  const b0n = b0/a0, b1n = b1/a0, b2n = b2/a0, a1n = a1/a0, a2n = a2/a0;

  return Array.from({ length: N + 1 }, (_, i) => {
    const f = F_MIN * Math.pow(F_MAX / F_MIN, i / N);
    const w = 2 * Math.PI * f / sr;
    const cw = Math.cos(w), sw = Math.sin(w);
    const c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = b0n + b1n * cw + b2n * c2;
    const ni = -(b1n * sw + b2n * s2);
    const dr = 1 + a1n * cw + a2n * c2;
    const di = -(a1n * sw + a2n * s2);
    const db = 20 * Math.log10(Math.sqrt((nr*nr + ni*ni) / (dr*dr + di*di)));
    return { x: toX(f), y: toY(Math.max(-range, Math.min(range, db)), range) };
  });
}

function makeLine(pts) {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
}

function makeFill(pts, range) {
  const y0 = toY(0, range);
  const x0 = pts[0].x.toFixed(1), xN = pts[pts.length - 1].x.toFixed(1);
  return `${makeLine(pts)}L${xN},${y0.toFixed(1)}L${x0},${y0.toFixed(1)}Z`;
}

export function FreqGraph({ bands = [], gains = [], gainDb = 6, centerFreq = null, Q = 1.4, sampleRate = 48000 }) {
  const revealed = centerFreq !== null;
  const isBoost = gainDb > 0;
  // ±12 dB by default; widens in 6 dB steps so high gains aren't clipped
  const range = Math.max(12, Math.ceil(Math.abs(gainDb) / 6) * 6);
  const dbTicks = Array.from({ length: range / 3 + 1 }, (_, i) => i * 6 - range);

  return (
    <div className="freq-graph-wrap">
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" className="freq-graph-svg">

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

        {/* All candidate curves in gray — every band × every gain, skip the revealed one */}
        {bands.flatMap(f =>
          gains.map(g => {
            if (revealed && f === centerFreq && g === gainDb) return null;
            const pts = computeCurve(f, g, Q, sampleRate, range);
            return <path key={`${f}-${g}`} d={makeLine(pts)} className="graph-curve-gray" />;
          })
        )}

        {/* Correct curve — revealed after answer */}
        {revealed && (() => {
          const pts = computeCurve(centerFreq, gainDb, Q, sampleRate, range);
          return (
            <g className="graph-reveal">
              <path d={makeFill(pts, range)} className={isBoost ? 'graph-fill-boost' : 'graph-fill-cut'} />
              <path d={makeLine(pts)} pathLength="1" className={isBoost ? 'graph-curve-boost' : 'graph-curve-cut'} />
            </g>
          );
        })()}

        {/* Placeholder */}
        {bands.length === 0 && (
          <text x={P.l + IW / 2} y={P.t + IH / 2} textAnchor="middle" dominantBaseline="middle" className="graph-placeholder">
            EQ curve appears here during a trial
          </text>
        )}

        {/* Border */}
        <rect x={P.l} y={P.t} width={IW} height={IH} className="graph-border" />
      </svg>
    </div>
  );
}
