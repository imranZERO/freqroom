import { useRef, useState, useEffect } from 'react';
import { generatePinkNoise, generateWhiteNoise } from '../lib/noiseGen.js';
import { generateDrumLoop, generateBandLoop } from '../lib/musicGen.js';
import { probeAudioFile } from '../lib/audioInfo.js';
import { formatTime, formatSpec, PINK_LINE, WHITE_LINE, WAVE_BARS, DRUM_HITS, BAND_LINE, GLYPH_W, GLYPH_H } from '../lib/trackFormat.js';
import { ResetIcon } from './Icons.jsx';

// Built-in sources, generated in the browser when picked (no audio files).
// Each group is one card with a switch between its variants.
const GENERATED_GROUPS = [
  { id: 'noise', label: 'Noise', variants: [
    { id: 'pink',  label: 'Pink',  description: 'Equal energy per octave — ideal for EQ training', make: generatePinkNoise },
    { id: 'white', label: 'White', description: 'Flat spectrum, bright character', make: generateWhiteNoise },
  ] },
  { id: 'loop', label: 'Music Loop', variants: [
    { id: 'drums', label: 'Drums', description: 'Kick, snare, and hats — punchy transients', make: generateDrumLoop },
    { id: 'band',  label: 'Band',  description: 'Drums, bass, and chords across the spectrum', make: generateBandLoop },
  ] },
];
const VARIANTS = GENERATED_GROUPS.flatMap(g => g.variants);
const groupOf = id => GENERATED_GROUPS.find(g => g.variants.some(v => v.id === id));

function SourceGlyph({ kind }) {
  return (
    <svg className="track-glyph" viewBox={`0 0 ${GLYPH_W} ${GLYPH_H}`} width={GLYPH_W} height={GLYPH_H} aria-hidden="true">
      {kind === 'upload' ? (
        WAVE_BARS.map((h, i) => (
          <rect key={i} x={i * 4 + 1} y={(GLYPH_H - h) / 2} width={2} height={h} rx={1} />
        ))
      ) : kind === 'drums' ? (
        DRUM_HITS.map(({ x, h }, i) => (
          <rect key={i} x={x} y={GLYPH_H - 2 - h} width={2} height={h} rx={1} />
        ))
      ) : kind === 'band' ? (
        <>
          <polyline points={BAND_LINE} />
          {DRUM_HITS.map(({ x, h }, i) => (
            <rect key={i} x={x} y={GLYPH_H - 1 - h * 0.35} width={2} height={h * 0.35} rx={1} />
          ))}
        </>
      ) : (
        <polyline points={kind === 'pink' ? PINK_LINE : WHITE_LINE} />
      )}
    </svg>
  );
}

// Keeps the extension visible while the base name truncates with an ellipsis
function FileName({ name }) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return <span className="file-base">{name}</span>;
  return (
    <>
      <span className="file-base">{name.slice(0, dot)}</span>
      <span className="file-ext">{name.slice(dot)}</span>
    </>
  );
}

