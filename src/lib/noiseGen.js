// Voss-McCartney pink noise — equal energy per octave, ideal for EQ training
export function generatePinkNoise(audioCtx, durationSecs = 30) {
  const sr = audioCtx.sampleRate;
  const len = Math.floor(sr * durationSecs);
  const buf = audioCtx.createBuffer(2, len, sr);

  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
      data[i] = Math.max(-1, Math.min(1, pink));
    }
  }
  return buf;
}

export function generateWhiteNoise(audioCtx, durationSecs = 30) {
  const sr = audioCtx.sampleRate;
  const len = Math.floor(sr * durationSecs);
  const buf = audioCtx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.45;
    }
  }
  return buf;
}
