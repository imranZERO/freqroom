// Node environment shims so the lib tests run without a DOM.
// storage.js and challenge.js only touch browser globals lazily (inside the
// functions under test), so these bare-bones stand-ins are all that's needed.

// localStorage: entries live as *enumerable own properties* of the object — the
// same layout storage.js relies on (its clearAll() iterates Object.keys(localStorage)
// and matches the freqroom: prefix). The API methods are non-enumerable so they
// don't show up in that iteration.
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
globalThis.localStorage = storage;

// buildChallengeUrl reads location.origin
globalThis.location = { origin: 'https://freqroom.test' };

// copyText uses navigator.clipboard, falling back to window.prompt
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { clipboard: { writeText: async () => {} } },
});
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { prompt: () => '' },
});