// jsdom environments: jsdom provides the DOM but no matchMedia or
// requestAnimationFrame (which FreqGraph and the transport tick rely on).
// In the node environment these stubs are no-ops. Runs for every test file via
// setupFiles; only the jsdom specs opt in with `// @vitest-environment jsdom`.
import '@testing-library/jest-dom/vitest';

if (typeof window !== 'undefined') {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    });
  }
  if (typeof window.requestAnimationFrame !== 'function') {
    window.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 16);
    window.cancelAnimationFrame = id => clearTimeout(id);
  }
}