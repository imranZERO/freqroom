// Runs after `vite build`: renders each page into its own static HTML file so
// crawlers and link previews get real content and the right <head>, without
// shipping anything extra to the browser.
//   /                   → dist/index.html
//   /technical-details  → dist/technical-details.html  (Cloudflare Pages serves it extensionless)
//   anything else       → dist/404.html                (served with a 404 status, noindex)
// The app is rendered in jsdom through Vite's SSR loader; effects never run
// because the markup is read right after the synchronous first render. In the
// browser, main.jsx renders over this markup, reusing its nodes.
import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const DIST = new URL('../dist/', import.meta.url);
const template = readFileSync(new URL('index.html', DIST), 'utf8');

const vite = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, ws: false },
  // Run wouter through Vite so its `react` imports get the preact/compat alias,
  // and point its CommonJS useSyncExternalStore shim (which requires real React) at preact
  ssr: { noExternal: ['wouter'] },
  resolve: { alias: { 'use-sync-external-store/shim/index.js': 'preact/compat' } },
});

// Browser globals for the app's modules, pointed at a fresh window per page
const GLOBALS = ['window', 'document', 'navigator', 'location', 'history', 'localStorage', 'HTMLElement', 'Node', 'Event'];
function useWindow(win) {
  win.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  win.requestAnimationFrame ??= () => 0;
  win.cancelAnimationFrame ??= () => {};
  for (const name of GLOBALS) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: win[name] });
  }
}

const { SITE_URL, PAGES, NOT_FOUND } = await vite.ssrLoadModule('/src/lib/pages.js');
const { render, h } = await import('preact');
const { default: App } = await vite.ssrLoadModule('/src/App.jsx');

const setMeta = (doc, selector, value) => doc.querySelector(selector)?.setAttribute('content', value);

function renderPage(path, page, outFile) {
  const dom = new JSDOM(template, { url: SITE_URL + path });
  useWindow(dom.window);
  const doc = dom.window.document;

  const root = doc.getElementById('root');
  render(h(App), root);
  const html = root.innerHTML;
  render(null, root);
  root.innerHTML = html;

  const url = SITE_URL + path;
  doc.title = page.title;
  setMeta(doc, 'meta[name="description"]', page.description);
  setMeta(doc, 'meta[property="og:title"]', page.title);
  setMeta(doc, 'meta[property="og:description"]', page.description);
  setMeta(doc, 'meta[property="og:url"]', url);
  doc.querySelector('link[rel="canonical"]').href = url;

  // The structured data describes the app itself, so only the home page keeps it
  if (path !== '/') doc.querySelector('script[type="application/ld+json"]')?.remove();
  if (page === NOT_FOUND) {
    doc.querySelector('link[rel="canonical"]').remove();
    doc.querySelector('meta[property="og:url"]').remove();
    const robots = doc.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    doc.head.prepend(robots);
  }

  writeFileSync(new URL(outFile, DIST), dom.serialize());
  dom.window.close();
  console.log(`prerendered ${path} → dist/${outFile} (${html.length.toLocaleString('en-US')} chars of markup)`);
}

try {
  for (const [path, page] of Object.entries(PAGES)) {
    renderPage(path, page, path === '/' ? 'index.html' : `${path.slice(1)}.html`);
  }
  renderPage('/404', NOT_FOUND, '404.html');
} finally {
  await vite.close();
}
