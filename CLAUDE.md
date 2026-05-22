# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
  ├─ /                  → MainApp
  │    └─ useAudioEngine (hook)     — owns the AudioContext, buffer, gain, and filter chain
  │    └─ TrackSelector             — loads audio (pink noise, white noise, or uploaded file) into engine
  │    └─ FreqGraph (SVG)           — visualizes the EQ curve; computes biquad math directly in JS
  │    └─ FrequencyTrainer          — all game logic (trial state, level progression, answer checking)
  │         └─ calls engine.play(filters) / engine.stop()
  │    └─ ScoreBoard                — stateless display of session totals
  └─ /technical-details → TechnicalDetails
```

**`useAudioEngine` (`src/hooks/useAudioEngine.js`)** — the audio layer. Manages a single looping `AudioBufferSourceNode` with a hot-swappable biquad filter chain. Calling `play(filters)` tears down the old source and reconnects from the current offset so switching EQ/flat is seamless. `loadBuffer` accepts a `File`, a URL string, or a pre-built `AudioBuffer` (used by noise generators).

**`FrequencyTrainer` (`src/components/FrequencyTrainer.jsx`)** — all game logic lives here. Adaptive difficulty: levels 2–15, advance after 3 correct in a row, drop after 2 wrong in a row. `generateBands(n)` places `n` frequencies logarithmically across 20Hz–20kHz using binary interval subdivision. `makeFilter` returns a peaking EQ filter descriptor consumed by `engine.play`. The `onEqChange` prop sends band data up to `App` so `FreqGraph` can display it.

**`FreqGraph` (`src/components/FreqGraph.jsx`)** — pure SVG, no charting library. `computeCurve` implements the standard biquad peaking EQ transfer function at 300 log-spaced sample points. During a trial, all candidate curves are rendered in gray; after answering, the correct curve is revealed in color with a filled area.

**`TechnicalDetails` (`src/components/TechnicalDetails.jsx`)** — static informational page at `/technical-details`. Has its own scoped stylesheet (`TechnicalDetails.css`) using a `td-` class prefix. Picks up the same CSS variables as the main app so the theme toggle carries over automatically.

**`noiseGen.js`** — Voss-McCartney algorithm for pink noise; simple uniform random for white noise. Both return an `AudioBuffer` for direct use with `loadBuffer`.

**Theme** — toggled via `data-theme="dark|light"` on `document.documentElement`; CSS variables in `App.css` handle the rest.

## Deployment

Deployed on Cloudflare Pages. `public/_redirects` contains `/* /index.html 200` to enable client-side routing — any new Wouter routes will work automatically without changes to this file.

## Key constants (FrequencyTrainer)

| Constant | Value | Meaning |
|---|---|---|
| `CORRECT_TO_ADVANCE` | 3 | Correct streak needed to level up |
| `WRONG_TO_DECREASE` | 2 | Wrong streak needed to level down |
| `MIN_LEVEL` / `MAX_LEVEL` | 2 / 15 | Band count range |
