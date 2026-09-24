import { describe, it, expect } from 'vitest';
import { formatTime, formatSpec, seeded, noisyLine, PINK_LINE, WHITE_LINE, WAVE_BARS } from '../src/lib/trackFormat.js';

describe('formatTime', () => {
  it('formats minutes:seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(7)).toBe('0:07');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(187)).toBe('3:07');
    expect(formatTime(3599)).toBe('59:59');
    expect(formatTime(3600)).toBe('60:00');
  });

  it('truncates fractional seconds', () => {
    expect(formatTime(59.9)).toBe('0:59');
    expect(formatTime(1.2)).toBe('0:01');
  });
});

describe('formatSpec', () => {
  it('builds the two readout lines', () => {
    const info = { format: 'FLAC', sampleRate: 44100, bitDepth: '24-bit', channels: 2, size: 3_000_000 };
    expect(formatSpec(info, 30)).toEqual([
      'FLAC · 44.1 kHz · 24-bit · Stereo',
      '800 kbps avg · 0:30',
    ]);
  });

  it('reports whole kHz, mono, and multi-channel without a duration', () => {
    expect(formatSpec({ format: 'WAV', sampleRate: 48000, bitDepth: '16-bit', channels: 1, size: 1_000_000 }, 10))
      .toEqual(['WAV · 48 kHz · 16-bit · Mono', '800 kbps avg · 0:10']);
    expect(formatSpec({ format: 'WAV', sampleRate: 48000, channels: 6, size: 1 }, undefined))
      .toEqual(['WAV · 48 kHz · 6 ch', '']);
  });

  it('drops missing fields', () => {
    expect(formatSpec({ format: 'M4A', channels: 2, size: 0 }, 0)).toEqual(['M4A · Stereo', '']);
  });
});

describe('seeded', () => {
  it('reproduces the same sequence for the same seed', () => {
    const a = seeded(7);
    const b = seeded(7);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('differs across seeds and stays in (0, 1)', () => {
    expect(seeded(7)()).toBeCloseTo(117649 / 2147483647, 10);
    expect(seeded(11)()).not.toBe(seeded(7)());
    for (let seed = 1; seed <= 5; seed++) {
      for (let i = 0; i < 10; i++) {
        const v = seeded(seed)();
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(1);
      }
    }
  });
});

describe('noisyLine', () => {
  it('is deterministic and has one point per step', () => {
    expect(noisyLine(7, 1)).toBe(noisyLine(7, 1));
    const pts = noisyLine(7, 1).split(' ');
    expect(pts).toHaveLength(41);
  });

  it('keeps every point inside the 60×28 viewBox', () => {
    for (const p of noisyLine(7, 1).split(' ')) {
      const [x, y] = p.split(',').map(Number);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(60);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(28);
    }
  });

  it('slopes the pink sketch down to the right', () => {
    const last = p => Number(p.split(' ').pop().split(',')[1]);
    expect(last(PINK_LINE)).toBeGreaterThan(16); // base 21 near the right edge
    expect(last(WHITE_LINE)).toBeLessThan(13); //   base 9, stays level
  });

  it('grows 15 bounded wave bars', () => {
    expect(WAVE_BARS).toHaveLength(15);
    for (const h of WAVE_BARS) {
      expect(h).toBeGreaterThanOrEqual(2);
      expect(h).toBeLessThanOrEqual(24);
    }
  });
});