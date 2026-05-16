import { useRef, useEffect } from 'react';

export function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  );
}

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
              once you want to practice on real music — that's where the training counts.
            </p>
          </div>

          <div className="info-section">
            <h3>2 · Pick a test mode</h3>
            <div className="info-mode-list">
              <div className="info-mode-item">
                <strong>+6dB Boosts</strong> — one frequency band is boosted; identify which one.
              </div>
              <div className="info-mode-item">
                <strong>−6dB Cuts</strong> — one band is cut; identify which one.
              </div>
              <div className="info-mode-item">
                <strong>±6dB Mixed</strong> — a band is either boosted or cut; identify the frequency
                <em> and</em> the direction. The hardest mode.
              </div>
            </div>
          </div>

          <div className="info-section">
            <h3>3 · Compare EQ vs. flat</h3>
            <p>
              Each trial applies a <strong>±6dB peak filter</strong> (Q 1.4) at one hidden frequency.
              Toggle between <strong>With EQ</strong> and <strong>Flat Reference</strong> as many times
              as you need — the gap between them is exactly what you're training your ears to hear.
              There's no time limit.
            </p>
          </div>

          <div className="info-section">
            <h3>4 · Adaptive difficulty (levels 2–15)</h3>
            <p>
              Your level is the number of candidate frequency bands shown per trial. At <strong>level 2</strong>
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
            <h3>Tips</h3>
            <p>
              Use <strong>headphones or studio monitors</strong> — laptop speakers compress the frequency
              response and defeat the purpose. In Mixed mode, listen for the <em>hollow, recessed</em> character
              of a cut vs. the <em>forward, present</em> quality of a boost. If you're struggling, drop back
              to Boosts-only and rebuild from a lower level.
            </p>
          </div>

        </div>
      </div>
    </dialog>
  );
}
