import { useRef, useState, useEffect } from 'react';
import { generatePinkNoise, generateWhiteNoise } from '../lib/noiseGen.js';

const GENERATED_TRACKS = [
  { id: 'pink', label: 'Pink Noise', description: 'Equal energy per octave — ideal for EQ training' },
  { id: 'white', label: 'White Noise', description: 'Flat spectrum, bright character' },
];

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function TrackSelector({ engine, gainDb, setGainDb, q, setQ }) {
  const fileRef = useRef(null);
  const [activeId, setActiveId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [position, setPosition] = useState(0);
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

  async function loadGenerated(id) {
    setActiveId(id);
    setPosition(0);
    const ctx = engine.getCtx();
    const buf = id === 'pink' ? generatePinkNoise(ctx) : generateWhiteNoise(ctx);
    await engine.loadBuffer(buf);
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setActiveId(`upload:${file.name}`);
    setPosition(0);
    await engine.loadBuffer(file);
    setUploading(false);
    e.target.value = '';
  }

  function handleSeekStart() {
    isDraggingRef.current = true;
  }

  function handleSeekChange(e) {
    setPosition(parseFloat(e.target.value));
  }

  function handleSeekEnd(e) {
    const offset = parseFloat(e.target.value);
    isDraggingRef.current = false;
    setPosition(offset);
    engine.seek(offset);
  }

  return (
    <section className="card">
      <h2>Source Audio</h2>
      <div className="track-grid">
        {GENERATED_TRACKS.map(t => (
          <button
            key={t.id}
            className={`track-btn ${activeId === t.id ? 'active' : ''}`}
            onClick={() => loadGenerated(t.id)}
            disabled={engine.isLoading}
          >
            <span className="track-name">{t.label}</span>
            <span className="track-desc">{t.description}</span>
          </button>
        ))}
        <button
          className={`track-btn upload-btn ${isUpload ? 'active' : ''}`}
          onClick={() => fileRef.current?.click()}
          disabled={engine.isLoading || uploading}
        >
          <span className="track-name">
            {uploading ? 'Loading…' : isUpload ? activeId.slice(7) : 'Upload File'}
          </span>
          <span className="track-desc">MP3, WAV, FLAC, OGG</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
      </div>

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
          </div>
        )}
      </div>

      {engine.loadError && <p className="error">{engine.loadError}</p>}
    </section>
  );
}
