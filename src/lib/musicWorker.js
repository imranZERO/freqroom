// Renders a music loop off the main thread, so the page doesn't freeze while
// it's synthesized. The channels are transferred back, not copied.
import { renderLoop } from './musicGen.js';

self.onmessage = ({ data: { id, kind, sampleRate } }) => {
  const { L, R } = renderLoop(kind, sampleRate);
  self.postMessage({ id, L, R }, [L.buffer, R.buffer]);
};
