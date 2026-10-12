import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PAGES, NOT_FOUND, SITE_URL, pageFor } from '../src/lib/pages.js';

describe('pages', () => {
  it('looks up each page and falls back to Not found', () => {
    expect(pageFor('/')).toBe(PAGES['/']);
    expect(pageFor('/technical-details')).toBe(PAGES['/technical-details']);
    expect(pageFor('/nope')).toBe(NOT_FOUND);
  });

  it('gives every page a distinct title and description', () => {
    const all = [...Object.values(PAGES), NOT_FOUND];
    expect(new Set(all.map(p => p.title)).size).toBe(all.length);
    expect(new Set(all.map(p => p.description)).size).toBe(all.length);
  });

  it('lists exactly the pages in the sitemap, and robots.txt points at it', () => {
    const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    expect(locs).toEqual(Object.keys(PAGES).map(p => SITE_URL + p));
    const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8');
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });
});
