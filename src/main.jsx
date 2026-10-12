import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './App.css';

// Offline support and installability; skipped in dev so Vite's HMR isn't cached
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support is optional */ });
  });
}

// The build prerenders each page's markup for crawlers (scripts/prerender.js).
// A plain render (not hydrate) diffs against it, fixing up anything saved
// settings change, and reuses the nodes so the entrance animation plays once.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
