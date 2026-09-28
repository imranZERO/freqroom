import { describe, it, expect, vi } from 'vitest';
import { getSourceBuffer, prepareSources, LOOP_IDS } from '../src/lib/sourceCache.js';
import { renderLoop, generateBandLoop } from '../src/lib/musicGen.js';

// Same fake AudioContext shape as the generator tests
function fakeCtx(sampleRate = 8000) {
  return {
    sampleRate,
    createBuffer: vi.fn((channels, length, sr) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate: sr, getChannelData: i => data[i] };
    }),
  };
}

describe('getSourceBuffer', () => {
  it('builds each source once per context and reuses it', async () => {
    const ctx = fakeCtx();
    const a = await getSourceBuffer('band', ctx);
    const b = await getSourceBuffer('band', ctx);
    expect(b).toBe(a);
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
  });

  it('shares one build between requests made while it is still running', () => {
    const ctx = fakeCtx();
    expect(getSourceBuffer('drums', ctx)).toBe(getSourceBuffer('drums', ctx));
  });

  it('keeps separate buffers for separate contexts (and sample rates)', async () => {
    const a = await getSourceBuffer('pink', fakeCtx(8000));
    const b = await getSourceBuffer('pink', fakeCtx(16000));
    expect(b).not.toBe(a);
    expect(b.sampleRate).toBe(16000);
  });

  it('renders the loops identically to generating them directly (no Worker here, so it falls back)', async () => {
    const ctx = fakeCtx();
    const cached = await getSourceBuffer('band', ctx);
    const direct = generateBandLoop(fakeCtx());
    expect(cached.getChannelData(0)).toEqual(direct.getChannelData(0));
    expect(cached.getChannelData(1)).toEqual(direct.getChannelData(1));
  });

  it('rejects an unknown source without caching the failure', async () => {
    await expect(getSourceBuffer('nope', fakeCtx())).rejects.toThrow('Unknown source');
  });
});

describe('prepareSources', () => {
  it('starts building the music loops so a later request is already cached', async () => {
    const ctx = fakeCtx();
    prepareSources(ctx);
    const prepared = await Promise.all(LOOP_IDS.map(id => getSourceBuffer(id, ctx)));
    expect(ctx.createBuffer).toHaveBeenCalledTimes(LOOP_IDS.length);
    for (const buf of prepared) expect(buf.numberOfChannels).toBe(2);
  });
});

describe('renderLoop', () => {
  it('returns plain channel arrays (so it can run in a worker)', () => {
    const { L, R } = renderLoop('drums', 8000);
    expect(L).toBeInstanceOf(Float32Array);
    expect(R.length).toBe(L.length);
    expect(L.length).toBe(Math.round(19.2 * 8000));
  });
});
