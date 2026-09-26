// Minimal Web Audio fakes for useAudioEngine: just enough of AudioContext,
// AudioParam and the node types the engine uses to exercise its graph building,
// ramps and source bookkeeping. Tests drive ctx.currentTime directly and
// inspect the call logs on parameters and the connect graphs on nodes.

export class FakeParam {
  constructor(value = 0) {
    this.value = value;
    this.calls = [];
    // Own property so a test can delete it to exercise the fallback path
    this.cancelAndHoldAtTime = t => this.calls.push(['hold', t]);
  }
  setValueAtTime(v, t) { this.calls.push(['value', v, t]); }
  setTargetAtTime(v, t, tc) { this.calls.push(['target', v, t, tc]); }
  cancelScheduledValues(t) { this.calls.push(['cancel', t]); }
  // Values pushed to setTargetAtTime, in order
  targetValues() {
    return this.calls.filter(c => c[0] === 'target').map(c => c[1]);
  }
}

export class FakeNode {
  constructor(ctx, kind) {
    this.context = ctx;
    this.kind = kind;
    this.connections = [];
  }
  connect(target) { this.connections.push(target); return target; }
  disconnect(target) {
    if (target === undefined) this.connections = [];
    else this.connections = this.connections.filter(n => n !== target);
  }
}

export function mkBuffer(duration) {
  return {
    duration,
    numberOfChannels: 2,
    getChannelData: () => new Float32Array(0),
  };
}

export class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.destination = new FakeNode(this, 'destination');
    this.gains = [];
    this.biquads = [];
    this.sources = [];
    this.compressors = [];
    // What decodeAudioData resolves with; tests set this before loading
    this.decoded = null;
  }

  createGain() {
    const n = new FakeNode(this, 'gain');
    n.gain = new FakeParam(1);
    this.gains.push(n);
    return n;
  }

  createDynamicsCompressor() {
    const n = new FakeNode(this, 'compressor');
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) {
      n[k] = new FakeParam(0);
    }
    this.compressors.push(n);
    return n;
  }

  createAnalyser() {
    const n = new FakeNode(this, 'analyser');
    n.fftSize = 2048;
    n.smoothingTimeConstant = 0.8;
    Object.defineProperty(n, 'frequencyBinCount', { get: () => n.fftSize / 2 });
    n.getFloatFrequencyData = arr => arr.fill(-60);
    this.analysers = [...(this.analysers ?? []), n];
    return n;
  }

  createBiquadFilter() {
    const n = new FakeNode(this, 'biquad');
    n.type = 'lowpass';
    n.frequency = new FakeParam(350);
    n.Q = new FakeParam(1);
    n.gain = new FakeParam(0);
    this.biquads.push(n);
    return n;
  }

  createBufferSource() {
    const n = new FakeNode(this, 'source');
    n.buffer = null;
    n.loop = false;
    n.loopStart = 0;
    n.loopEnd = 0;
    n.onended = null;
    n.started = [];
    n.stopped = [];
    n.start = (when, offset) => { n.started.push([when, offset]); };
    n.stop = when => { n.stopped.push(when); };
    this.sources.push(n);
    return n;
  }

  resume() { this.state = 'running'; return Promise.resolve(); }

  decodeAudioData(_ab) { return Promise.resolve(this.decoded); }
}