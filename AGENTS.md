# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, Cursor, etc.) when working with code in this repository.

## Commands

```bash
npm run dev      # dev server at http://localhost:5173
npm run build    # production build → dist/
npm run preview  # serve the production build
npm test         # run the vitest suite once (node environment, no DOM)
npm run test:watch  # watch mode
```

No linter is configured.

## Testing

Vitest runs under Vite's own config (aliases like `react → preact/compat` apply) in a **node** environment — `test/setup.js` provides bare-bones `localStorage`/`location`/`navigator.clipboard`/`window.prompt` stubs. There are no Web Audio, AudioContext, or React component tests yet: the suite covers **pure logic only**:

- `tests/progress.test.js` — octave bucketing, `recordResult`, `heatFor`, `pickWeighted`
- `tests/progression.test.js` — `applyAnswer` (3-up / 2-down / clamp rules from `src/lib/progression.js`)
- `tests/challenge.test.js` — `parseChallenge` / `buildChallengeUrl` / clipboard fallback
- `tests/storage.test.js` — `load`/`save`/`clearAll` incl. storage-unavailable fallbacks
- `tests/biquad.test.js` — `biquadCoeffs` / `magnitudeDb` / `rowInset` from `FreqGraph.jsx` (pure math, no DOM at import; ground truths: peaking hits exactly gain at centre, Butterworth cutoffs are −3.01 dB, shelf corners sit at half the gain in dB)
- `tests/audioInfo.test.js` — header parsing for WAV/FLAC/Ogg/Opus/MP3/M4A with hand-built byte fixtures
- `tests/noiseGen.test.js` — white/pink noise buffers (finite, in range, RMS bands)
- `tests/audio-engine-math.test.js` — `clampStartOffset` / `clampToLoopOffset`

Add tests when changing any of these modules; pure helpers extracted from hooks/components (see `src/lib/progression.js`, `src/lib/audioEngineMath.js`) are the intended seam for future logic tests.

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
  App owns the theme and the How it works dialog; both pages render SiteHeader / SiteFooter (src/components/SiteChrome.jsx)
