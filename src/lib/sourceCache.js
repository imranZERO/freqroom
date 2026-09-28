// Built-in sources are generated once per AudioContext and reused, so picking
// one again is instant. The music loops (the slow ones) render in a Web Worker
// when one is available, and can be prepared in the background ahead of a click.
import { generatePinkNoise, generateWhiteNoise } from './noiseGen.js';
import { renderLoop, loopBuffer } from './musicGen.js';

const NOISE = { pink: generatePinkNoise, white: generateWhiteNoise };
export const LOOP_IDS = ['drums', 'band'];

// AudioContext → Map(source id → Promise<AudioBuffer>)
const cache = new WeakMap();

let worker = null;
let workerFailed = false;
let nextJob = 0;
const jobs = new Map();   // job id → { resolve, kind, sampleRate }

function getWorker() {
  if (worker || workerFailed || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('./musicWorker.js', import.meta.url), { type: 'module' });
  } catch {
    workerFailed = true;
    return null;
  }
  worker.onmessage = ({ data: { id, L, R } }) => {
    jobs.get(id)?.resolve({ L, R });
    jobs.delete(id);
  };
  // If the worker can't run, finish its jobs here and stop using it
  worker.onerror = () => {
    workerFailed = true;
    worker.terminate();
    worker = null;
    for (const [id, job] of jobs) job.resolve(renderLoop(job.kind, job.sampleRate));
    jobs.clear();
  };
  return worker;
}

// A loop's channels, rendered in the worker if possible, otherwise right here
function renderLoopAsync(kind, sampleRate) {
  const w = getWorker();
  if (!w) return Promise.resolve(renderLoop(kind, sampleRate));
  return new Promise(resolve => {
    const id = nextJob++;
    jobs.set(id, { resolve, kind, sampleRate });
    w.postMessage({ id, kind, sampleRate });
  });
}

async function build(id, ctx) {
  if (NOISE[id]) return NOISE[id](ctx);
  if (LOOP_IDS.includes(id)) return loopBuffer(ctx, await renderLoopAsync(id, ctx.sampleRate));
  throw new Error(`Unknown source: ${id}`);
}

// The AudioBuffer for a built-in source; the first request builds it, later
// ones (and requests while it's building) share the same promise
export function getSourceBuffer(id, ctx) {
  let byId = cache.get(ctx);
  if (!byId) cache.set(ctx, (byId = new Map()));
  if (!byId.has(id)) {
    const p = build(id, ctx);
    // A failed build shouldn't be cached forever
    p.catch(() => byId.delete(id));
    byId.set(id, p);
  }
  return byId.get(id);
}

// Starts building sources in the background so a later click is instant
export function prepareSources(ctx, ids = LOOP_IDS) {
  for (const id of ids) getSourceBuffer(id, ctx).catch(() => {});
}
