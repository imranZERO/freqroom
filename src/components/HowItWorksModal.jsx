import { useRef, useEffect } from 'react';
import { Link } from 'wouter';
import { InfoIcon } from './Icons.jsx';

export function HowItWorksModal({ isOpen, onClose }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) dialog.showModal();
    else if (dialog.open) dialog.close();
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handler = () => onCloseRef.current();
    dialog.addEventListener('cancel', handler);
    return () => dialog.removeEventListener('cancel', handler);
  }, []);

  function handleBackdropClick(e) {
    if (e.target === dialogRef.current) onClose();
  }

  return (
    <dialog ref={dialogRef} className="info-modal" onClick={handleBackdropClick}>
      <div className="info-modal-inner">
        <div className="info-modal-header">
          <h2>How FreqRoom Works</h2>
          <button className="info-modal-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="info-modal-body">

          <div className="info-warning">
            <strong>Volume warning</strong> — EQ boosts can be significantly louder than the flat reference.
            Set your volume to a comfortable level before starting, and avoid listening at high volumes for extended periods.
          </div>

          <div className="info-section">
            <h3>1 · Choose a source</h3>
            <p>
              Pick <strong>Pink Noise</strong> to start — its equal energy per octave makes every
              frequency band equally audible, which is ideal for ear training. <strong>White Noise</strong>{' '}
              has a brighter, high-frequency bias. <strong>Upload your own audio</strong> (MP3, WAV, FLAC, OGG)
              once you want to practice on real music — that's where the training counts. With a file loaded,
              use <strong>Set A</strong> and <strong>Set B</strong> under the Position fader to loop one
              section, such as a dense chorus.
            </p>
          </div>

          <div className="info-section">
            <h3>2 · Pick a test mode</h3>
            <div className="info-mode-list">
              <div className="info-mode-item">
                <strong>Boosts</strong> — one frequency band is boosted; identify which one.
              </div>
              <div className="info-mode-item">
                <strong>Cuts</strong> — one band is cut; identify which one.
              </div>
              <div className="info-mode-item">
                <strong>Mixed</strong> — a band is either boosted or cut; identify the frequency
                <em> and</em> the direction.
              </div>
              <div className="info-mode-item">
                <strong>Shelves</strong> — a low or high shelf lifts or lowers everything past a corner
                frequency; find the corner. Corners below 1 kHz are low shelves, above are high shelves.
              </div>
              <div className="info-mode-item">
                <strong>Pass Filters</strong> — a high-pass or low-pass filter removes lows or highs;
                find the cutoff. The Gain slider doesn't apply here.
              </div>
              <div className="info-mode-item">
                <strong>Sweep</strong> — no buttons: click or drag on the graph to where you hear the boost
                (← → nudge by a semitone). You're scored on how many octaves off you are; the allowed error
                shrinks from 1 octave at level 1 to ⅙ octave at level 5.
              </div>
            </div>
          </div>

          <div className="info-section">
            <h3>3 · Adjust the filter</h3>
            <p>
              Use the <strong>Gain</strong> and <strong>Q</strong> sliders to control the shape of the peak filter
              applied each trial. <strong>Gain</strong> sets the boost or cut amplitude (1–18 dB) —
              start high (12+ dB) if you're new, then work down as your ears improve. <strong>Q</strong>{' '}
              controls bandwidth: a low Q (0.5–1) creates a broad, gentle shelf-like curve that's easier to hear;
              a high Q (4–8) creates a narrow notch that's much harder to identify. Both sliders take effect
              immediately, even mid-trial.
            </p>
          </div>

          <div className="info-section">
            <h3>4 · Compare EQ vs. flat</h3>
            <p>
              Each trial applies a peak filter at one hidden frequency using your current Gain and Q settings.
              Toggle between <strong>EQ</strong> and <strong>Flat</strong> as many times
              as you need — the gap between them is exactly what you're training your ears to hear.
              There's no time limit.
            </p>
          </div>

          <div className="info-section">
            <h3>5 · Adaptive difficulty (levels 2–15)</h3>
            <p>
              Your level is the number of candidate frequency bands shown per trial. At <strong>level 2</strong>{' '}
              you're choosing between two widely-spaced frequencies. At <strong>level 15</strong> you're
              distinguishing 15 bands spread logarithmically across 20Hz–20kHz — a serious challenge even
              for experienced engineers.
            </p>
            <div className="info-level-row">
              <div className="info-level-badge">
                <strong>3 correct</strong> in a row → level up
              </div>
              <div className="info-level-badge">
                <strong>2 wrong</strong> in a row → level down
              </div>
            </div>
          </div>

          <div className="info-section">
            <h3>6 · Keyboard</h3>
            <p>
              <strong>1–9</strong> and <strong>0</strong> pick bands 1–10, <strong>← →</strong> step between
              bands, and in Mixed mode <strong>↑ ↓</strong> switch between the boost and cut rows.{' '}
              <strong>Space</strong> toggles EQ/Flat (even after answering, so you can re-listen to the
              reveal) and <strong>Enter</strong> checks your answer or starts the next trial.
              With <strong>Auto-play EQ</strong> on, each new trial starts playing straight away.
            </p>
          </div>

          <div className="info-section">
            <h3>7 · Tips</h3>
            <p>
              Use <strong>headphones or studio monitors</strong> — laptop speakers compress the frequency
              response and defeat the purpose. In Mixed mode, listen for the <em>hollow, recessed</em> character
              of a cut vs. the <em>forward, present</em> quality of a boost. If you're struggling, drop back
              to Boosts-only and rebuild from a lower level. To set someone a challenge, press{' '}
              <strong>Share</strong> in the trainer: it copies a link that opens FreqRoom with the same mode,
              level, gain, Q, and noise source.
            </p>
          </div>

          <div className="info-tech-link">
            <Link href="/technical-details">
              Technical Details →
            </Link>
            <span>Filter math, pink noise, and signal chain explained</span>
          </div>

        </div>
      </div>
    </dialog>
  );
}
