import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseChallenge, buildChallengeUrl, copyText } from '../src/lib/challenge.js';

const MODES = ['boost', 'cut', 'both', 'shelf', 'pass', 'sweep'];

afterEach(() => vi.restoreAllMocks());

describe('parseChallenge', () => {
  it('returns null for an empty search', () => {
    expect(parseChallenge('', MODES)).toBeNull();
    expect(parseChallenge('?', MODES)).toBeNull();
  });

  it('parses a full valid link', () => {
    expect(parseChallenge('?mode=cut&gain=6&q=1.4&source=pink&level=4', MODES))
      .toEqual({ mode: 'cut', gainDb: 6, q: 1.4, source: 'pink', level: 4 });
  });

  it('drops unknown modes but keeps valid fields', () => {
    // an invalid mode alone leaves nothing to configure → null
    expect(parseChallenge('?mode=nope', MODES)).toBeNull();
    // valid fields survive when the mode is dropped
    expect(parseChallenge('?mode=nope&source=pink', MODES)).toEqual({ source: 'pink' });
    expect(parseChallenge('?mode=boost&source=upload', MODES)).toEqual({ mode: 'boost' });
  });

  it('clamps gain to 1..18', () => {
    expect(parseChallenge('?mode=boost&gain=40', MODES).gainDb).toBe(18);
    expect(parseChallenge('?mode=boost&gain=0', MODES).gainDb).toBe(1);
    expect(parseChallenge('?mode=boost&gain=12', MODES).gainDb).toBe(12);
  });

  it('clamps q to 0.5..8 and rounds to one decimal', () => {
    expect(parseChallenge('?mode=boost&q=0.1', MODES).q).toBe(0.5);
    expect(parseChallenge('?mode=boost&q=99', MODES).q).toBe(8);
    expect(parseChallenge('?mode=boost&q=1.26', MODES).q).toBe(1.3);
  });

  it('clamps level to 1..15 and only keeps it with a mode', () => {
    expect(parseChallenge('?mode=boost&level=99', MODES).level).toBe(15);
    expect(parseChallenge('?mode=boost&level=0', MODES).level).toBe(1);
    // a level with no (valid) mode is dropped entirely
    expect(parseChallenge('?level=5', MODES)).toBeNull();
  });

  it('ignores non-numeric numbers', () => {
    expect(parseChallenge('?mode=boost&gain=abc', MODES)).toEqual({ mode: 'boost' });
  });
});

describe('buildChallengeUrl', () => {
  it('always includes the mode and uses location.origin', () => {
    expect(buildChallengeUrl({ mode: 'boost' })).toBe('https://freqroom.test/?mode=boost');
  });

  it('omits settings that are not given', () => {
    expect(buildChallengeUrl({ mode: 'boost', gainDb: 6, source: 'white' }))
      .toBe('https://freqroom.test/?mode=boost&gain=6&source=white');
    const url = buildChallengeUrl({ mode: 'boost', gainDb: 6 });
    expect(url).not.toMatch(/[?&]q=/);
    expect(url).not.toMatch(/[?&]level=/);
  });

  it('never writes a source outside the whitelist', () => {
    expect(buildChallengeUrl({ mode: 'boost', source: 'upload' }))
      .toBe('https://freqroom.test/?mode=boost');
  });

  it('round-trips through parseChallenge', () => {
    const setup = { mode: 'cut', gainDb: 12, q: 2, source: 'pink', level: 9 };
    // parseChallenge takes the search string, not a full URL
    const search = new URL(buildChallengeUrl(setup)).search;
    expect(parseChallenge(search, MODES)).toEqual(setup);
  });
});

describe('copyText', () => {
  it('returns true when the clipboard works', async () => {
    navigator.clipboard.writeText = vi.fn(async () => {});
    await expect(copyText('hi')).resolves.toBe(true);
  });

  it('falls back to a prompt and returns false when blocked', async () => {
    navigator.clipboard.writeText = vi.fn(async () => { throw new Error('denied'); });
    window.prompt = vi.fn(() => '');
    await expect(copyText('the-url')).resolves.toBe(false);
    expect(window.prompt).toHaveBeenCalledWith('Copy this challenge link:', 'the-url');
  });
});