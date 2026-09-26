import { useState, useEffect, useRef } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { REGIONS, freqToNote, freqRegion } from '../lib/trainer.js';

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
// Vertical layout for the wide (desktop) or compact (phone) graph
export const graphLayout = compact => layout(compact ? COMPACT : WIDE);
const COMPACT_QUERY = '(max-width: 600px)';

const FREQ_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

const toX = f => P.l + (Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN)) * IW;
const fromX = x => F_MIN * Math.pow(F_MAX / F_MIN, (Math.max(P.l, Math.min(P.l + IW, x)) - P.l) / IW);
export const toY = (db, range, g) => g.T + ((range - db) / (2 * range)) * g.IH;
// Inverse of toY, clamped to the plot: a y position (viewBox units) to dB
export const fromY = (y, range, g) => {
  const t = Math.max(0, Math.min(1, (y - g.T) / g.IH));
  return range - t * 2 * range;
};
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
      {/* one line below the RESPONSE / readout row so the two never collide */}
      <text x={mx} y={g.T + 27 * g.k} textAnchor={anchorAt(mx)} dx={anchorAt(mx) === 'start' ? 4 : anchorAt(mx) === 'end' ? -4 : 0} className="marker-label">{fmtHz(marker)}</text>
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
const heatY = g => g.T + g.IH + 20 * g.k;
const heatH = g => 7 * g.k;
const heatSpan = center => [toX(Math.max(F_MIN, center / Math.SQRT2)), toX(Math.min(F_MAX, center * Math.SQRT2))];
const HEAT_LABEL_TIP = 'Your accuracy per octave in this mode: red under 50%, amber under 80%, green above';
const heatTip = ({ center, n, hits, acc }) => `${hzLabel(center)} octave · ${acc === null
  ? `not rated yet (${n} of 3 answers)`
  : `${hits}/${n} correct (${Math.round(acc * 100)}%)`}`;

function HeatStrip({ heat, g }) {
  const y = heatY(g), h = heatH(g);
  return (
    <g className="graph-heat">
      <text x={P.l - 4} y={y + h / 2} textAnchor="end" dominantBaseline="middle" className="graph-label graph-heat-label">acc</text>
      {heat.map(({ center, acc }) => {
        const [x0, x1] = heatSpan(center);
        return <rect key={center} x={x0 + 0.5} y={y} width={Math.max(0, x1 - x0 - 1)} height={h} rx={1.5} className={heatClass(acc)} />;
      })}
    </g>
  );
}

// SVG elements can't show the app's CSS tooltips, so invisible HTML hit areas sit
// over the strip (positioned in % of the viewBox, so they scale with the graph)
function HeatHits({ heat, g }) {
  const y = heatY(g), h = heatH(g), pad = 3 * g.k;
  const box = (x0, x1) => ({
    left: `${(x0 / VW) * 100}%`, width: `${((x1 - x0) / VW) * 100}%`,
    top: `${((y - pad) / g.VH) * 100}%`, height: `${((h + 2 * pad) / g.VH) * 100}%`,
  });
  return (
    <div className="graph-heat-hits">
      <span className="graph-heat-hit graph-heat-hit-label tt-start" style={box(4, P.l - 2)} data-tooltip={HEAT_LABEL_TIP} aria-label={HEAT_LABEL_TIP} role="img" />
      {heat.map((cell, i) => {
        const [x0, x1] = heatSpan(cell.center);
        const edge = i < 2 ? ' tt-start' : i >= heat.length - 2 ? ' tt-end' : '';
        return (
          <span
            key={cell.center}
            className={`graph-heat-hit${edge}`}
            style={box(x0 + 0.5, x1 - 0.5)}
            data-tooltip={heatTip(cell)}
            aria-label={heatTip(cell)}
            role="img"
          />
        );
      })}
    </div>
  );
}

