// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/preact';
import { useAudioEngine, DEFAULT_VOLUME } from '../src/hooks/useAudioEngine.js';
import { load } from '../src/lib/storage.js';
import { FakeAudioContext, mkBuffer } from '../test/fake-audio-context.js';

beforeEach(() => {
  globalThis.AudioContext = FakeAudioContext;
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Renders the hook; re-render and read result.current again after a state
// change to see the updated values.
function mount() {
  const utils = renderHook(() => useAudioEngine());
  const live = () => { utils.rerender(); return utils.result.current; };
  return { engine: utils.result.current, live };
}

const peaking = (frequency, Q = 1.4, gain = 6) => ({ type: 'peaking', frequency, Q, gain });

describe('useAudioEngine', () => {
  describe('graph and crossfade', () => {
    it('builds the persistent graph once and crossfades between flat and EQ', async () => {
      const { engine } = mount();
      expect(engine.getCtx()).toBe(engine.getCtx());

      await engine.loadBuffer(mkBuffer(10));
      const ctx = engine.getCtx();

      await engine.play([peaking(1000)]);
      // input, flat, eqOut, master + the per-source voice
      expect(ctx.gains).toHaveLength(5);
      expect(ctx.biquads).toHaveLength(1);
      const [input, flat, eqOut, master, voice] = ctx.gains;

      // EQ path up, flat path down
      expect(flat.gain.targetValues()).toEqual([0]);
      expect(eqOut.gain.targetValues()).toEqual([1]);
      expect(voice.gain.targetValues()).toEqual([1]);
      expect(master.gain.value).toBe(DEFAULT_VOLUME);

      // flat path: input → flat → master and EQ path: input → biquad → eqOut → master,
      // master → limiter → destination
      expect(input.connections).toContain(flat);
      expect(input.connections).toContain(ctx.biquads[0]);
      expect(ctx.biquads[0].connections).toContain(eqOut);
      expect(flat.connections).toContain(master);
      expect(eqOut.connections).toContain(master);
      expect(master.connections).toContain(ctx.compressors[0]);
      expect(ctx.compressors[0].connections).toContain(ctx.destination);

      const limiter = ctx.compressors[0];
      expect(limiter.threshold.value).toBe(-1);
      expect(limiter.knee.value).toBe(0);
      expect(limiter.ratio.value).toBe(20);
      expect(limiter.attack.value).toBe(0.001);
      expect(limiter.release.value).toBe(0.1);

      // Switching back to Flat crossfades; the source and graph are reused
      await engine.play([]);
      expect(flat.gain.targetValues()).toEqual([0, 1]);
      expect(eqOut.gain.targetValues()).toEqual([1, 0]);
      expect(ctx.sources).toHaveLength(1);
      expect(ctx.biquads).toHaveLength(1);
      expect(ctx.gains).toHaveLength(5);
    });

    it('ramps matching filter layouts in place so Gain/Q edits are live', async () => {
      const { engine } = mount();
      await engine.loadBuffer(mkBuffer(10));
      const ctx = engine.getCtx();

      await engine.play([peaking(1000)]);
      const node = ctx.biquads[0];
      expect(node.type).toBe('peaking');
      expect(node.frequency.value).toBe(1000);
      expect(node.Q.value).toBe(1.4);
      expect(node.gain.value).toBe(6);

      await engine.play([peaking(400, 0.8, -4)]);
      expect(ctx.biquads).toHaveLength(1);
      expect(node.frequency.targetValues()).toEqual([400]);
      expect(node.Q.targetValues()).toEqual([0.8]);
      expect(node.gain.targetValues()).toEqual([-4]);
      // same chain still wired from input through the node to eqOut
      expect(ctx.gains[0].connections).toContain(node);
      expect(node.connections).toContain(ctx.gains[2]);
    });

    it('leaves Q alone for filters that do not use it (shelves)', async () => {
      const { engine } = mount();
      await engine.loadBuffer(mkBuffer(10));
      const ctx = engine.getCtx();

      const shelf = (frequency, gain) => ({ type: 'lowshelf', frequency, gain });
      await engine.play([shelf(200, 5)]);
      const node = ctx.biquads[0];
      await engine.play([shelf(300, -5)]);
      expect(ctx.biquads).toHaveLength(1);
      expect(node.frequency.targetValues()).toEqual([300]);
      expect(node.gain.targetValues()).toEqual([-5]);
      expect(node.Q.targetValues()).toEqual([]);
    });

    it('rebuilds the biquad chain when the filter layout changes', async () => {
      const { engine } = mount();
      await engine.loadBuffer(mkBuffer(10));
      const ctx = engine.getCtx();

      await engine.play([peaking(1000)]);
      const old = ctx.biquads[0];
      await engine.play([peaking(500), peaking(2000)]);

      // the old node stays created but leaves the graph
      expect(ctx.biquads).toHaveLength(3);
      expect(ctx.gains[0].connections).not.toContain(old);
      expect(old.connections).toEqual([]);
      // new chain: input → b0 → b1 → eqOut
      expect(ctx.gains[0].connections).toContain(ctx.biquads[1]);
      expect(ctx.biquads[1].connections).toContain(ctx.biquads[2]);
      expect(ctx.biquads[2].connections).toContain(ctx.gains[2]);
    });

    it('falls back to cancelScheduledValues when cancelAndHoldAtTime is missing', async () => {
      const { engine } = mount();
      await engine.loadBuffer(mkBuffer(10));
      const ctx = engine.getCtx();

      await engine.play([]);
      const flat = ctx.gains[1];
      delete flat.gain.cancelAndHoldAtTime;

      await engine.play([peaking(1000)]);
      expect(flat.gain.calls).toContainEqual(['cancel', 0]);
      expect(flat.gain.calls.some(c => c[0] === 'value' && c[1] === 1)).toBe(true);
      expect(flat.gain.targetValues()).toContain(0);
    });
  });

  describe('position, seeking and loops', () => {
    it('reports playback position and wraps it at the buffer end', async () => {
      const { engine } = mount();
      await engine.loadBuffer(mkBuffer(10));
      const ctx = engine.getCtx();

      await engine.play([], 0);
      expect(engine.getCurrentOffset()).toBe(0);
      ctx.currentTime = 3.25;
      expect(engine.getCurrentOffset()).toBeCloseTo(3.25, 6);
      ctx.currentTime = 12.5;
      expect(engine.getCurrentOffset()).toBeCloseTo(2.5, 6);
      ctx.currentTime = 23.5;
      expect(engine.getCurrentOffset()).toBeCloseTo(3.5, 6);
    });

    it('wraps within a loop region without restarting playback', async () => {
      const { engine, live } = mount();
      await engine.loadBuffer(mkBuffer(10));
      const ctx = engine.getCtx();

      await engine.play([], 3); // inside the future loop region
      engine.setLoop(2, 5);
      expect(live().loop).toEqual({ start: 2, end: 5 });
      expect(ctx.sources).toHaveLength(1); // position inside → no restart
      const src = ctx.sources[0];
      expect(src.loopStart).toBe(2);
      expect(src.loopEnd).toBe(5);

      // 3s played (3 + 3) crosses loop.end(5) → wraps to 2 + ((6 − 2) % 3) = 3
      ctx.currentTime = 3;
      expect(engine.getCurrentOffset()).toBeCloseTo(3, 6);
    });

    it('snaps an out-of-region position to the loop start', async () => {
      const { engine } = mount();
      await engine.loadBuffer(mkBuffer(10));
      const ctx = engine.getCtx();

      await engine.play([], 8);
      engine.setLoop(2, 5); // 8 is past the region end
      expect(ctx.sources).toHaveLength(2); // restarted at the loop start
      expect(ctx.sources[0].stopped).toHaveLength(1);
      expect(ctx.sources[1].started[0][1]).toBe(2);
      expect(ctx.sources[1].loopStart).toBe(2);
      expect(ctx.sources[1].loopEnd).toBe(5);

      ctx.currentTime = 4;
      expect(engine.getCurrentOffset()).toBeCloseTo(3, 6);
    });

    it('clamps a seek to the end just inside the buffer so a sample plays', async () => {
      const { engine } = mount();
      await engine.loadBuffer(mkBuffer(10));
      const ctx = engine.getCtx();

      await engine.play([], 0);
      engine.seek(10); // exactly the end → dead-ends without the clamp
      expect(ctx.sources).toHaveLength(2);
      expect(ctx.sources[1].started[0][1]).toBeCloseTo(10 - 1 / 48000, 6);

      engine.seek(25); // way past the end
      expect(ctx.sources).toHaveLength(3);
      expect(ctx.sources[2].started[0][1]).toBeCloseTo(10 - 1 / 48000, 6);
    });

    it('records the position when stopped and seeks to it on the next play', async () => {
      const { engine, live } = mount();
      await engine.loadBuffer(mkBuffer(10));
      const ctx = engine.getCtx();

      await engine.play([], 0);
      ctx.currentTime = 4;
      engine.stop();
      const voice = ctx.gains[4];
      ctx.sources[0].onended(); // fadeOut teardown
      expect(voice.connections).toEqual([]);
      expect(ctx.sources[0].stopped).toHaveLength(1);
      expect(live().isPlaying).toBe(false);
      expect(engine.getCurrentOffset()).toBeCloseTo(4, 6);

      engine.seek(7); // while stopped → just records the offset
      expect(engine.getCurrentOffset()).toBeCloseTo(7, 6);

      await engine.play();
      expect(ctx.sources).toHaveLength(2);
      expect(ctx.sources[1].started[0][1]).toBe(7);
    });
  });

  describe('volume', () => {
    it('starts from the saved volume, persists changes and ramps the master gain', async () => {
      localStorage.setItem('freqroom:volume', JSON.stringify(0.2));
      const { engine, live } = mount();
      expect(engine.volume).toBe(0.2);

      await engine.loadBuffer(mkBuffer(10));
      await engine.play([]);
      const ctx = engine.getCtx();
      expect(ctx.gains[3].gain.value).toBe(0.2);

      engine.setVolume(0.75);
      expect(ctx.gains[3].gain.targetValues()).toEqual([0.75]);
      expect(load('volume', DEFAULT_VOLUME)).toBe(0.75);
      expect(live().volume).toBe(0.75);
    });
  });

  describe('loadBuffer', () => {
    it('accepts an AudioBuffer-like object and resets loop and position', async () => {
      const { engine, live } = mount();
      await engine.loadBuffer(mkBuffer(10));
      const ctx = engine.getCtx();

      await engine.play([], 4);
      engine.setLoop(2, 8);
      expect(ctx.sources).toHaveLength(1);

      await engine.loadBuffer(mkBuffer(20));
      expect(ctx.sources[0].stopped).toHaveLength(1);
      expect(engine.getCurrentOffset()).toBe(0);
      expect(live()).toMatchObject({ isLoaded: true, duration: 20, loop: null, isLoading: false, sampleRate: 48000 });
    });

    it('decodes a File through the context', async () => {
      const { engine, live } = mount();
      await engine.loadBuffer(mkBuffer(10));
      const ctx = engine.getCtx();
      ctx.decoded = mkBuffer(7.5);

      const file = new File([new Uint8Array(8)], 'loop.wav');
      Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(8) });
      await engine.loadBuffer(file);

      expect(live()).toMatchObject({ isLoaded: true, duration: 7.5, loadError: null });
    });

    it('fetches a URL and surfaces HTTP failures', async () => {
      const { engine, live } = mount();
      await engine.loadBuffer(mkBuffer(10));
      const ctx = engine.getCtx();
      ctx.decoded = mkBuffer(6);

      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
      await engine.loadBuffer('/audio/hit.wav');
      expect(live()).toMatchObject({ isLoaded: true, duration: 6, loadError: null });

      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
      await engine.loadBuffer('/missing.wav');
      expect(live()).toMatchObject({ isLoaded: false, loadError: 'HTTP 404', isLoading: false });
    });

    it('reports decode errors and always clears the loading state', async () => {
      const { engine, live } = mount();
      await engine.loadBuffer(mkBuffer(10));
      const ctx = engine.getCtx();
      ctx.decodeAudioData = async () => { throw new Error('decode failed'); };
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));

      await engine.loadBuffer('/bad.wav');
      expect(live()).toMatchObject({ isLoaded: false, loadError: 'decode failed', isLoading: false });
    });
  });

  describe('context lifecycle', () => {
    it('resumes a suspended context on play and recreates a closed one', async () => {
      const { engine } = mount();
      await engine.loadBuffer(mkBuffer(10));
      const ctx = engine.getCtx();

      const resume = vi.fn(() => { ctx.state = 'running'; return Promise.resolve(); });
      ctx.resume = resume;
      ctx.state = 'suspended';
      await engine.play([]);
      expect(resume).toHaveBeenCalledTimes(1);

      ctx.state = 'closed';
      const next = engine.getCtx();
      expect(next).not.toBe(ctx);
      expect(next.state).toBe('running');

      // graph and source state are scoped to their context: the rebuilt graph
      // gets its own nodes and a fresh source starts rather than resuming the
      // dead context's voice
      await engine.play([peaking(1000)]);
      expect(next.gains).toHaveLength(5);
      expect(next.biquads).toHaveLength(1);
      expect(next.sources).toHaveLength(1);
    });
  });
});