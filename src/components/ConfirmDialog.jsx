import { useRef, useEffect } from 'react';

// In-app replacement for window.confirm. Pass `request` = { title, message,
// confirmLabel, onConfirm } to open it, or null to close. Escape, the Cancel
// button, and clicking the backdrop all call onCancel.
export function ConfirmDialog({ request, onCancel }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onCancelRef.current = onCancel; });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (request && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus(); // the safe choice has focus, so Enter doesn't delete anything
    } else if (!request && dialog.open) {
      dialog.close();
    }
  }, [request]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const handler = e => { e.preventDefault(); onCancelRef.current(); };
    dialog.addEventListener('cancel', handler);
    return () => dialog.removeEventListener('cancel', handler);
  }, []);

  function handleBackdropClick(e) {
    if (e.target === dialogRef.current) onCancel();
  }

  return (
    <dialog
      ref={dialogRef}
      className="info-modal confirm-modal"
      onClick={handleBackdropClick}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
    >
      {request && (
        <div className="confirm-body">
          <h2 id="confirm-title">{request.title}</h2>
          <p id="confirm-message">{request.message}</p>
          <div className="confirm-actions">
            <button ref={cancelRef} className="btn-ghost" onClick={onCancel}>Cancel</button>
            <button className="btn-danger" onClick={request.onConfirm}>{request.confirmLabel}</button>
          </div>
        </div>
      )}
    </dialog>
  );
}
