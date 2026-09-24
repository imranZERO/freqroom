import { useRef, useState, useEffect } from 'react';
import { generatePinkNoise, generateWhiteNoise } from '../lib/noiseGen.js';
import { probeAudioFile } from '../lib/audioInfo.js';
import { formatTime, formatSpec, PINK_LINE, WHITE_LINE, WAVE_BARS, GLYPH_W, GLYPH_H } from '../lib/trackFormat.js';
import { ResetIcon } from './Icons.jsx';

const GENERATED_TRACKS = [
  { id: 'pink', label: 'Pink Noise', description: 'Equal energy per octave — ideal for EQ training' },
  { id: 'white', label: 'White Noise', description: 'Flat spectrum, bright character' },
];

function SourceGlyph({ kind }) {
  return (
    <svg className="track-glyph" viewBox={`0 0 ${GLYPH_W} ${GLYPH_H}`} width={GLYPH_W} height={GLYPH_H} aria-hidden="true">
      {kind === 'upload' ? (
        WAVE_BARS.map((h, i) => (
          <rect key={i} x={i * 4 + 1} y={(GLYPH_H - h) / 2} width={2} height={h} rx={1} />
        ))
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
    setActiveId(id);
    onSourceChange?.(id);
    setPosition(0);
    setLoopA(null);
    const ctx = engine.getCtx();
    const buf = id === 'pink' ? generatePinkNoise(ctx) : generateWhiteNoise(ctx);
    await engine.loadBuffer(buf);
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

  function handleSeekStart() {
    isDraggingRef.current = true;
  }

  function handleSeekChange(e) {
    const offset = parseFloat(e.target.value);
    setPosition(offset);
    // Mouse/touch drags seek once on release (handleSeekEnd); keyboard and
    // assistive-tech input only produce onChange, so seek straight away.
    if (!isDraggingRef.current) engine.seek(offset);
  }

  function handleSeekEnd(e) {
    const offset = parseFloat(e.target.value);
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
            {GENERATED_TRACKS.map((t, i) => (
              <button
                key={t.id}
                className={`track-btn ${activeId === t.id ? 'active' : ''} ${activeId === t.id && engine.isPlaying ? 'live' : ''}`}
                onClick={() => loadGenerated(t.id)}
                disabled={engine.isLoading}
                aria-pressed={activeId === t.id}
              >
                <span className="track-tag">IN {i + 1}</span>
                <SourceGlyph kind={t.id} />
                <span className="track-name">{t.label}</span>
                <span className="track-desc">{t.description}</span>
              </button>
            ))}
            <button
              className={`track-btn upload-btn ${isUpload ? 'active' : ''} ${isUpload && engine.isPlaying ? 'live' : ''}`}
              onClick={() => fileRef.current?.click()}
              disabled={engine.isLoading || uploading}
              data-tooltip={isUpload ? activeId.slice(7) : undefined}
              aria-pressed={isUpload}
            >
              <span className="track-tag">IN {GENERATED_TRACKS.length + 1}</span>
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
                  onMouseDown={handleSeekStart}
                  onTouchStart={handleSeekStart}
                  onChange={handleSeekChange}
                  onMouseUp={handleSeekEnd}
                  onTouchEnd={handleSeekEnd}
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