```

**`useAudioEngine` (`src/hooks/useAudioEngine.js`)** — the audio layer. Builds a persistent graph once per `AudioContext`: the looping `AudioBufferSourceNode` feeds parallel flat and EQ (biquad chain) paths, then a master gain and a limiter (`DynamicsCompressorNode`). Calling `play(filters)` crossfades between the flat and EQ paths and ramps filter params in place when the filter layout is unchanged, so A/B switching and live Gain/Q changes are click-free without restarting the source. Seeks and stops fade the source's own voice gain in and out. `setLoop(start, end)` loops a region (sets `loopStart`/`loopEnd`, re-anchors position tracking, and snaps starts/seeks outside the region to its start); `getCurrentOffset` wraps within it. `loadBuffer` clears the loop. `TrackSelector` shows Set A / Set B / Clear for uploads. `loadBuffer` accepts a `File`, a URL string, or a pre-built `AudioBuffer` (used by noise generators).

**`FrequencyTrainer` (`src/components/FrequencyTrainer.jsx`)** — all game logic lives here. Adaptive difficulty: levels 2–15, advance after 3 correct in a row, drop after 2 wrong in a row. `generateBands(n)` places `n` frequencies logarithmically across 20Hz–20kHz using binary interval subdivision. Modes live in `MODES` (Boosts, Cuts, Mixed, Shelves, Pass Filters, Sweep), each with a stats `family` and optional `minLevel`/`maxLevel`. Sweep has no buttons: `FreqGraph` gets `marker` + `onPick`, the answer is scored by `octaveError` against `SWEEP_TOLERANCE[level − 1]` (1 → ⅙ octave over levels 1–5), and the hidden frequency is drawn from `SWEEP_GRID` so focus practice can weight it. A trial's `kind` (`peaking`, `shelf`, `highpass`, `lowpass`) and `range` come from `bandRange`; `makeFilter` builds one `{ type, frequency, Q, gain }` descriptor that feeds both the engine and the graph — `engine.play` takes a **list** of descriptors (wrap it: `engine.play([filter])`; `[]` means Flat), while `FreqGraph` takes single descriptors. It renders one instrument panel in every state, with `FreqGraph` as its screen; band rows are n-column grids inset by `rowInset(lo, hi)` from `FreqGraph.jsx`, so each button sits under its curve's centre, corner, or cutoff. Keyboard: 1–9/0 pick bands, ←/→ step, ↑/↓ switch boost/cut rows in Mixed and Shelves (`pickDirection`), Space toggles EQ/Flat (also after answering), Enter checks/advances; the `autoplay` setting starts EQ playback on each new trial.

**`FreqGraph` (`src/components/FreqGraph.jsx`)** — pure SVG, no charting library. `biquadCoeffs` implements the Web Audio / RBJ cookbook coefficients for peaking, shelf (S = 1), and lowpass/highpass (Q in dB) filters, and `magnitudeDb` evaluates them at 300 log-spaced points; the output matches `BiquadFilterNode.getFrequencyResponse`. Props: `curves` (candidates, drawn gray), `answer` (revealed in colour with a fill), `gainDb` (sets the ±dB axis), `heat` (weak-spot strip), `marker`/`onPick` (Sweep mode: the plot becomes a pointer input and shows the guess and, after answering, the octave error).

**`TechnicalDetails` (`src/components/TechnicalDetails.jsx`)** — static informational page at `/technical-details`. Has its own scoped stylesheet (`TechnicalDetails.css`) using a `td-` class prefix. Picks up the same CSS variables as the main app so the theme toggle carries over automatically. Sections are listed in `SECTIONS` (drives the numbered headings and contents list). The page quotes real implementation values — mode spans and level ranges, Sweep tolerances, focus weights, octave buckets, limiter and ramp settings, header parsing — so update it when those constants change.

**`noiseGen.js`** — Paul Kellet's IIR filter method for pink noise; simple uniform random for white noise. Both return an `AudioBuffer` for direct use with `loadBuffer`.

**`audioInfo.js`** — `probeAudioFile(file)` reads format, original sample rate, bit depth, and channels from WAV/FLAC/MP3/Ogg/Opus headers (M4A reports format only). `decodeAudioData` resamples to the context rate, so this is the only source of the file's real specs. `TrackSelector` shows them, plus average bitrate (file size ÷ duration), on the upload button.

**Persistence (`src/lib/storage.js`, `src/lib/progress.js`)** — all saved state lives in localStorage under the `freqroom:` prefix, and every access is try/catch-guarded, so the app runs on defaults when storage is blocked. `usePersistentState` backs `theme` (`system`/`light`/`dark`), `gainDb`, `q`, `focus`, and `progress`; the engine saves `volume`. `progress` holds the level per mode, lifetime totals, and per-octave accuracy (`stats[family][bucket]`, 10 octave buckets from 31.5 Hz). `FrequencyTrainer` reports each answer via `onResult`, and `App` folds it in with `recordResult`. `heatFor` drives the graph's weak-spot strip and `pickWeighted` drives "Focus weak bands". "Reset progress" clears progress only and "Clear saved data" calls `clearAll()` and reloads; both sit at the bottom of the left column (`.side-footer`) and confirm through `ConfirmDialog` (in-app `<dialog>`; `App` passes a `{ title, message, confirmLabel, onConfirm }` request) rather than `window.confirm`. The reset icon beside the Controls label restores Volume/Gain/Q defaults (`DEFAULT_VOLUME` in the engine, `DEFAULT_GAIN_DB`/`DEFAULT_Q` in `App`) and only shows when one has changed. `index.html` reads the saved theme before first paint.

**Challenge links (`src/lib/challenge.js`)** — `?mode=&gain=&q=&source=&level=` (source: `pink`/`white` only). `App` parses once on load with `parseChallenge` (invalid values are dropped, numbers clamped), applies gain/q/level, passes `initialSource` to `TrackSelector` and `initialMode` to `FrequencyTrainer`, then strips the query with `history.replaceState`. The trainer's Share button builds the link with `buildChallengeUrl`, including only the settings the mode uses, and copies it via `copyText` (clipboard, or a prompt fallback).

**Theme** — `App` resolves `theme` (default `system`, which follows `prefers-color-scheme` live) to `data-theme="dark|light"` on `document.documentElement`; CSS variables in `App.css` handle the rest. The header button cycles System → Light → Dark. The choice is saved (see Persistence), and `index.html` applies it before first paint.

**Offline / install (`public/sw.js`, `public/manifest.webmanifest`)** — the service worker is registered from `main.jsx` in production builds only. Page navigations are network-first with the cached `/` shell as the offline fallback; other same-origin GETs are cache-first and refreshed in the background (asset names are content-hashed). Bump `CACHE` in `sw.js` when changing the caching strategy. Icons: `icon-192/512.png` (rounded), `icon-maskable-512.png` (full-bleed), and `apple-touch-icon.png`, all rendered from `favicon.svg`.

## Deployment

Deployed on Cloudflare Pages. `public/_redirects` contains `/* /index.html 200` to enable client-side routing — any new Wouter routes will work automatically without changes to this file.

## Key constants (`src/lib/progression.js`)

| Constant | Value | Meaning |
|---|---|---|
| `CORRECT_TO_ADVANCE` | 3 | Correct streak needed to level up |
| `WRONG_TO_DECREASE` | 2 | Wrong streak needed to level down |
| `MIN_LEVEL` / `MAX_LEVEL` | 2 / 15 | Band count range |
