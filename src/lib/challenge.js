// Shareable challenge links: ?mode=cut&gain=3&q=2&source=pink&level=5
// Only valid values are kept, so a hand-edited or stale link degrades gracefully.

const SOURCES = ['pink', 'white'];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function parseChallenge(search, modeIds) {
  const p = new URLSearchParams(search);
  const out = {};
  if (modeIds.includes(p.get('mode'))) out.mode = p.get('mode');
  if (SOURCES.includes(p.get('source'))) out.source = p.get('source');
  const gain = parseInt(p.get('gain'), 10);
  if (Number.isFinite(gain)) out.gainDb = clamp(gain, 1, 18);
  const q = parseFloat(p.get('q'));
  if (Number.isFinite(q)) out.q = Math.round(clamp(q, 0.5, 8) * 10) / 10;
  const level = parseInt(p.get('level'), 10);
  if (out.mode && Number.isFinite(level)) out.level = clamp(level, 1, 15);
  return Object.keys(out).length ? out : null;
}

export function buildChallengeUrl({ mode, gainDb, q, source, level }) {
  const p = new URLSearchParams();
  p.set('mode', mode);
  if (gainDb !== undefined) p.set('gain', String(gainDb));
  if (q !== undefined) p.set('q', String(q));
  if (SOURCES.includes(source)) p.set('source', source);
  if (level !== undefined) p.set('level', String(level));
  return `${location.origin}/?${p}`;
}

// Clipboard needs a secure context; fall back to a prompt the user can copy from
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt('Copy this challenge link:', text);
    return false;
  }
}
