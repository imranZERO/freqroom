import { useState, useEffect } from 'react';
import { useAudioEngine } from './hooks/useAudioEngine.js';
import { TrackSelector } from './components/TrackSelector.jsx';
import { FrequencyTrainer } from './components/FrequencyTrainer.jsx';
import { ScoreBoard } from './components/ScoreBoard.jsx';
import { HowItWorksModal, InfoIcon } from './components/HowItWorksModal.jsx';
import { FreqGraph } from './components/FreqGraph.jsx';

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

export default function App() {
  const engine = useAudioEngine();
  const [scores, setScores] = useState({ total: 0, correct: 0 });
  const [isDark, setIsDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [showInfo, setShowInfo] = useState(false);
  const [activeEq, setActiveEq] = useState(null);
  const [gainDb, setGainDb] = useState(6);
  const [q, setQ] = useState(1.4);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  function handleScore(correct) {
    setScores(prev => ({ total: prev.total + 1, correct: prev.correct + (correct ? 1 : 0) }));
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <h1>Fr<span className="title-eq">eq</span>Room</h1>
          <div className="header-actions">
            <button
              className="icon-btn"
              onClick={() => setShowInfo(true)}
              aria-label="How it works"
            >
              <InfoIcon />
            </button>
            <button
              className="icon-btn"
              onClick={() => setIsDark(d => !d)}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
        <p>Interactive EQ ear training for producers, engineers, and audiophiles</p>
      </header>

      <main className="app-main">
        <TrackSelector engine={engine} gainDb={gainDb} setGainDb={setGainDb} q={q} setQ={setQ} />
        <section className="card freq-graph-card">
          <h2>Frequency Response</h2>
          <FreqGraph
            bands={activeEq?.bands ?? []}
            gains={activeEq?.gains ?? []}
            gainDb={activeEq?.gainDb ?? gainDb}
            centerFreq={activeEq?.centerFreq ?? null}
            Q={q}
          />
        </section>
        <FrequencyTrainer engine={engine} onScore={handleScore} onEqChange={setActiveEq} gainDb={gainDb} q={q} />
        <ScoreBoard scores={scores} onReset={() => setScores({ total: 0, correct: 0 })} />
      </main>

      <HowItWorksModal isOpen={showInfo} onClose={() => setShowInfo(false)} />

      <footer className="app-footer">
        <p>Created by <a href="https://github.com/imranZERO" target="_blank" rel="noopener noreferrer">imranZERO</a></p>
        <p>Inspired by <a href="https://harmanhowtolisten.blogspot.com" target="_blank" rel="noopener noreferrer">Harman's How to Listen</a></p>
      </footer>
    </div>
  );
}
