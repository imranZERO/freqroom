import { describe, it, expect } from 'vitest';
import { probeAudioFile } from '../src/lib/audioInfo.js';

// A stand-in for a browser File: probeAudioFile only needs slice() and name.
function fakeFile(bytes, name = 'track') {
  const u8 = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  return {
    name,
    size: u8.length,
    slice: (start, end) => ({
      arrayBuffer: async () => u8.slice(start, end).buffer,
    }),
  };
}

// Byte-writing helpers (little-endian, matching the DataView defaults in audioInfo.js)
const u16 = (b, o, v) => { b[o] = v & 0xff; b[o + 1] = (v >>> 8) & 0xff; };
const u32 = (b, o, v) => { b[o] = v & 0xff; b[o + 1] = (v >>> 8) & 0xff; b[o + 2] = (v >>> 16) & 0xff; b[o + 3] = (v >>> 24) & 0xff; };
const ascii = (b, o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };

function wavPcm({ rate = 44100, channels = 2, bits = 16, fmt = 1, extensible = false } = {}) {
  const size = 36 + (extensible ? 24 : 0);
  const b = new Uint8Array(size + 8);
  ascii(b, 0, 'RIFF'); u32(b, 4, size + 4); ascii(b, 8, 'WAVE');
  ascii(b, 12, 'fmt '); u32(b, 16, extensible ? 40 : 16);
  u16(b, 20, fmt); u16(b, 22, channels); u32(b, 24, rate);
  u32(b, 28, rate * channels * (bits / 8)); u16(b, 32, channels * (bits / 8)); u16(b, 34, bits);
  if (extensible) {
    u16(b, 36, 22); u16(b, 38, bits); u32(b, 40, 0); // cbSize, validBits, channelMask
    u16(b, 44, 1); // sub-format GUID begins with the real tag (PCM)
  }
  return b;
}

function flacHeader({ rate = 48000, channels = 2, bps = 24 } = {}) {
  const b = new Uint8Array(42);
  ascii(b, 0, 'fLaC');
  b[4] = 0x80; b[5] = 0x00; b[6] = 0x00; b[7] = 0x22; // last STREAMINFO block, 34 bytes
  // STREAMINFO: 4 bytes blocksize + 6 bytes framesize, then 8 bytes of packed specs
  const sr20 = rate & 0xFFFFF; // 20-bit sample rate
  b[18] = sr20 >> 12;
  b[19] = (sr20 >> 4) & 0xff;
  b[20] = ((sr20 & 0xF) << 4) | ((channels - 1) << 1) | (((bps - 1) >> 4) & 1);
  b[21] = ((bps - 1) & 0x0F) << 4;
  return b;
}

function oggPacket(kind) {
  // 'OggS' + 27-byte header (byte 26 = one segment) + a single segment-table byte
  const b = new Uint8Array(80);
  ascii(b, 0, 'OggS');
  b[26] = 1;
  b[27] = 30; // segment length (>= 16 keeps parseOgg happy)
  if (kind === 'vorbis') {
    ascii(b, 28, '\x01vorbis');
    // b[39] is channels (28 + 11), b[40..43] is sample rate (28 + 12)
    b[39] = 2; u32(b, 40, 44100);
  } else if (kind === 'opus') {
    ascii(b, 28, 'OpusHead');
    b[36] = 1; // version
    b[37] = 2; // channels (28 + 9)
    // u32 at 40 (28 + 12): input rate
  }
  return b;
}

function mpegFrame({ rate = 44100, mono = false } = {}) {
  const b = new Uint8Array(200);
  const rateIdx = rate === 44100 ? 0 : rate === 48000 ? 1 : 2;
  b[0] = 0xff;
  b[1] = 0xfb; // MPEG1, Layer III, no CRC
  b[2] = (3 << 4) | (rateIdx << 2); // bitrate idx 3 (128 kbps), sample-rate idx
  b[3] = mono ? 0xC0 : 0x00; // channel mode bits
  return b;
}

describe('probeAudioFile', () => {
  it('reads WAV PCM', async () => {
    const info = await probeAudioFile(fakeFile(wavPcm(), 'x.wav'));
    expect(info).toEqual({ format: 'WAV', channels: 2, sampleRate: 44100, bitDepth: '16-bit' });
  });

  it('reads WAV float and WAVE_FORMAT_EXTENSIBLE', async () => {
    const f = await probeAudioFile(fakeFile(wavPcm({ fmt: 3, rate: 96000, bits: 32 }), 'f.wav'));
    expect(f).toEqual({ format: 'WAV', channels: 2, sampleRate: 96000, bitDepth: '32-bit float' });
    const x = await probeAudioFile(fakeFile(wavPcm({ extensible: true, bits: 24, rate: 48000 }), 'x.wav'));
    expect(x).toEqual({ format: 'WAV', channels: 2, sampleRate: 48000, bitDepth: '24-bit' });
  });

  it('unpacks the FLAC STREAMINFO bit fields', async () => {
    const info = await probeAudioFile(fakeFile(flacHeader(), 'x.flac'));
    expect(info).toEqual({ format: 'FLAC', sampleRate: 48000, channels: 2, bitDepth: '24-bit' });
  });

  it('reads Ogg Vorbis and Opus identification headers', async () => {
    const v = await probeAudioFile(fakeFile(oggPacket('vorbis'), 'x.ogg'));
    expect(v).toEqual({ format: 'Ogg Vorbis', channels: 2, sampleRate: 44100 });
    const o = await probeAudioFile(fakeFile(oggPacket('opus'), 'x.opus'));
    // Opus with an input rate of 0 reports the 48 kHz decode rate
    expect(o).toEqual({ format: 'Opus', channels: 2, sampleRate: 48000 });
  });

  it('reports the Opus input rate when present', async () => {
    const b = oggPacket('opus');
    u32(b, 40, 22050); // 28 + 12
    const info = await probeAudioFile(fakeFile(b, 'x.opus'));
    expect(info).toEqual({ format: 'Opus', channels: 2, sampleRate: 22050 });
  });

  it('skips an ID3v2 tag to reach the MPEG frame', async () => {
    // 'ID3' + 3 tag bytes, syncsafe size 10 in bytes 6..9, then 10 filler bytes
    const b = new Uint8Array(220);
    ascii(b, 0, 'ID3');
    b[3] = 3; b[4] = 0; b[5] = 0;
    b[6] = 0; b[7] = 0; b[8] = 0; b[9] = 10;
    const frame = mpegFrame();
    b.set(frame, 20);
    const info = await probeAudioFile(fakeFile(b, 'x.mp3'));
    expect(info).toEqual({ format: 'MP3', sampleRate: 44100, channels: 2 });
  });

  it('reads a bare MPEG frame with no tag', async () => {
    const info = await probeAudioFile(fakeFile(mpegFrame({ mono: true, rate: 48000 }), 'x.mp3'));
    expect(info).toEqual({ format: 'MP3', sampleRate: 48000, channels: 1 });
  });

  it('recognises M4A by its ftyp box', async () => {
    const b = new Uint8Array(16);
    ascii(b, 0, '\x00\x00\x00 0');
    ascii(b, 4, 'ftyp'); // the probe checks bytes 4..8
    const info = await probeAudioFile(fakeFile(b, 'x.m4a'));
    expect(info).toEqual({ format: 'M4A' });
  });

  it('falls back to the file extension for unknown formats', async () => {
    const b = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(await probeAudioFile(fakeFile(b, 'song.xyz'))).toEqual({ format: 'XYZ' });
    const loose = await probeAudioFile(fakeFile(b, 'noext'));
    expect(loose.format).toBeNull();
  });
});