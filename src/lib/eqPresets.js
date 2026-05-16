const label = (hz) => hz >= 1000 ? `${hz / 1000}kHz` : `${hz}Hz`;

export const TRAINING_FREQUENCIES = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

// Approximate Harman 2018 headphone target curve using biquad filter chain
export const HARMAN_PRESET = {
  id: 'harman',
  name: 'Harman Target vs Flat',
  description: 'Hear the Harman listener-preference EQ curve against a flat response',
  category: 'Reference',
  filters: [
    { type: 'lowshelf',  frequency: 105,  gain:  5.5 },
    { type: 'peaking',   frequency: 400,  Q: 0.7,  gain:  1.5 },
    { type: 'peaking',   frequency: 3200, Q: 1.0,  gain: -3.5 },
    { type: 'highshelf', frequency: 9000, gain: -4.5 },
  ],
};

function makeBoost(freq, dB) {
  return {
    id: `boost_${freq}_${dB}`,
    name: `+${dB}dB @ ${label(freq)}`,
    description: `${dB}dB peak boost centered at ${label(freq)}`,
    category: `+${dB}dB Boosts`,
    targetFrequency: freq,
    gain: dB,
    filters: [{ type: 'peaking', frequency: freq, Q: 1.4, gain: dB }],
  };
}

function makeCut(freq, dB) {
  return {
    id: `cut_${freq}_${dB}`,
    name: `-${dB}dB @ ${label(freq)}`,
    description: `${dB}dB peak cut centered at ${label(freq)}`,
    category: `-${dB}dB Cuts`,
    targetFrequency: freq,
    gain: -dB,
    filters: [{ type: 'peaking', frequency: freq, Q: 1.4, gain: -dB }],
  };
}

export const ALL_PRESETS = [
  HARMAN_PRESET,
  ...[3, 6, 12].flatMap(dB => TRAINING_FREQUENCIES.map(f => makeBoost(f, dB))),
  ...[3, 6, 12].flatMap(dB => TRAINING_FREQUENCIES.map(f => makeCut(f, dB))),
];

export const PRESET_CATEGORIES = [...new Set(ALL_PRESETS.map(p => p.category))];
