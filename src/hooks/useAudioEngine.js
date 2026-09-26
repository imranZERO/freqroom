import { useRef, useState, useCallback } from 'react';
import { load, save } from '../lib/storage.js';
import { clampStartOffset, clampToLoopOffset } from '../lib/audioEngineMath.js';

// Time constant for setTargetAtTime ramps; ~5 time constants to settle (≈25 ms)
const RAMP_TC = 0.005;
export const DEFAULT_VOLUME = 0.5;
const FADE_STOP = 0.05;

function rampTo(param, value, t) {
  if (param.cancelAndHoldAtTime) {
    param.cancelAndHoldAtTime(t);
  } else {
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
  }
  param.setTargetAtTime(value, t, RAMP_TC);
}

// Analyser FFT size: 8192 bins over 0–24 kHz at 48 kHz, ~3 Hz apart, so the
// spectrum still resolves the lowest octaves
const ANALYSER_FFT = 16384;

// Persistent graph, built once per AudioContext:
//   voice(s) → input ─┬─ flat ─────────────┬─ analyser → master(volume) → limiter → destination
//                     └─ eqChain → eqOut ──┘
// The analyser sits inline (it passes audio through unchanged) so it is always
// processed; it sees what you hear before the volume fader, for the graph's
// live spectrum.
// Switching EQ/flat crossfades flat/eqOut instead of restarting the source.
function createGraph(ctx, volume) {
  const input = ctx.createGain();
  const flat = ctx.createGain();
  const eqOut = ctx.createGain();
  const master = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  const analyser = ctx.createAnalyser();

  flat.gain.value = 1;
  eqOut.gain.value = 0;
  master.gain.value = volume;
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;
  analyser.fftSize = ANALYSER_FFT;
  analyser.smoothingTimeConstant = 0.8;

  input.connect(flat);
  input.connect(eqOut);
  flat.connect(analyser);
  eqOut.connect(analyser);
  analyser.connect(master);
  master.connect(limiter);
  limiter.connect(ctx.destination);

  return { ctx, input, flat, eqOut, analyser, master, eqNodes: [] };
}

