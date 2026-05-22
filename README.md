# Fr*eq*Room

Interactive EQ ear training for producers, engineers, and audiophiles.

## What it does

FreqRoom trains your ears to identify frequency changes in audio. Each trial applies a peak EQ filter at a hidden frequency — you toggle between the processed signal and a flat reference, then pick the band you hear changing. Gain (1–18 dB) and Q are configurable so you can start broad and easy, then tighten the challenge as your ears improve.

Difficulty adapts automatically: get 3 correct in a row and you advance to a harder level with more candidate bands. Miss 2 in a row and it steps back down. Levels range from 2 to 15 bands spread evenly across 20Hz–20kHz on a log scale.

**Three test modes:**
- **Boosts** — identify which band was boosted
- **Cuts** — identify which band was cut
- **Mixed** — identify the frequency *and* whether it was a boost or cut

**Source audio:**
- Pink noise (recommended — equal energy per octave)
- White noise
- Upload your own music (MP3, WAV, FLAC, OGG)

## Running locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

```bash
npm run build    # production build → dist/
npm run preview  # preview the production build
```

## Stack

- Preact
- Wouter (client-side routing)
- Web Audio API (no audio libraries)
- Vite

## Inspired by

[Harman: How to Listen](https://harmanhowtolisten.blogspot.com)