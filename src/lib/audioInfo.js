// Reads format details from an audio file's header. decodeAudioData resamples
// to the AudioContext rate, so the original sample rate and bit depth are only
// available from the file itself. Returns { format, sampleRate, bitDepth,
// channels }, with any field null when the header doesn't say.

const ascii = (v, o, n) => String.fromCharCode(...new Uint8Array(v.buffer, v.byteOffset + o, n));

function parseWav(v) {
  if (ascii(v, 0, 4) !== 'RIFF' || ascii(v, 8, 4) !== 'WAVE') return null;
  for (let o = 12; o + 24 <= v.byteLength; o += 8 + v.getUint32(o + 4, true) + (v.getUint32(o + 4, true) & 1)) {
    if (ascii(v, o, 4) !== 'fmt ') continue;
    let fmt = v.getUint16(o + 8, true);
    // WAVE_FORMAT_EXTENSIBLE: the real format tag leads the sub-format GUID
    if (fmt === 0xfffe && o + 34 <= v.byteLength) fmt = v.getUint16(o + 32, true);
    const bits = v.getUint16(o + 22, true);
    return {
      format: 'WAV',
      channels: v.getUint16(o + 10, true),
      sampleRate: v.getUint32(o + 12, true),
      bitDepth: fmt === 3 ? `${bits}-bit float` : `${bits}-bit`,
    };
  }
  return { format: 'WAV' };
}

function parseFlac(v) {
  if (ascii(v, 0, 4) !== 'fLaC' || v.byteLength < 22) return null;
  // STREAMINFO body starts at byte 8; sample rate/channels/bps are bit-packed at +10
  const b = (i) => v.getUint8(8 + i);
  return {
    format: 'FLAC',
    sampleRate: (b(10) << 12) | (b(11) << 4) | (b(12) >> 4),
    channels: ((b(12) >> 1) & 7) + 1,
    bitDepth: `${(((b(12) & 1) << 4) | (b(13) >> 4)) + 1}-bit`,
  };
}

function parseOgg(v) {
  if (ascii(v, 0, 4) !== 'OggS' || v.byteLength < 28) return null;
  const p = 27 + v.getUint8(26); // first packet follows the segment table
  if (p + 16 > v.byteLength) return { format: 'OGG' };
  if (ascii(v, p, 7) === '\x01vorbis') {
    return { format: 'Ogg Vorbis', channels: v.getUint8(p + 11), sampleRate: v.getUint32(p + 12, true) };
  }
  if (ascii(v, p, 8) === 'OpusHead') {
    // Input rate is informational (Opus always decodes at 48 kHz); 0 means unknown
    return { format: 'Opus', channels: v.getUint8(p + 9), sampleRate: v.getUint32(p + 12, true) || 48000 };
  }
  return { format: 'OGG' };
}

const MP3_RATES = [44100, 48000, 32000];

// Scans for the first valid MPEG audio frame header
function parseMpeg(v) {
  for (let o = 0; o + 4 <= v.byteLength; o++) {
    const b1 = v.getUint8(o + 1), b2 = v.getUint8(o + 2);
    if (v.getUint8(o) !== 0xff || (b1 & 0xe0) !== 0xe0) continue;
    const version = (b1 >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer = (b1 >> 1) & 3;
    const rateIdx = (b2 >> 2) & 3;
    const bitrateIdx = b2 >> 4;
    if (version === 1 || layer === 0 || rateIdx === 3 || bitrateIdx === 0 || bitrateIdx === 15) continue;
    const divisor = version === 3 ? 1 : version === 2 ? 2 : 4;
    return {
      format: layer === 1 ? 'MP3' : `MPEG Layer ${4 - layer}`,
      sampleRate: MP3_RATES[rateIdx] / divisor,
      channels: (v.getUint8(o + 3) >> 6) === 3 ? 1 : 2,
    };
  }
  return null;
}

export async function probeAudioFile(file) {
  const read = async (start, len) => new DataView(await file.slice(start, start + len).arrayBuffer());
  let v = await read(0, 8192);

  const info = parseWav(v) || parseFlac(v) || parseOgg(v);
  if (info) return info;

  if (v.byteLength >= 8 && ascii(v, 4, 4) === 'ftyp') return { format: 'M4A' };

  // MP3: skip an ID3v2 tag (its size is a 28-bit syncsafe integer) to reach the first frame
  let offset = 0;
  if (v.byteLength >= 10 && ascii(v, 0, 3) === 'ID3') {
    offset = 10 + ((v.getUint8(6) << 21) | (v.getUint8(7) << 14) | (v.getUint8(8) << 7) | v.getUint8(9));
    v = await read(offset, 8192);
  }
  const mpeg = parseMpeg(v);
  if (mpeg) return mpeg;

  const ext = file.name.includes('.') ? file.name.split('.').pop().toUpperCase() : null;
  return { format: ext };
}