// ── Live spectrum ─────────────────────────────────────────────────────────
// What's playing, drawn softly behind the curves. Each point averages the
// analyser's power over a third of an octave (or its share of the log axis, if
// wider; the usual analyser smoothing, so noise doesn't look ragged), with every bin tilted
// +3 dB/octave around 1 kHz (power × f / 1 kHz) so pink noise reads flat and an
// EQ change shows as a bump.
const SPEC_N = 160;
const SPEC_FREQS = Array.from({ length: SPEC_N }, (_, i) => F_MIN * Math.pow(F_MAX / F_MIN, i / (SPEC_N - 1)));
export function spectrumDb(bins, sampleRate, freqs = SPEC_FREQS) {
  const binHz = sampleRate / 2 / bins.length;
  // half the averaging window, as a frequency ratio
  const half = Math.max(Math.pow(2, 1 / 6), Math.pow(F_MAX / F_MIN, 0.5 / (freqs.length - 1)));
  return freqs.map(f => {
    const lo = Math.max(1, Math.floor(f / half / binHz));
    const hi = Math.min(bins.length - 1, Math.max(lo, Math.ceil(f * half / binHz)));
    let power = 0;
    for (let b = lo; b <= hi; b++) power += Math.pow(10, bins[b] / 10) * (b * binHz / 1000);
    return 10 * Math.log10(power / (hi - lo + 1) || 1e-12);
  });
}
// The display is centred on the average level between these. The centre eases
// slowly (so a boost doesn't lift the whole trace), but jumps when it's far off,
// e.g. when playback restarts after silence; near-silent frames don't move it.
// Each point also eases so it moves smoothly. Easing is by time constant, so it
// behaves the same at any frame rate.
const SPEC_CENTRE = [100, 10000];
const SPEC_CENTRE_TAU = 0.33;   // seconds
const SPEC_POINT_TAU = 0.06;    // seconds
const SPEC_SNAP_DB = 12;
const SPEC_SILENT_DB = -100;
const easeFor = (dt, tau) => 1 - Math.exp(-dt / tau);
// The spectrum is drawn at about 0.75× the curves' scale in the middle and
// soft-limited (tanh) towards the edges, so real material, which varies far
// more than the EQ, rounds off inside the plot instead of flat-topping at ±range
// (±12 dB in most modes), while an EQ bump still reads clearly.
const SPEC_SCALE = 0.75;
export const spectrumToAxis = (db, range) => range * Math.tanh((SPEC_SCALE * db) / range);

