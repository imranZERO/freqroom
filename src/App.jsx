import { useState, useEffect } from 'react';
import { Router, Route, Switch } from 'wouter';
import { useAudioEngine } from './hooks/useAudioEngine.js';
import { TrackSelector } from './components/TrackSelector.jsx';
import { FrequencyTrainer } from './components/FrequencyTrainer.jsx';
import { ScoreBoard } from './components/ScoreBoard.jsx';
import { HowItWorksModal } from './components/HowItWorksModal.jsx';
import { TechnicalDetails } from './components/TechnicalDetails.jsx';
import { InfoIcon, SunIcon, MoonIcon, GitHubIcon } from './components/Icons.jsx';

function MainApp() {
  const engine = useAudioEngine();
  const [scores, setScores] = useState({ total: 0, correct: 0 });
  const [isDark, setIsDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [showInfo, setShowInfo] = useState(false);
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
              data-tooltip="How it works"
            >
              <InfoIcon />
            </button>
            <button
              className="icon-btn"
              onClick={() => setIsDark(d => !d)}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              data-tooltip={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
        <p>Interactive EQ ear training for producers, engineers, and audiophiles</p>
      </header>

      <main className="app-main rack">
        <aside className="rack-side">
          <TrackSelector engine={engine} gainDb={gainDb} setGainDb={setGainDb} q={q} setQ={setQ} />
        </aside>
        <div className="rack-main">
          <FrequencyTrainer engine={engine} onScore={handleScore} gainDb={gainDb} q={q} />
          <ScoreBoard scores={scores} onReset={() => setScores({ total: 0, correct: 0 })} />
        </div>
      </main>

      <HowItWorksModal isOpen={showInfo} onClose={() => setShowInfo(false)} />

      <footer className="app-footer">
        <p className="footer-created">
          <a href="https://github.com/imranZERO/freqroom" target="_blank" rel="noopener noreferrer" className="footer-gh-link" aria-label="FreqRoom on GitHub">
            <GitHubIcon />
          </a>
          Created by <a href="https://imranzero.pages.dev" target="_blank" rel="noopener noreferrer">imranZERO</a>
        </p>
        <p>Inspired by <a href="https://harmanhowtolisten.blogspot.com" target="_blank" rel="noopener noreferrer">Harman's How to Listen</a></p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Switch>
        <Route path="/technical-details" component={TechnicalDetails} />
        <Route component={MainApp} />
      </Switch>
    </Router>
  );
}
