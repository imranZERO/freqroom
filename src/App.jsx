import { useState, useEffect } from 'react';
import { Router, Route, Switch } from 'wouter';
import { useAudioEngine, DEFAULT_VOLUME } from './hooks/useAudioEngine.js';
import { TrackSelector } from './components/TrackSelector.jsx';
import { FrequencyTrainer, MODES } from './components/FrequencyTrainer.jsx';
import { ScoreBoard } from './components/ScoreBoard.jsx';
import { HowItWorksModal } from './components/HowItWorksModal.jsx';
import { ConfirmDialog } from './components/ConfirmDialog.jsx';
import { TechnicalDetails } from './components/TechnicalDetails.jsx';
import { InfoIcon, SunIcon, MoonIcon, GitHubIcon } from './components/Icons.jsx';
import { usePersistentState, clearAll } from './lib/storage.js';
import { EMPTY_PROGRESS, recordResult } from './lib/progress.js';
import { parseChallenge } from './lib/challenge.js';

const DEFAULT_GAIN_DB = 6;
const DEFAULT_Q = 1.4;

function MainApp() {
  const engine = useAudioEngine();
  const [scores, setScores] = useState({ total: 0, correct: 0 });
  const [isDark, setIsDark] = usePersistentState(
    'dark', () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [showInfo, setShowInfo] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState(null);
  const [gainDb, setGainDb] = usePersistentState('gainDb', DEFAULT_GAIN_DB);
  const [q, setQ] = usePersistentState('q', DEFAULT_Q);
  const controlsChanged = engine.volume !== DEFAULT_VOLUME || gainDb !== DEFAULT_GAIN_DB || q !== DEFAULT_Q;

  function resetControls() {
    engine.setVolume(DEFAULT_VOLUME);
    setGainDb(DEFAULT_GAIN_DB);
    setQ(DEFAULT_Q);
  }
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
    setConfirmRequest({
      title: 'Reset progress?',
      message: 'Your levels, lifetime score, and weak-spot stats will be cleared. Your settings are kept.',
      confirmLabel: 'Reset progress',
      onConfirm: () => {
        setProgress(EMPTY_PROGRESS);
        setScores({ total: 0, correct: 0 });
        setConfirmRequest(null);
      },
    });
  }

  function clearSavedData() {
    setConfirmRequest({
      title: 'Clear saved data?',
      message: 'Everything FreqRoom has saved in this browser — progress, settings, and theme — will be removed, and the page will reload. This can\'t be undone.',
      confirmLabel: 'Clear data',
      onConfirm: () => {
        clearAll();
        location.reload();
      },
    });
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
            controlsChanged={controlsChanged} onResetControls={resetControls}
          />
          <div className="side-footer">
            {progress.lifetime.total > 0 && (
              <button className="footer-link-btn" onClick={resetProgress}>Reset progress</button>
            )}
            <button className="footer-link-btn" onClick={clearSavedData}>Clear saved data</button>
          </div>
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
      <ConfirmDialog request={confirmRequest} onCancel={() => setConfirmRequest(null)} />

      <footer className="app-footer">
        <p className="footer-created">
          <a href="https://github.com/imranZERO/freqroom" target="_blank" rel="noopener noreferrer" className="footer-gh-link" aria-label="FreqRoom on GitHub">
            <GitHubIcon />
          </a>
          Created by <a href="https://imranzero.pages.dev" target="_blank" rel="noopener noreferrer">imranZERO</a>
        </p>
        <p>
          Inspired by <a href="https://harmanhowtolisten.blogspot.com" target="_blank" rel="noopener noreferrer">Harman's How to Listen</a>
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
