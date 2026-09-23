import { useState, useEffect } from 'react';
import { Router, Route, Switch } from 'wouter';
import { useAudioEngine } from './hooks/useAudioEngine.js';
import { TrackSelector } from './components/TrackSelector.jsx';
import { FrequencyTrainer, MODES } from './components/FrequencyTrainer.jsx';
import { ScoreBoard } from './components/ScoreBoard.jsx';
import { HowItWorksModal } from './components/HowItWorksModal.jsx';
import { TechnicalDetails } from './components/TechnicalDetails.jsx';
import { InfoIcon, SunIcon, MoonIcon, GitHubIcon } from './components/Icons.jsx';
import { usePersistentState, clearAll } from './lib/storage.js';
import { EMPTY_PROGRESS, recordResult } from './lib/progress.js';
import { parseChallenge } from './lib/challenge.js';

function MainApp() {
  const engine = useAudioEngine();
  const [scores, setScores] = useState({ total: 0, correct: 0 });
  const [isDark, setIsDark] = usePersistentState(
    'dark', () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [showInfo, setShowInfo] = useState(false);
  const [gainDb, setGainDb] = usePersistentState('gainDb', 6);
  const [q, setQ] = usePersistentState('q', 1.4);
  const [focus, setFocus] = usePersistentState('focus', false);
  const [autoplay, setAutoplay] = usePersistentState('autoplay', true);
  const [progress, setProgress] = usePersistentState('progress', EMPTY_PROGRESS);
  // Which built-in source is loaded ('pink' | 'white'), for challenge links
  const [sourceId, setSourceId] = useState(null);
  // Settings from a challenge link, read once on load
  const [challenge] = useState(() => parseChallenge(location.search, MODES.map(m => m.id)));

  useEffect(() => {
    if (!challenge) return;
    history.replaceState(null, '', location.pathname);
    if (challenge.gainDb) setGainDb(challenge.gainDb);
    if (challenge.q) setQ(challenge.q);
    if (challenge.level) {
      setProgress(p => ({ ...p, levels: { ...p.levels, [challenge.mode]: challenge.level } }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Called by the trainer for every answered trial
  function handleResult(result) {
    const { correct } = result;
    setScores(prev => ({ total: prev.total + 1, correct: prev.correct + (correct ? 1 : 0) }));
    setProgress(prev => recordResult(prev, result));
  }

  function resetProgress() {
    if (!confirm('Reset your levels, lifetime score, and weak-spot stats? Settings are kept.')) return;
    setProgress(EMPTY_PROGRESS);
    setScores({ total: 0, correct: 0 });
  }

  function clearSavedData() {
    if (!confirm('Clear everything FreqRoom has saved in this browser — progress, settings, and theme?')) return;
    clearAll();
    location.reload();
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
          <TrackSelector
            engine={engine} gainDb={gainDb} setGainDb={setGainDb} q={q} setQ={setQ}
            focus={focus} setFocus={setFocus} autoplay={autoplay} setAutoplay={setAutoplay}
            initialSource={challenge?.source} onSourceChange={setSourceId}
            hasProgress={progress.lifetime.total > 0} onResetProgress={resetProgress}
          />
        </aside>
        <div className="rack-main">
          <FrequencyTrainer
            engine={engine} gainDb={gainDb} q={q}
            progress={progress} focus={focus} autoplay={autoplay} onResult={handleResult}
            initialMode={challenge?.mode} sourceId={sourceId}
          />
          <ScoreBoard
            scores={scores} lifetime={progress.lifetime}
            onReset={() => setScores({ total: 0, correct: 0 })}
          />
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
        <p>
          Inspired by <a href="https://harmanhowtolisten.blogspot.com" target="_blank" rel="noopener noreferrer">Harman's How to Listen</a>
          <span className="footer-sep">·</span>
          <button className="footer-link-btn" onClick={clearSavedData}>Clear saved data</button>
        </p>
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
