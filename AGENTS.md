# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, Cursor, etc.) when working with code in this repository.

## Commands

```bash
npm run dev      # dev server at http://localhost:5173
npm run build    # production build → dist/
npm run preview  # serve the production build
```

No test runner or linter is configured.

## Architecture

FreqRoom is a Preact + Vite app. All audio processing uses the Web Audio API directly — no external audio libraries. Routing is handled by Wouter; `react` and `react-dom` are aliased to `preact/compat` in `vite.config.js`.

**Data flow:**

```
App.jsx (Wouter Router)
  ├─ /                  → MainApp (two-column "rack": .rack-side + .rack-main)
  │    └─ useAudioEngine (hook)     — owns the AudioContext, buffer, gain, and filter chain
  │    └─ .rack-side
  │    │    └─ TrackSelector        — Source + Controls panels; loads audio (pink/white noise or file) into engine
  │    └─ .rack-main
  │         └─ FrequencyTrainer     — all game logic (trial state, level progression, answer checking)
  │         │    └─ FreqGraph (SVG) — the instrument's screen; computes biquad math directly in JS
  │         │    └─ calls engine.play(filters) / engine.stop()
  │         └─ ScoreBoard           — stateless display of session totals; hidden until the first answer
  └─ /technical-details → TechnicalDetails
```

**`useAudioEngine` (`src/hooks/useAudioEngine.js`)** — the audio layer. Builds a persistent graph once per `AudioContext`: the looping `AudioBufferSourceNode` feeds parallel flat and EQ (biquad chain) paths, then a master gain and a limiter (`DynamicsCompressorNode`). Calling `play(filters)` crossfades between the flat and EQ paths and ramps filter params in place when the filter layout is unchanged, so A/B switching and live Gain/Q changes are click-free without restarting the source. Seeks and stops fade the source's own voice gain in and out. `loadBuffer` accepts a `File`, a URL string, or a pre-built `AudioBuffer` (used by noise generators).

**`FrequencyTrainer` (`src/components/FrequencyTrainer.jsx`)** — all game logic lives here. Adaptive difficulty: levels 2–15, advance after 3 correct in a row, drop after 2 wrong in a row. `generateBands(n)` places `n` frequencies logarithmically across 20Hz–20kHz using binary interval subdivision. `makeFilter` returns a peaking EQ filter descriptor consumed by `engine.play`. It renders one instrument panel in every state, with `FreqGraph` as its screen; band buttons use an n-column grid inset by the graph's plot margins so each button sits under its curve peak (keep `.freq-grid` padding in `App.css` in sync with `P`/`VW` in `FreqGraph.jsx`).

**`FreqGraph` (`src/components/FreqGraph.jsx`)** — pure SVG, no charting library. `computeCurve` implements the standard biquad peaking EQ transfer function at 300 log-spaced sample points. During a trial, all candidate curves are rendered in gray; after answering, the correct curve is revealed in color with a filled area.

**`TechnicalDetails` (`src/components/TechnicalDetails.jsx`)** — static informational page at `/technical-details`. Has its own scoped stylesheet (`TechnicalDetails.css`) using a `td-` class prefix. Picks up the same CSS variables as the main app so the theme toggle carries over automatically.

**`noiseGen.js`** — Paul Kellet's IIR filter method for pink noise; simple uniform random for white noise. Both return an `AudioBuffer` for direct use with `loadBuffer`.

**`audioInfo.js`** — `probeAudioFile(file)` reads format, original sample rate, bit depth, and channels from WAV/FLAC/MP3/Ogg/Opus headers (M4A reports format only). `decodeAudioData` resamples to the context rate, so this is the only source of the file's real specs. `TrackSelector` shows them, plus average bitrate (file size ÷ duration), on the upload button.

**Persistence (`src/lib/storage.js`, `src/lib/progress.js`)** — all saved state lives in localStorage under the `freqroom:` prefix, and every access is try/catch-guarded, so the app runs on defaults when storage is blocked. `usePersistentState` backs theme (`dark`), `gainDb`, `q`, `focus`, and `progress`; the engine saves `volume`. `progress` holds the level per mode, lifetime totals, and per-octave accuracy (`stats[family][bucket]`, 10 octave buckets from 31.5 Hz). `FrequencyTrainer` reports each answer via `onResult`, and `App` folds it in with `recordResult`. `heatFor` drives the graph's weak-spot strip and `pickWeighted` drives "Focus weak bands". "Reset progress" (Controls) clears progress only; "Clear saved data" (footer) calls `clearAll()` and reloads. `index.html` reads the saved theme before first paint.

**Theme** — toggled via `data-theme="dark|light"` on `document.documentElement`; CSS variables in `App.css` handle the rest. The choice is saved (see Persistence).

## Deployment

Deployed on Cloudflare Pages. `public/_redirects` contains `/* /index.html 200` to enable client-side routing — any new Wouter routes will work automatically without changes to this file.

## Key constants (FrequencyTrainer)

| Constant | Value | Meaning |
|---|---|---|
| `CORRECT_TO_ADVANCE` | 3 | Correct streak needed to level up |
| `WRONG_TO_DECREASE` | 2 | Wrong streak needed to level down |
| `MIN_LEVEL` / `MAX_LEVEL` | 2 / 15 | Band count range |
