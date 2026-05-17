import { useRef, useState, useCallback } from 'react';

export function useAudioEngine() {
  const ctxRef = useRef(null);
  const bufferRef = useRef(null);
  const sourceRef = useRef(null);
  const gainRef = useRef(null);
  const startTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const volumeRef = useRef(0.8);
  const currentFiltersRef = useRef([]);
  const filterNodesRef = useRef([]);

  const [isLoaded, setIsLoaded] = useState(false);
  const [sampleRate, setSampleRate] = useState(48000);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [volume, setVolumeState] = useState(0.8);
  const [duration, setDuration] = useState(0);

  function getCtx() {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  }

  function buildFilterChain(ctx, filters, outputNode) {
    filterNodesRef.current = [];
    if (!filters || filters.length === 0) return outputNode;
    const nodes = filters.map(({ type, frequency, Q, gain }) => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = frequency;
      if (Q !== undefined) n.Q.value = Q;
      if (gain !== undefined) n.gain.value = gain;
      return n;
    });
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    nodes[nodes.length - 1].connect(outputNode);
    filterNodesRef.current = nodes;
    return nodes[0];
  }

  const getCurrentOffset = useCallback(() => {
    if (!bufferRef.current || !ctxRef.current) return 0;
    const elapsed = ctxRef.current.currentTime - startTimeRef.current;
    return (startOffsetRef.current + elapsed) % bufferRef.current.duration;
  }, []);

  const stopSource = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.onended = null;
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
      sourceRef.current = null;
    }
    filterNodesRef.current.forEach(n => { try { n.disconnect(); } catch {} });
    filterNodesRef.current = [];
    if (gainRef.current) {
      gainRef.current.disconnect();
      gainRef.current = null;
    }
  }, []);

  const play = useCallback((filters = [], fromOffset = undefined) => {
    if (!bufferRef.current) return;
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const offset = fromOffset !== undefined ? fromOffset
      : (sourceRef.current ? getCurrentOffset() : startOffsetRef.current);
    stopSource();
    currentFiltersRef.current = filters;

    const gainNode = ctx.createGain();
    gainNode.gain.value = volumeRef.current;
    gainNode.connect(ctx.destination);
    gainRef.current = gainNode;

    const chainInput = buildFilterChain(ctx, filters, gainNode);

    const source = ctx.createBufferSource();
    source.buffer = bufferRef.current;
    source.loop = true;
    source.connect(chainInput);
    source.onended = () => {
      if (sourceRef.current === source) {
        setIsPlaying(false);
        sourceRef.current = null;
      }
    };

    startTimeRef.current = ctx.currentTime;
    startOffsetRef.current = offset;
    source.start(0, offset);
    sourceRef.current = source;
    setIsPlaying(true);
  }, [getCurrentOffset, stopSource]);

  const stop = useCallback(() => {
    startOffsetRef.current = sourceRef.current ? getCurrentOffset() : startOffsetRef.current;
    stopSource();
    setIsPlaying(false);
  }, [getCurrentOffset, stopSource]);

  const setVolume = useCallback((v) => {
    volumeRef.current = v;
    setVolumeState(v);
    if (gainRef.current) gainRef.current.gain.value = v;
  }, []);

  const seek = useCallback((offset) => {
    if (sourceRef.current) {
      play(currentFiltersRef.current, offset);
    } else {
      startOffsetRef.current = offset;
    }
  }, [play]);

  const loadBuffer = useCallback(async (source) => {
    setIsLoading(true);
    setIsLoaded(false);
    setLoadError(null);
    setDuration(0);
    startOffsetRef.current = 0;
    stopSource();
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
  }, [stopSource]);

  return {
    isLoaded, isLoading, isPlaying, loadError,
    play, stop, loadBuffer, getCtx,
    volume, setVolume,
    seek, getCurrentOffset,
    duration, sampleRate,
  };
}
