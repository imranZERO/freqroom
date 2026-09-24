// Pure playback-position helpers, lifted out of useAudioEngine so they can be
// unit-tested in isolation.

// Starting at/after the very end schedules no samples and dead-ends playback
// (the source keeps running but nothing is audible). Pull the offset just inside
// so the final sample plays and a loop can restart from the top.
export function clampStartOffset(offset, duration, sampleRate) {
  return offset >= duration ? Math.max(0, duration - 1 / sampleRate) : offset;
}

// Offsets outside a loop region snap to its start.
export function clampToLoopOffset(offset, region) {
  return region && (offset < region.start || offset >= region.end) ? region.start : offset;
}