export function TrackSelector({ engine, gainDb, setGainDb, q, setQ, focus, setFocus, autoplay, setAutoplay, initialSource, onSourceChange, controlsChanged, onResetControls }) {
  const fileRef = useRef(null);
  const [activeId, setActiveId] = useState(null);
  // The variant each group's card loads when clicked: { noise: 'pink', loop: 'drums' }
  const [picked, setPicked] = useState(() => Object.fromEntries(
    GENERATED_GROUPS.map(g => [g.id, groupOf(initialSource)?.id === g.id ? initialSource : g.variants[0].id])
  ));
  const [uploading, setUploading] = useState(false);
  const [position, setPosition] = useState(0);
  const [fileInfo, setFileInfo] = useState(null);
  // Loop points for uploads: A may be set before B; the engine loops once both exist
  const [loopA, setLoopA] = useState(null);
  const isDraggingRef = useRef(false);
  const rafRef = useRef(null);
  const getOffsetRef = useRef(engine.getCurrentOffset);
  useEffect(() => { getOffsetRef.current = engine.getCurrentOffset; });

  const isUpload = activeId?.startsWith('upload:');

  // Track playback position for uploaded files
  useEffect(() => {
    if (!isUpload || !engine.duration) return;

    if (engine.isPlaying) {
      function tick() {
        if (!isDraggingRef.current) {
          setPosition(getOffsetRef.current());
        }
        rafRef.current = requestAnimationFrame(tick);
      }
      rafRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafRef.current);
    } else {
      // Capture stopped position
      setPosition(getOffsetRef.current());
    }
  }, [engine.isPlaying, isUpload, engine.duration]);

  // A challenge link can name a source to load straight away
  useEffect(() => {
    if (initialSource) loadGenerated(initialSource);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadGenerated(id) {
    const group = groupOf(id);
    if (!group) return;
    setPicked(p => ({ ...p, [group.id]: id }));
    setActiveId(id);
    onSourceChange?.(id);
    setPosition(0);
    setLoopA(null);
    const track = VARIANTS.find(v => v.id === id);
    await engine.loadBuffer(track.make(engine.getCtx()));
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setActiveId(`upload:${file.name}`);
    onSourceChange?.('upload');
    setPosition(0);
    setLoopA(null);
    setFileInfo(null);
    const [info] = await Promise.all([
      probeAudioFile(file).catch(() => null),
      engine.loadBuffer(file),
    ]);
    setFileInfo(info && { ...info, size: file.size });
    setUploading(false);
    e.target.value = '';
  }

  function markA() {
    const b = engine.loop?.end;
    setLoopA(position);
    // Keep an existing B if it's still after the new A
    engine.setLoop(b !== undefined && b > position ? position : null, b);
  }

  function markB() {
    const a = loopA ?? engine.loop?.start ?? 0;
    if (position > a) engine.setLoop(a, position);
  }

  function clearLoop() {
    setLoopA(null);
    engine.setLoop(null);
  }

  // Pointer capture routes the release back to the slider even if it happens
  // outside it, so a drag can't be left "in progress" (which would stop
  // keyboard seeking below from reaching the audio).
  function handleSeekStart(e) {
    isDraggingRef.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
  }

  function handleSeekChange(e) {
    const offset = parseFloat(e.target.value);
    setPosition(offset);
    // Mouse/touch drags seek once on release (handleSeekEnd); keyboard and
    // assistive-tech input only produce onChange, so seek straight away.
    if (!isDraggingRef.current) engine.seek(offset);
  }

  function handleSeekEnd(e) {
    if (!isDraggingRef.current) return;
    const offset = parseFloat(e.currentTarget.value);
    isDraggingRef.current = false;
    setPosition(offset);
    engine.seek(offset);
  }

  return (
    <>
      <div className="panel-group">
        <h2 className="panel-label">Source</h2>
        <section className="card source-card">
          <div className="track-grid">
            {GENERATED_GROUPS.map(g => {
              const sel = g.variants.find(v => v.id === picked[g.id]);
              const isActive = activeId === sel.id;
              return (
                <div
                  key={g.id}
                  className={`track-btn track-group ${isActive ? 'active' : ''} ${isActive && engine.isPlaying ? 'live' : ''}`}
                  role="group"
                  aria-label={g.label}
                >
                  <button
                    className="track-main"
                    onClick={() => loadGenerated(sel.id)}
                    disabled={engine.isLoading}
                    aria-pressed={isActive}
                  >
                    <SourceGlyph kind={sel.id} />
                    <span className="track-name">{g.label}</span>
                    <span className="track-desc">{sel.description}</span>
                  </button>
                  <div className="track-variants">
                    {g.variants.map(v => (
                      <button
                        key={v.id}
                        className={`track-variant ${v.id === sel.id ? 'is-active' : ''}`}
                        onClick={() => loadGenerated(v.id)}
                        disabled={engine.isLoading}
                        aria-pressed={activeId === v.id}
                        aria-label={`${v.label} ${g.id === 'noise' ? 'noise' : 'loop'}`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <button
              className={`track-btn upload-btn ${isUpload ? 'active' : ''} ${isUpload && engine.isPlaying ? 'live' : ''}`}
              onClick={() => fileRef.current?.click()}
              disabled={engine.isLoading || uploading}
              data-tooltip={isUpload ? activeId.slice(7) : undefined}
              aria-pressed={isUpload}
            >
              <SourceGlyph kind="upload" />
              <span className="track-name">
                {uploading ? 'Loading…' : isUpload ? <FileName name={activeId.slice(7)} /> : 'Upload File'}
              </span>
              {isUpload && fileInfo && engine.isLoaded ? (
                <span className="track-desc track-spec">
                  {formatSpec(fileInfo, engine.duration).map((line, i) => line && <span key={i}>{line}</span>)}
                </span>
              ) : (
                <span className="track-desc">MP3, WAV, FLAC, OGG</span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
          </div>
          {engine.loadError && <p className="error">{engine.loadError}</p>}
        </section>
      </div>

      <div className="panel-group">
        <div className="panel-label-row">
          <h2 className="panel-label">Controls</h2>
          {controlsChanged && (
            <button
              className="icon-btn panel-reset"
              onClick={onResetControls}
              aria-label="Reset volume, gain, and Q to defaults"
              data-tooltip="Reset to defaults"
            >
              <ResetIcon />
            </button>
          )}
        </div>
        <section className="card controls-card">
          <div className="audio-controls">
            <div className="control-row">
              <label htmlFor="ctrl-volume" className="control-label">Volume</label>
              <input
                id="ctrl-volume"
                type="range"
                className="control-slider"
                min="0" max="1" step="0.01"
                value={engine.volume}
                style={{ '--fill': `${engine.volume * 100}%` }}
                onChange={e => engine.setVolume(parseFloat(e.target.value))}
              />
              <span className="control-value">{Math.round(engine.volume * 100)}%</span>
            </div>

            <div className="control-row-pair">
              <div className="control-row">
                <label htmlFor="ctrl-gain" className="control-label">Gain</label>
                <input
                  id="ctrl-gain"
                  type="range"
                  className="control-slider"
                  min="1" max="18" step="1"
                  value={gainDb}
                  style={{ '--fill': `${((gainDb - 1) / 17) * 100}%` }}
                  onChange={e => setGainDb(parseInt(e.target.value, 10))}
                />
                <span className="control-value">±{gainDb} dB</span>
              </div>
              <div className="control-row">
                <label htmlFor="ctrl-q" className="control-label">Q (Bandwidth)</label>
                <input
                  id="ctrl-q"
                  type="range"
                  className="control-slider"
                  min="0.5" max="8" step="0.1"
                  value={q}
                  style={{ '--fill': `${((q - 0.5) / 7.5) * 100}%` }}
                  onChange={e => setQ(parseFloat(e.target.value))}
                />
                <span className="control-value">{q.toFixed(1)}</span>
              </div>
            </div>

            {isUpload && engine.duration > 0 && (
              <div className="control-row">
                <label htmlFor="ctrl-position" className="control-label">Position</label>
                <input
                  id="ctrl-position"
                  type="range"
                  className="control-slider"
                  min="0"
                  max={engine.duration}
                  step="0.1"
                  value={position}
                  style={{ '--fill': `${(position / engine.duration) * 100}%` }}
                  onPointerDown={handleSeekStart}
                  onChange={handleSeekChange}
                  onPointerUp={handleSeekEnd}
                  onPointerCancel={handleSeekEnd}
                  onLostPointerCapture={handleSeekEnd}
                />
                <span className="control-value control-value-time">
                  {formatTime(position)}<span className="control-duration">/{formatTime(engine.duration)}</span>
                </span>
                {(engine.loop || loopA !== null) && (
                  <span
                    className="loop-band"
                    aria-hidden="true"
                    style={{
                      '--a': (engine.loop?.start ?? loopA) / engine.duration,
                      '--b': (engine.loop?.end ?? loopA) / engine.duration,
                    }}
                  />
                )}
              </div>
            )}

            {isUpload && engine.duration > 0 && (
              <div className="loop-row">
                <button className="btn-ghost" onClick={markA} data-tooltip="Loop start at the current position">Set A</button>
                <button className="btn-ghost" onClick={markB} data-tooltip="Loop end at the current position">Set B</button>
                <span className="loop-readout">
                  {engine.loop
                    ? `Loop ${formatTime(engine.loop.start)}–${formatTime(engine.loop.end)}`
                    : loopA !== null ? `A ${formatTime(loopA)} · set B` : 'Loop: whole track'}
                </span>
                {(engine.loop || loopA !== null) && (
                  <button className="btn-ghost" onClick={clearLoop}>Clear</button>
                )}
              </div>
            )}
          </div>

          <div className="practice-row">
            <label className="switch" data-tooltip="Start playing the EQ as soon as each trial begins">
              <input type="checkbox" checked={autoplay} onChange={e => setAutoplay(e.target.checked)} />
              <span className="switch-track" aria-hidden="true" />
              <span className="switch-label">Auto-play EQ</span>
            </label>
            <label className="switch" data-tooltip="Hide the EQ in octaves you miss more often">
              <input type="checkbox" checked={focus} onChange={e => setFocus(e.target.checked)} />
              <span className="switch-track" aria-hidden="true" />
              <span className="switch-label">Focus weak bands</span>
            </label>
          </div>
        </section>
      </div>
    </>
  );
}
