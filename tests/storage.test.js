import { describe, it, expect, beforeEach } from 'vitest';
import { load, save, clearAll } from '../src/lib/storage.js';

beforeEach(() => localStorage.clear());

describe('storage', () => {
  it('round-trips values under the freqroom: prefix', () => {
    save('theme', 'dark');
    expect(localStorage.getItem('freqroom:theme')).toBe('"dark"');
    expect(load('theme', 'system')).toBe('dark');
  });

  it('stores objects as JSON', () => {
    const progress = { levels: { boost: 4 }, lifetime: { total: 10, correct: 7 } };
    save('progress', progress);
    expect(load('progress', null)).toEqual(progress);
  });

  it('falls back for a missing key, passing function fallbacks through untouched', () => {
    expect(load('nope', 42)).toBe(42);
    const fn = () => ({ a: 1 });
    expect(load('nope', fn)).toBe(fn); // usePersistentState expands functions itself
  });

  it('falls back on corrupt JSON', () => {
    localStorage.setItem('freqroom:theme', '{not json');
    expect(load('theme', 'light')).toBe('light');
  });

  it('clearAll removes only keys under the prefix', () => {
    localStorage.setItem('other:thing', 'keep me');
    save('volume', 0.4);
    save('q', 1.4);
    clearAll();
    expect(localStorage.getItem('other:thing')).toBe('keep me');
    expect(localStorage.getItem('freqroom:volume')).toBeNull();
    expect(localStorage.length).toBe(1);
  });

  it('runs on defaults when storage is unavailable', () => {
    const real = globalThis.localStorage;
    try {
      globalThis.localStorage = undefined;
      expect(load('theme', 'system')).toBe('system');
      expect(() => save('theme', 'dark')).not.toThrow();
      expect(() => clearAll()).not.toThrow();
    } finally {
      globalThis.localStorage = real;
    }
  });
});