export function useAudioEngine() {
  const ctxRef = useRef(null);
  const graphRef = useRef(null);
  const bufferRef = useRef(null);
  const sourceRef = useRef(null);
  const voiceRef = useRef(null);
  const startTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const volumeRef = useRef(load('volume', DEFAULT_VOLUME));
  const currentFiltersRef = useRef([]);
  // Optional { start, end } region the source loops within (seconds)
  const loopRef = useRef(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [sampleRate, setSampleRate] = useState(48000);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [volume, setVolumeState] = useState(volumeRef.current);
  const [duration, setDuration] = useState(0);
  const [loop, setLoopState] = useState(null);

  function getCtx() {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext();
      // The closed context's graph, source and voice are gone; the next play
      // must build a fresh graph and start a new source instead of resuming a
      // dead voice.
      graphRef.current = null;
      sourceRef.current = null;
      voiceRef.current = null;
    }
    return ctxRef.current;
  }

  function getGraph(ctx) {
    if (!graphRef.current || graphRef.current.ctx !== ctx) {
      graphRef.current = createGraph(ctx, volumeRef.current);
    }
    return graphRef.current;
  }

  // Updates the EQ path. Matching filter layouts are ramped in place so
  // Gain/Q changes are heard live; otherwise the biquad chain is rebuilt.
  function applyFilters(graph, filters) {
    const { ctx, input, eqOut } = graph;
    const now = ctx.currentTime;
    const sameLayout = graph.eqNodes.length === filters.length
      && graph.eqNodes.every((n, i) => n.type === filters[i].type);

    if (sameLayout) {
      filters.forEach(({ frequency, Q, gain }, i) => {
        const n = graph.eqNodes[i];
        rampTo(n.frequency, frequency, now);
        if (Q !== undefined) rampTo(n.Q, Q, now);
        if (gain !== undefined) rampTo(n.gain, gain, now);
      });
      return;
    }

    if (graph.eqNodes.length) input.disconnect(graph.eqNodes[0]);
    else input.disconnect(eqOut);
    graph.eqNodes.forEach(n => n.disconnect());

    const nodes = filters.map(({ type, frequency, Q, gain }) => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = frequency;
      if (Q !== undefined) n.Q.value = Q;
      if (gain !== undefined) n.gain.value = gain;
      return n;
    });
    const chain = [input, ...nodes, eqOut];
    for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
    graph.eqNodes = nodes;
  }

  // Playback position. The source plays linearly from startOffset; with a loop
  // region it wraps back to loop.start each time it reaches loop.end.
  const getCurrentOffset = useCallback(() => {
    if (!bufferRef.current || !ctxRef.current) return 0;
    if (!sourceRef.current) return startOffsetRef.current;
    const pos = startOffsetRef.current + (ctxRef.current.currentTime - startTimeRef.current);
    const region = loopRef.current;
    if (region && pos >= region.end) return region.start + ((pos - region.start) % (region.end - region.start));
    return pos % bufferRef.current.duration;
  }, []);

  // Fades the current source out and stops it; the graph is kept for reuse.
  const fadeOutSource = useCallback(() => {
    const source = sourceRef.current;
    const voice = voiceRef.current;
    if (!source) return;
    const now = source.context.currentTime;
    rampTo(voice.gain, 0, now);
    source.onended = () => voice.disconnect();
    try { source.stop(now + FADE_STOP); } catch { /* already stopped */ }
    sourceRef.current = null;
    voiceRef.current = null;
  }, []);

  function startSource(graph, offset) {
    const { ctx, input } = graph;
    const dur = bufferRef.current.duration;
    offset = clampStartOffset(offset, dur, ctx.sampleRate);
    const voice = ctx.createGain();
    voice.gain.value = 0;
    voice.connect(input);

    const source = ctx.createBufferSource();
    source.buffer = bufferRef.current;
    source.loop = true;
    if (loopRef.current) {
      source.loopStart = loopRef.current.start;
      source.loopEnd = loopRef.current.end;
      offset = clampToLoopOffset(offset, loopRef.current);
    }
    source.connect(voice);

    startTimeRef.current = ctx.currentTime;
    startOffsetRef.current = offset;
    source.start(0, offset);
    rampTo(voice.gain, 1, ctx.currentTime);
    sourceRef.current = source;
    voiceRef.current = voice;
  }

  const play = useCallback(async (filters = [], fromOffset = undefined) => {
    if (!bufferRef.current) return;
    const ctx = getCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    const graph = getGraph(ctx);

    currentFiltersRef.current = filters;
    const useEq = filters.length > 0;
    if (useEq) applyFilters(graph, filters);
    rampTo(graph.flat.gain, useEq ? 0 : 1, ctx.currentTime);
    rampTo(graph.eqOut.gain, useEq ? 1 : 0, ctx.currentTime);

    if (fromOffset !== undefined) {
      fadeOutSource();
      startSource(graph, fromOffset);
    } else if (!sourceRef.current) {
      startSource(graph, startOffsetRef.current);
    }
    setIsPlaying(true);
  }, [fadeOutSource]);

  const stop = useCallback(() => {
    if (sourceRef.current) startOffsetRef.current = getCurrentOffset();
    fadeOutSource();
    setIsPlaying(false);
  }, [getCurrentOffset, fadeOutSource]);

  const setVolume = useCallback((v) => {
    volumeRef.current = v;
    setVolumeState(v);
    save('volume', v);
    const graph = graphRef.current;
    if (graph) rampTo(graph.master.gain, v, graph.ctx.currentTime);
  }, []);

  const seek = useCallback((offset) => {
    if (sourceRef.current) {
      play(currentFiltersRef.current, offset);
    } else {
      startOffsetRef.current = clampToLoopOffset(offset, loopRef.current);
    }
  }, [play]);

  // Loop playback within [start, end] seconds; pass null to loop the whole buffer
  const setLoop = useCallback((start, end) => {
    const region = start !== null && end - start >= 0.1 ? { start, end } : null;
    // Re-anchor position tracking at the current point before the loop changes
    const source = sourceRef.current;
    if (source) {
      startOffsetRef.current = getCurrentOffset();
      startTimeRef.current = source.context.currentTime;
    }
    loopRef.current = region;
    setLoopState(region);
    if (source) {
      source.loopStart = region ? region.start : 0;
      source.loopEnd = region ? region.end : 0;
      const pos = startOffsetRef.current;
      if (region && (pos < region.start || pos >= region.end)) play(currentFiltersRef.current, region.start);
    } else {
      startOffsetRef.current = clampToLoopOffset(startOffsetRef.current, loopRef.current);
    }
  }, [getCurrentOffset, play]);

  const loadBuffer = useCallback(async (source) => {
    setIsLoading(true);
    setIsLoaded(false);
    setLoadError(null);
    setDuration(0);
    fadeOutSource();
    startOffsetRef.current = 0;
    loopRef.current = null;
    setLoopState(null);
    setIsPlaying(false);

    try {
      const ctx = getCtx();
      setSampleRate(ctx.sampleRate);

      if (source && typeof source === 'object' && source.numberOfChannels !== undefined) {
        bufferRef.current = source;
        setDuration(source.duration);
        setIsLoaded(true);
        return;
      }

      let ab;
      if (source instanceof File) {
        ab = await source.arrayBuffer();
      } else {
        const resp = await fetch(source);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        ab = await resp.arrayBuffer();
      }
      bufferRef.current = await ctx.decodeAudioData(ab);
      setDuration(bufferRef.current.duration);
      setIsLoaded(true);
    } catch (e) {
      setLoadError(e.message || 'Failed to load audio');
    } finally {
      setIsLoading(false);
    }
  }, [fadeOutSource]);

  // The live analyser for the graph's spectrum (null until something has played)
  const getAnalyser = useCallback(() => graphRef.current?.analyser ?? null, []);

  return {
    isLoaded, isLoading, isPlaying, loadError,
    play, stop, loadBuffer, getCtx, getAnalyser,
    volume, setVolume,
    seek, getCurrentOffset,
    loop, setLoop,
    duration, sampleRate,
  };
}
