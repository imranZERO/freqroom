# Fr*eq*Room

Interactive EQ ear training for producers, engineers, and audiophiles.

## What it does

FreqRoom trains your ears to recognise EQ changes. Each trial hides one filter — a boost, a cut, a shelf, or a high/low-pass — in the audio. You flip between the processed signal and a flat reference as often as you like, then say where the change is. A live frequency-response graph shows every candidate curve, previews the one you're hovering, and reveals the answer after you choose.

Difficulty adapts per mode: 3 correct in a row levels you up, 2 wrong in a row steps you back down.

**Explore** is a free-play EQ with no quiz: drag a bell, shelf, or pass filter across the graph, hear it live, and read what that region tends to sound like (boomy, boxy, harsh, airy…).

**Eight training modes:**

| Mode | You identify | Levels |
|---|---|---|
| **Boosts** | which band was boosted | 2–15 bands |
| **Cuts** | which band was cut | 2–15 bands |
| **Mixed** | the band *and* whether it was boosted or cut | 2–15 bands |
| **Shelves** | the corner of a low or high shelf, and its direction | 2–8 corners |
| **Pass Filters** | the cutoff of a high-pass or low-pass filter | 2–8 cutoffs |
| **Sweep** | the exact frequency of a boost or a dip, by dragging on the graph — scored by how many octaves off you are | 1–5 (±1 → ±⅙ octave) |
| **How Much?** | the gain of a bell at a marked frequency | 1–6 (2 → 12 dB choices) |
| **Match EQ** | a hidden bell's frequency *and* gain, by dragging your own bell until Target and Yours sound the same | 1–5 (±1 oct/±4 dB → ±⅙ oct/±1.5 dB) |

Gain (1–18 dB) and Q (0.5–8) are adjustable, even mid-trial, so you can start broad and easy and tighten the challenge as your ears improve.

**Source audio:**
- Noise: pink (recommended — equal energy per octave) or white
- Music loops: drums, or a full band with bass and chords — synthesized in the browser, so you can train on music without your own files
- Your own music (MP3, WAV, FLAC, OGG, and anything else your browser plays), with its format, sample rate, bit depth, and bitrate shown, a position fader, and A/B loop points for drilling one section

**Practice tools:**
- Scoring that rewards difficulty: points per answer grow with the number of choices (and Sweep near misses earn partial credit), with accuracy, streaks, your last 10 answers, and a per-mode breakdown for the session or all time
- Progress is saved in your browser: level per mode, lifetime score, and an accuracy strip under the graph showing how you do in each octave
- *Focus weak bands* drills the octaves you miss most
- Keyboard: 1–9/0 pick bands, ← → step, ↑ ↓ switch boost/cut rows, Space toggles EQ/Flat, Enter checks or advances
- Share links recreate a challenge — mode, level, gain, Q, generated source, and Sweep direction
- System, light, and dark themes
- Installable, works offline, and private: no account, and nothing leaves your browser

The in-app **Technical Details** page explains the filter math, band placement, scoring, the Web Audio signal chain, and more.

## Running locally

```bash
npm install
npm run dev      # dev server at http://localhost:5173
```

```bash
npm run build       # production build → dist/
npm run preview     # serve the production build
npm test            # run the test suite once
npm run test:watch  # tests in watch mode
```

## Project layout

```
src/
  App.jsx               routes, theme, saved settings and progress
  components/           trainer, graph, source/controls, header/footer, dialogs, Technical Details
  hooks/                useAudioEngine (the Web Audio graph), useMediaQuery
  lib/                  pure logic: filters and bands, level progression, progress stats,
                        file-header parsing, noise and loop synthesis, storage, challenge links
  styles/               CSS split by area, imported in cascade order from App.css
tests/                  Vitest suite: pure logic, components (jsdom), and the audio engine
                        against a fake AudioContext
```

`AGENTS.md` has a deeper tour of the architecture for contributors and coding agents.

## Stack

- [Preact](https://preactjs.com) (with `preact/compat`) and [Wouter](https://github.com/molefrog/wouter) for routing
- Web Audio API — no audio libraries
- [Vite](https://vite.dev) and [Vitest](https://vitest.dev) with Testing Library
- Deployed on Cloudflare Pages

## Inspired by

[Harman: How to Listen](https://harmanhowtolisten.blogspot.com)

## License

MIT — see [LICENSE](LICENSE).
