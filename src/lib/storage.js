import { useState, useEffect } from 'react';

// Everything FreqRoom saves lives under this prefix so it can be cleared in one go.
// Storage can be unavailable (private mode, blocked site data), so every access
// is guarded and the app falls back to defaults.
const PREFIX = 'freqroom:';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export function clearAll() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } catch { /* storage unavailable */ }
}

// useState that survives reloads
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => load(key, typeof initial === 'function' ? initial() : initial));
  useEffect(() => { save(key, value); }, [key, value]);
  return [value, setValue];
}
