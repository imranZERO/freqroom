import { useState, useEffect } from 'react';
import { Router, Route, Switch } from 'wouter';
import { useAudioEngine, DEFAULT_VOLUME } from './hooks/useAudioEngine.js';
import { TrackSelector } from './components/TrackSelector.jsx';
import { FrequencyTrainer, MODES } from './components/FrequencyTrainer.jsx';
import { ScoreBoard } from './components/ScoreBoard.jsx';
import { HowItWorksModal } from './components/HowItWorksModal.jsx';
import { ConfirmDialog } from './components/ConfirmDialog.jsx';
import { TechnicalDetails } from './components/TechnicalDetails.jsx';
import { SiteHeader, SiteFooter } from './components/SiteChrome.jsx';
import { ResetIcon, TrashIcon } from './components/Icons.jsx';
import { usePersistentState, clearAll } from './lib/storage.js';
import { EMPTY_PROGRESS, recordResult } from './lib/progress.js';
import { parseChallenge } from './lib/challenge.js';

const DEFAULT_GAIN_DB = 6;
const DEFAULT_Q = 1.4;

function MainApp({ chrome }) {
  const engine = useAudioEngine();
  const [scores, setScores] = useState({ total: 0, correct: 0 });
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      <SiteHeader {...chrome} subtitle="Interactive EQ ear training for producers, engineers, and audiophiles" />

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
              <button
                className="data-btn" onClick={resetProgress}
                data-tooltip="Clear your levels, lifetime score, and accuracy stats. Settings are kept."
              ><ResetIcon />Reset progress</button>
            )}
            <button
              className="data-btn data-btn-danger" onClick={clearSavedData}
              data-tooltip="Remove everything FreqRoom saved in this browser: progress, settings, and theme."
            ><TrashIcon />Clear saved data</button>
          </div>
        </aside>
        <div className="rack-main">
          <FrequencyTrainer
            engine={engine} gainDb={gainDb} q={q}
            progress={progress} focus={focus} autoplay={autoplay} onResult={handleResult}
            initialMode={challenge?.mode} initialLevel={challenge?.level} sourceId={sourceId}
          />
          <ScoreBoard
            scores={scores} lifetime={progress.lifetime}
            onReset={() => setScores({ total: 0, correct: 0 })}
          />
        </div>
      </main>

      <ConfirmDialog request={confirmRequest} onCancel={() => setConfirmRequest(null)} />

      <SiteFooter page="trainer" />
    </div>
  );
}

// Theme and the How it works dialog are shared by every page
// The theme button cycles System → Light → Dark
const THEME_ORDER = ['system', 'light', 'dark'];
const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export default function App() {
  const [theme, setTheme] = usePersistentState('theme', 'system');
  const [osDark, setOsDark] = useState(systemDark);
  const [showInfo, setShowInfo] = useState(false);

  // Follow the OS setting live while the theme is "system"
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = e => setOsDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const isDark = theme === 'dark' || (theme === 'system' && osDark);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const chrome = {
    theme,
    onCycleTheme: () => setTheme(t => THEME_ORDER[(THEME_ORDER.indexOf(t) + 1) % THEME_ORDER.length]),
    onInfo: () => setShowInfo(true),
  };

  return (
    <Router>
      <Switch>
        <Route path="/technical-details"><TechnicalDetails chrome={chrome} /></Route>
        <Route><MainApp chrome={chrome} /></Route>
      </Switch>
      <HowItWorksModal isOpen={showInfo} onClose={() => setShowInfo(false)} />
    </Router>
  );
}
