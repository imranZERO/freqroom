// Node environment shims so the lib tests run without a DOM. Everything here is
// conditional: under jsdom the real browser globals exist and take precedence.
// storage.js and challenge.js only touch these globals lazily (inside the
// functions under test), so these bare-bones stand-ins are all that's needed.

// localStorage: entries live as *enumerable own properties* of the object — the
// same layout storage.js relies on (its clearAll() iterates Object.keys(localStorage)
// and matches the freqroom: prefix). The API methods are non-enumerable so they
// don't show up in that iteration. jsdom provides its own, so only install
// this when there is none.
// Don't probe `typeof globalThis.localStorage` here: on Node 25+ merely
// reading that global triggers an ExperimentalWarning.
// Under jsdom a real document exists and jsdom's own storage is used.
const hasDom = typeof globalThis.document !== 'undefined';
if (!hasDom) {
  const storage = {
    get length() { return Object.keys(this).length; },
    getItem(key) { return Object.prototype.hasOwnProperty.call(this, key) ? this[key] : null; },
    setItem(key, value) { this[key] = String(value); },
    removeItem(key) { delete this[key]; },
    key(i) { return Object.keys(this)[i] ?? null; },
    clear() { for (const k of Object.keys(this)) delete this[k]; },
  };
  Object.defineProperty(storage, 'length', { enumerable: false });
  for (const m of ['getItem', 'setItem', 'removeItem', 'key', 'clear']) {
    Object.defineProperty(storage, m, { value: storage[m], enumerable: false });
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: storage });
}

// buildChallengeUrl reads location.origin (only defined in node)
if (typeof globalThis.location === 'undefined') {
  globalThis.location = { origin: 'https://freqroom.test' };
}

// copyText uses navigator.clipboard, falling back to window.prompt. Keep any
// existing globals (jsdom's navigator/window) and only add what they lack.
if (typeof globalThis.navigator !== 'undefined' && !globalThis.navigator.clipboard) {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true, value: { writeText: async () => {} },
  });
} else if (typeof globalThis.navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: { clipboard: { writeText: async () => {} } },
  });
}

if (typeof globalThis.window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    configurable: true, value: { prompt: () => '' },
  });
} else if (typeof globalThis.window.prompt !== 'function') {
  Object.defineProperty(globalThis.window, 'prompt', {
    configurable: true, value: () => '',
  });
}