// Draws straight to the DOM each frame (no React re-render); fades out when idle
function SpectrumLayer({ getAnalyser, live, range, g }) {
  const lineRef = useRef(null);
  const fillRef = useRef(null);
  useEffect(() => {
    if (!live || !getAnalyser) return;
    let raf = 0, centre = null, bins = null, shown = null, last = null;
    const bottom = (g.T + g.IH).toFixed(1);
    const tick = now => {
      const dt = last === null ? 1 / 60 : Math.min(0.25, (now - last) / 1000);
      last = now;
      const an = getAnalyser();
      if (an && lineRef.current) {
        if (!bins || bins.length !== an.frequencyBinCount) bins = new Float32Array(an.frequencyBinCount);
        an.getFloatFrequencyData(bins);
        // Ease in power, not dB: averaging a noisy signal's dB values reads low,
        // most visibly in the lowest octaves where each point spans few bins
        const rawDb = spectrumDb(bins, an.context?.sampleRate ?? 48000);
        const raw = rawDb.map(db => Math.pow(10, db / 10));
        const pointEase = easeFor(dt, SPEC_POINT_TAU);
        shown = shown ? shown.map((v, i) => v + (raw[i] - v) * pointEase) : raw;
        const dbs = shown.map(p => 10 * Math.log10(p || 1e-12));
        // The centre follows this frame's raw level, so it's right at once;
        // only the drawn points ease (after silence they rise into place)
        let sum = 0, n = 0;
        rawDb.forEach((db, i) => {
          if (SPEC_FREQS[i] >= SPEC_CENTRE[0] && SPEC_FREQS[i] <= SPEC_CENTRE[1]) { sum += db; n++; }
        });
        const mean = sum / n;
        if (Number.isFinite(mean) && mean > SPEC_SILENT_DB) {
          centre = centre === null || Math.abs(mean - centre) > SPEC_SNAP_DB
            ? mean
            : centre + (mean - centre) * easeFor(dt, SPEC_CENTRE_TAU);
        }
        if (centre !== null) {
          const line = dbs.map((db, i) => {
            const y = toY(spectrumToAxis(db - centre, range), range, g);
            return `${i ? 'L' : 'M'}${toX(SPEC_FREQS[i]).toFixed(1)},${y.toFixed(1)}`;
          }).join('');
          lineRef.current.setAttribute('d', line);
          fillRef.current.setAttribute('d', `${line}L${(P.l + IW).toFixed(1)},${bottom}L${P.l},${bottom}Z`);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, getAnalyser, range, g.VH]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!getAnalyser) return null;
  return (
    <g className={`graph-spectrum${live ? ' is-live' : ''}`} aria-hidden="true">
      <path ref={fillRef} className="graph-spectrum-fill" />
      <path ref={lineRef} className="graph-spectrum-line" />
    </g>
  );
}

// ── Cursor readout ────────────────────────────────────────────────────────
// A hairline under the mouse and, in place of the RESPONSE title, the frequency,
// nearest note, and region there (plus dB where the plot sets gain). Its own
// state, so moving the mouse re-renders only this layer, not every curve.
function CursorLayer({ bindRef, withDb, range, g }) {
  const [pos, setPos] = useState(null);
  bindRef.current = setPos;
  const titleXY = { x: P.l + 13 * g.k, y: g.T + 13 * g.k };
  if (!pos) return <text {...titleXY} className="graph-readout graph-readout-title">RESPONSE</text>;
  const f = fromX(pos.x);
  const db = fromY(pos.y, range, g);
  const dbText = `${db >= 0.05 ? '+' : db <= -0.05 ? '−' : ''}${Math.abs(db).toFixed(1)} dB`;
  const label = `${fmtHz(f)} · ${freqToNote(f).replace('~', '')} · ${freqRegion(f)}${withDb ? ` · ${dbText}` : ''}`;
  return (
    <g className="graph-cursor" aria-hidden="true">
      <line x1={pos.x} y1={g.T} x2={pos.x} y2={g.T + g.IH} className="graph-cursor-line" />
      <text {...titleXY} className="graph-readout graph-cursor-text">{label}</text>
    </g>
  );
}

const sameFilter = (a, b) => a.type === b.type && a.frequency === b.frequency && a.gain === b.gain;

// curves: candidate filters drawn in gray; answer: the revealed filter (or null).
// gainDb sets the dB range so the axis follows the Gain slider.
// Sweep mode passes marker (the current guess) and onPick, which makes the plot an input
// hover: faint preview of the hovered band's curve; selected: the chosen band's
// curve, drawn prominently until the answer is revealed
// readout: short status line drawn in the top-right of the plot (filter, gain, Q)
// idle: nothing loaded yet, so the display runs its scanning animation
// onPoint: like onPick but reports { freq, db } (Explore mode drags a curve)
// getAnalyser/live: the engine's analyser and whether audio is playing, for the
// live spectrum (omit getAnalyser to turn it off)
export function FreqGraph({ curves = [], answer = null, hover = null, selected = null, selectedTone = null, gainDb = 6, sampleRate = 48000, heat = [], marker = null, onPick = null, onPoint = null, pickText = 'Click or drag where you hear the boost', readout = '', idle = false, getAnalyser = null, live = false }) {
  const g = graphLayout(useMediaQuery(COMPACT_QUERY));
  const isBoost = answer ? (answer.gain ?? 0) > 0 : false;
  // ±12 dB by default; widens in 6 dB steps so high gains aren't clipped
  const range = Math.max(12, Math.ceil(Math.abs(gainDb) / 6) * 6);
  const dbTicks = Array.from({ length: range / 3 + 1 }, (_, i) => i * 6 - range);

  function pickAt(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const freq = fromX(((e.clientX - rect.left) / rect.width) * VW);
    if (onPoint) onPoint({ freq, db: fromY(((e.clientY - rect.top) / rect.height) * g.VH, range, g) });
    else onPick(freq);
  }
  // Cursor readout: mouse only (a touch has no hover), and only over the plot
  const cursorRef = useRef(null);
  function trackCursor(e) {
    if (e.pointerType !== 'mouse' || !cursorRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * VW;
    const y = ((e.clientY - rect.top) / rect.height) * g.VH;
    const inside = x >= P.l && x <= P.l + IW && y >= g.T && y <= g.T + g.IH;
    cursorRef.current(inside ? { x, y } : null);
  }
  const interactive = onPick || onPoint;
  const pointerProps = {
    onPointerMove: e => {
      trackCursor(e);
      if (interactive && e.buttons) pickAt(e);
    },
    onPointerLeave: () => cursorRef.current?.(null),
    ...(interactive ? {
      onPointerDown: e => {
        e.preventDefault(); // don't start a text selection while dragging
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
        pickAt(e);
      },
    } : {}),
  };
  // Region names sit along the bottom of the plot, except while a Sweep or
  // Match EQ error bracket is drawn there, and on phones, where the scaled-up
  // text won't fit the narrow upper regions (the shading stays)
  const regionLabels = !(marker && answer) && g.k === 1;

  return (
    <div className="freq-graph-wrap">
      <svg
        viewBox={`0 0 ${VW} ${g.VH}`} width="100%"
        className={`freq-graph-svg${interactive ? ' graph-interactive' : ''}`}
        style={{ '--gk': g.k }}
        {...pointerProps}
      >
        <defs>
          <linearGradient id="graph-scan-trail" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--a)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--a)" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* EQ regions: alternate ones shaded */}
        {REGIONS.map((r, i) => {
          if (i % 2 === 0) return null;
          const x0 = toX(REGIONS[i - 1].to), x1 = toX(Math.min(r.to, F_MAX));
          return <rect key={r.name} x={x0} y={g.T} width={x1 - x0} height={g.IH} className="graph-region-shade" />;
        })}

        <SpectrumLayer getAnalyser={getAnalyser} live={live} range={range} g={g} />

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

        {regionLabels && REGIONS.map((r, i) => {
          const x0 = toX(i ? REGIONS[i - 1].to : F_MIN), x1 = toX(Math.min(r.to, F_MAX));
          return (
            <text key={r.name} x={(x0 + x1) / 2} y={g.T + g.IH - 5 * g.k} textAnchor="middle" className="graph-region-label">
              {r.name}
            </text>
          );
        })}

        {/* Candidate curves in gray, skipping the revealed one */}
        {curves.map(c => {
          if (answer && sameFilter(c, answer)) return null;
          return (
            <path key={`${c.type}-${c.frequency}-${c.gain}`} d={makeLine(computeCurve(c, sampleRate, range, g))}
              className="graph-curve-gray" />
          );
        })}

        {/* Selected, then hovered candidate: amber for boosts, blue for cuts and pass
            filters; Match EQ's own curve (selectedTone "mine") is always dashed blue */}
        {selected && (() => {
          const pts = computeCurve(selected, sampleRate, range, g);
          const tone = selectedTone ?? ((selected.gain ?? 0) > 0 ? 'boost' : 'cut');
          return (
            <g key={`sel-${selected.type}-${selected.frequency}-${selected.gain}`} className="graph-selected">
              <path d={makeFill(pts, range, g)} className={`graph-fill-${tone}`} />
              <path d={makeLine(pts)} className={`graph-hl-${tone}`} />
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
            // Rises out of the 0 dB line (the transform origin)
            <g className="graph-reveal" style={{ '--y0': `${toY(0, range, g)}px` }}>
              <path d={makeFill(pts, range, g)} className={isBoost ? 'graph-fill-boost' : 'graph-fill-cut'} />
              <path d={makeLine(pts)} className={isBoost ? 'graph-curve-boost' : 'graph-curve-cut'} />
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
            {onPick ? pickText : 'EQ curve appears here during a trial'}
          </text>
        )}

        <HeatStrip heat={heat} g={g} />

        {/* Border */}
        <rect x={P.l} y={g.T} width={IW} height={g.IH} className="graph-border" />

        {/* Readout: the cursor layer shows RESPONSE, or the cursor's position */}
        <CursorLayer bindRef={cursorRef} withDb={!!onPoint} range={range} g={g} />
        {readout && (
          <text x={P.l + IW - 13 * g.k} y={g.T + 13 * g.k} textAnchor="end" className="graph-readout">{readout}</text>
        )}
      </svg>
      {heat.length > 0 && <HeatHits heat={heat} g={g} />}
    </div>
  );
}
