# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, Cursor, etc.) when working with code in this repository.

## Commands

```bash
npm run dev      # dev server at http://localhost:5173
npm run build    # production build → dist/
npm run preview  # serve the production build
npm test         # run the vitest suite once
npm run test:watch  # watch mode
```

No linter is configured.

## Testing

Vitest runs under Vite's own config (aliases like `react → preact/compat` apply). The default environment is **node** (`test/setup.js` provides bare-bones `localStorage`/`location`/`navigator.clipboard`/`window.prompt` stubs, guarded so jsdom globals pass through). Test files that need a DOM add `// @vitest-environment jsdom` to the top and get `matchMedia`/`requestAnimationFrame` stubs plus `@testing-library/jest-dom` from `test/setup-dom.js`.

**Pure logic** (node environment):

- `tests/progress.test.js` — octave bucketing, `recordResult`, `heatFor`, `pickWeighted`
- `tests/progression.test.js` — `applyAnswer` (3-up / 2-down / clamp rules from `src/lib/progression.js`)
- `tests/challenge.test.js` — `parseChallenge` / `buildChallengeUrl` / clipboard fallback
- `tests/storage.test.js` — `load`/`save`/`clearAll` incl. storage-unavailable fallbacks
- `tests/biquad.test.js` — `biquadCoeffs` / `magnitudeDb` / `rowInset` from `FreqGraph.jsx` (pure math, no DOM at import; ground truths: peaking hits exactly gain at centre, Butterworth cutoffs are −3.01 dB, shelf corners sit at half the gain in dB) and `fmtHz`
- `tests/audioInfo.test.js` — header parsing for WAV/FLAC/Ogg/Opus/MP3/M4A with hand-built byte fixtures
- `tests/noiseGen.test.js` — white/pink noise buffers (finite, in range, RMS bands)
- `tests/music-gen.test.js` — Drum/Band loops: length, range, RMS, determinism, seamless wrap, band loop's lo/mid/hi energy
- `tests/audio-engine-math.test.js` — `clampStartOffset` / `clampToLoopOffset`
- `tests/trainer.test.js` — `src/lib/trainer.js`: `generateBands` subdivision, `bandRange`, `makeFilter`, octave error calc, Sweep tolerance gating, note naming, `pickDirection`, How Much? levels, Match EQ tolerance
- `tests/scoring.test.js` — `src/lib/scoring.js`: `choicesFor`/`maxPoints` (10 points per bit, incl. How Much? and Match EQ), `sweepCredit`/`matchCredit` fades, `trialPoints`, `addResult` tallies (streaks, last-10, per-mode rows, old `{ total, correct }` lifetimes)
- `tests/track-format.test.js` — `src/lib/trackFormat.js`: seeded waveform glyphs (deterministic pick), `formatTime`, `formatSpec`

**Component tests** (`// @vitest-environment jsdom` + Testing Library):

- `tests/score-board.test.jsx` — `ScoreBoard` empty state, summary/lamps/mode rows, Session/Lifetime tabs, Reset.
- `tests/frequency-trainer.test.jsx`, `tests/track-selector.test.jsx`. `FrequencyTrainer` and `TrackSelector` both take `engine` as a prop, so tests inject a stub engine (`play`/`stop`/`seek`/`setLoop`/`loadBuffer`/`getCurrentOffset` as `vi.fn()`, `isLoaded: true`, `duration: 30`) and never touch the real `AudioContext`; `getCtx()` must return `{ sampleRate, createBuffer }` for the noise generators. Trainer tests also cover level-up / level-down end to end by folding results back through `recordResult` (as `App` does), `autoplay`, the sweep advance flow, and the How Much? and Match EQ flows.
- `tests/use-audio-engine.test.jsx` — `useAudioEngine` itself, run against `test/fake-audio-context.js` (a minimal Web Audio fake: `AudioParam` call logs, node connect/disconnect graphs, a driver-controlled `currentTime`; `globalThis.AudioContext` is swapped in `beforeEach`). Covers graph build + flat/EQ crossfade, in-place filter ramps vs chain rebuild (incl. the missing-`cancelAndHoldAtTime` fallback), position wrapping with and without a loop, loop snap/re-anchor, seek clamping/fade teardown, volume persistence, and `loadBuffer` buffer/File/URL/error paths. Set `ctx.decoded` before a load to control what `decodeAudioData` returns, and call `rerender()` to observe state updates (the hook object from the first render is stale).
- jsdom gotchas: file inputs swallow `fireEvent.change({ target: { files } })` — assign `Object.defineProperty(input, 'files', { value: [file] })` then `input.dispatchEvent(new Event('change', { bubbles: true }))`. After a real upload, the transport's position effect writes `getCurrentOffset()` back over the slider late, so wait for the upload to settle ("Loading…" gone) before driving `#ctrl-position`. The position slider listens to **pointer events** (`onPointerDown/Up/Cancel/LostPointerCapture`), so drag tests use `fireEvent.pointerDown/pointerUp/pointerCancel`; `setPointerCapture` is unguarded-and-catchable in jsdom, which is fine because the component wraps it in try/catch. `File` instances may also need `Object.defineProperty(file, 'arrayBuffer', { value: ... })` because jsdom's implementation is not always usable.

Add tests when changing any of these modules; pure helpers extracted from hooks/components (`src/lib/progression.js`, `src/lib/audioEngineMath.js`, `src/lib/trainer.js`, `src/lib/trackFormat.js`) are the intended seam for logic tests.

## Architecture

FreqRoom is a Preact + Vite app. All audio processing uses the Web Audio API directly — no external audio libraries. Routing is handled by Wouter; `react` and `react-dom` are aliased to `preact/compat` in `vite.config.js`.

**Data flow:**

```
App.jsx (Wouter Router)
  ├─ /                  → MainApp (two-column "rack": .rack-side + .rack-main)
  │    └─ useAudioEngine (hook)     — owns the AudioContext, buffer, gain, and filter chain
  │    └─ .rack-side
  │    │    └─ TrackSelector        — Source + Controls panels; loads audio (noise, music loops, or a file) into engine
  │    └─ .rack-main
  │         └─ FrequencyTrainer     — all game logic (trial state, level progression, answer checking)
  │         │    └─ FreqGraph (SVG) — the instrument's screen; computes biquad math directly in JS
  │         │    └─ calls engine.play(filters) / engine.stop()
  │         └─ ScoreBoard           — points, accuracy, streaks, last 10 answers, and per-mode rows; Session/Lifetime tabs; always shown, dimmed until the first answer
  └─ /technical-details → TechnicalDetails
  App owns the theme and the How it works dialog; both pages render SiteHeader / SiteFooter (src/components/SiteChrome.jsx)
```

**`useAudioEngine` (`src/hooks/useAudioEngine.js`)** — the audio layer. Builds a persistent graph once per `AudioContext`: the looping `AudioBufferSourceNode` feeds parallel flat and EQ (biquad chain) paths, then an inline `AnalyserNode` (exposed via `getAnalyser()` for the graph's live spectrum), a master gain, and a limiter (`DynamicsCompressorNode`). Calling `play(filters)` crossfades between the flat and EQ paths and ramps filter params in place when the filter layout is unchanged, so A/B switching and live Gain/Q changes are click-free without restarting the source. Seeks and stops fade the source's own voice gain in and out. `setLoop(start, end)` loops a region (sets `loopStart`/`loopEnd`, re-anchors position tracking, and snaps starts/seeks outside the region to its start); `getCurrentOffset` wraps within it. `loadBuffer` clears the loop. `TrackSelector` shows Set A / Set B / Clear for uploads. `loadBuffer` accepts a `File`, a URL string, or a pre-built `AudioBuffer` (used by noise generators).

**`FrequencyTrainer` (`src/components/FrequencyTrainer.jsx`)** — all game logic lives here. Adaptive difficulty: levels 2–15, advance after 3 correct in a row, drop after 2 wrong in a row. `generateBands(n)` places `n` frequencies logarithmically across 20Hz–20kHz using binary interval subdivision. Modes live in `MODES` (Boosts, Cuts, Mixed, Shelves, Pass Filters, Sweep, How Much?, Match EQ), each with a stats `family` and optional `minLevel`/`maxLevel`. **How Much?** (`gain`) and **Match EQ** (`match`) trials carry their own `activeGain` (so `activeFilter` ignores the Gain slider) and are started by `startGainOrMatchTrial`. How Much? offers `GAIN_LEVELS[level − 1]` as a `GainRow` of dB keys at a marked `GAIN_FREQS` frequency; `userSelection` is `{ gain }`. Match EQ hides a bell on `SWEEP_GRID` with a `MATCH_GAINS` gain; `userSelection` is `{ freq, gain }`, set by the graph's `onPoint` or the arrow keys (functional `setTrial` updates so held keys all count), drawn dashed blue (`selectedTone="mine"`), and heard via the Transport's `yours` toggle (`playMode === 'mine'`); it's scored against `MATCH_TOLERANCE` in both octaves and dB. **Explore** (`testMode === 'explore'`) is deliberately *not* in `MODES`: it's a free-play sandbox with no levels, scoring, or share link. Its state is `explore = { type, freq, gain }` (types from `EXPLORE_TYPES` in `src/lib/trainer.js`); the graph's `onPoint({ freq, db })` drags it, the keys nudge it, and an effect re-sends `engine.play([exploreFilter])` while EQ plays. `describeRegion` supplies the region guide; `ExploreBody` in `TrainerParts.jsx` renders the controls. Sweep has no buttons: `FreqGraph` gets `marker` + `onPick`, the answer is scored by `octaveError` against `SWEEP_TOLERANCE[level − 1]` (1 → ⅙ octave over levels 1–5), and the hidden frequency is drawn from `SWEEP_GRID` so focus practice can weight it. A trial's `kind` (`peaking`, `shelf`, `highpass`, `lowpass`) and `range` come from `bandRange`; `makeFilter` builds one `{ type, frequency, Q, gain }` descriptor that feeds both the engine and the graph — `engine.play` takes a **list** of descriptors (wrap it: `engine.play([filter])`; `[]` means Flat), while `FreqGraph` takes single descriptors. It renders one instrument panel in every state, with `FreqGraph` as its screen; band rows are n-column grids inset by `rowInset(lo, hi)` from `FreqGraph.jsx`, so each button sits under its curve's centre, corner, or cutoff. Keyboard: 1–9/0 pick bands, ←/→ step, ↑/↓ switch boost/cut rows in Mixed and Shelves (`pickDirection`), Space toggles EQ/Flat (also after answering), Enter checks/advances; the `autoplay` setting starts EQ playback on each new trial.

**`FreqGraph` (`src/components/FreqGraph.jsx`)** — pure SVG, no charting library. `biquadCoeffs` implements the Web Audio / RBJ cookbook coefficients for peaking, shelf (S = 1), and lowpass/highpass (Q in dB) filters, and `magnitudeDb` evaluates them at 300 log-spaced points; the output matches `BiquadFilterNode.getFrequencyResponse`. Props: `curves` (candidates, drawn gray), `answer` (revealed in colour with a fill), `gainDb` (sets the ±dB axis), `heat` (weak-spot strip), `marker`/`onPick` (Sweep mode: the plot becomes a pointer input and shows the guess and, after answering, the octave error). `getAnalyser`/`live` draw the **live spectrum** (`SpectrumLayer`: a rAF loop that reads the engine's `AnalyserNode` and writes the path straight to the DOM, so frames don't re-render React; `spectrumDb` is the pure per-point averaging with a +3 dB/oct per-bin tilt, eased in power; the centre follows each frame's raw level, ignores near-silence and snaps when >12 dB off; `spectrumToAxis` draws it at ~0.75× with a tanh soft limit so it never flat-tops). `FrequencyTrainer` passes `live` only when nothing would be spoiled (Explore, a trial already answered, or Flat / Match EQ's Yours playing for `SPECTRUM_SETTLE_MS` = 500 ms, since the analyser's ~0.34 s window still holds EQ'd audio right after switching) and `getAnalyser` only when the persisted `spectrum` setting is on (its icon toggle, `spectrumButton` / `.spectrum-toggle` with `SpectrumIcon`, sits first in every `.trainer-header-end` beside Back / Share, so it only shows once a mode is open; `App` passes `spectrum`/`setSpectrum`). A long `.trainer-result` (Match EQ's) wraps within its own flex space so those buttons stay on the header's top row. `CursorLayer` owns the mouse-hover readout (its own state, so pointer moves don't redraw the curves) and replaces the RESPONSE title. Regions come from `REGIONS` in `trainer.js` (shared with `freqRegion`); the revealed curve rises from 0 dB via `--y0` + `transform-box: view-box`. The accuracy strip is SVG, so `HeatHits` lays HTML hit areas over it to get the app's `data-tooltip`s. `onPoint({ freq, db })` is the two-axis version used by Explore (y is mapped back to dB with `fromY`, the inverse of `toY`; both are exported with `graphLayout` for tests).

**`TechnicalDetails` (`src/components/TechnicalDetails.jsx`)** — static informational page at `/technical-details`. Has its own scoped stylesheet (`TechnicalDetails.css`) using a `td-` class prefix. Picks up the same CSS variables as the main app so the theme toggle carries over automatically. Sections are listed in `SECTIONS` (drives the numbered headings and contents list). The page quotes real implementation values — mode spans and level ranges, Sweep tolerances, focus weights, octave buckets, limiter and ramp settings, header parsing — so update it when those constants change.

**`noiseGen.js`** — Paul Kellet's IIR filter method for pink noise; simple uniform random for white noise. Both return an `AudioBuffer` for direct use with `loadBuffer`.

**`musicGen.js`** — `generateDrumLoop` / `generateBandLoop`: seeded, synthesized 8-bar loops at 100 BPM (19.2 s, stereo). Each note is mixed in at `(start + i) % length`, so tails wrap and the loop is seamless; output is normalized toward pink noise's RMS. `TrackSelector`'s `GENERATED_GROUPS` makes two cards, Noise (`pink`/`white`) and Music Loop (`drums`/`band`), each with a flush strip of `.source-key`s along its bottom edge (the loaded variant's key stays lit; same pattern as the mode picker's `.mode-key`s); every variant has a `make(ctx)` function, run only when clicked. The card face reloads the group's last-picked variant (`picked` state), and the source id reported to `onSourceChange` and share links is the variant id.

**`audioInfo.js`** — `probeAudioFile(file)` reads format, original sample rate, bit depth, and channels from WAV/FLAC/MP3/Ogg/Opus headers (M4A reports format only). `decodeAudioData` resamples to the context rate, so this is the only source of the file's real specs. `TrackSelector` shows them, plus average bitrate (file size ÷ duration), on the upload button.

**Persistence (`src/lib/storage.js`, `src/lib/progress.js`)** — all saved state lives in localStorage under the `freqroom:` prefix, and every access is try/catch-guarded, so the app runs on defaults when storage is blocked. `usePersistentState` backs `theme` (`system`/`light`/`dark`), `gainDb`, `q`, `focus`, `autoplay`, `spectrum`, and `progress`; the engine saves `volume`. `progress` holds the level per mode, lifetime totals, and per-octave accuracy (`stats[family][bucket]`, 10 octave buckets from 31.5 Hz). `FrequencyTrainer` reports each answer via `onResult` (`{ mode, family, freq, correct, level, points, errOct, errDb }`, where `level` is the level *after* the answer and `points` was scored at the level it was played at), and `App` folds it into saved progress with `recordResult` and into the in-memory session with `addResult`. `heatFor` drives the graph's weak-spot strip and `pickWeighted` drives "Focus weak bands". "Reset progress" clears progress only and "Clear saved data" calls `clearAll()` and reloads; both sit at the bottom of the left column (`.side-footer`) and confirm through `ConfirmDialog` (in-app `<dialog>`; `App` passes a `{ title, message, confirmLabel, onConfirm }` request) rather than `window.confirm`. The reset icon beside the Controls label restores Volume/Gain/Q defaults (`DEFAULT_VOLUME` in the engine, `DEFAULT_GAIN_DB`/`DEFAULT_Q` in `App`) and only shows when one has changed. `index.html` reads the saved theme before first paint.

**Scoring (`src/lib/scoring.js`)** — `trialPoints` = `round(10 · log₂(choicesFor(mode, level)) × credit)`: choices are the band count (×2 for Mixed/Shelves via `pickDirection`), or for Sweep the number of ±tolerance windows across `SWEEP_RANGE`; credit is 0/1, or `sweepCredit` (1 within tolerance, linear to 0 at `SWEEP_ZERO_AT` = 3× it), or for Match EQ `matchCredit` (the weaker of the octave and dB credits; choices multiply Sweep's windows by the ±12 dB gain windows). Levels and weak-spot stats still use the pass/fail `correct`. `addResult(tally, result)` builds the tally both the session and `progress.lifetime` use: `{ total, correct, points, streak, bestStreak, recent (last 10), modes: { [mode]: { total, correct, points, level, bestLevel, errSum, errN, errDbSum, errDbN } } }`; missing fields default, so old `{ total, correct }` lifetimes upgrade on the next answer. Update the Points and Scoring section of Technical Details if these constants change.

**Challenge links (`src/lib/challenge.js`)** — `?mode=&gain=&q=&source=&level=` (source: `pink`/`white`/`drums`/`band` only), with `dir=` (`boost`/`dip`, sweep mode only) for the Sweep direction. `App` parses once on load with `parseChallenge` (invalid values are dropped, numbers clamped), applies gain/q/level, passes `initialSource` to `TrackSelector`, `initialMode`/`initialLevel` and `initialSweepDir` to `FrequencyTrainer`, then strips the query with `history.replaceState`. The trainer's Share button builds the link with `buildChallengeUrl`, including only the settings the mode uses, and copies it via `copyText` (clipboard, or a prompt fallback).

**Styles** — `src/App.css` only `@import`s the files in `src/styles/`, one per area (base tokens, layout, header, panels, source, controls, buttons, score, loop-and-switches, misc, footer, dialogs, trainer, graph, keys, responsive). The import order is the cascade order, so keep it; `responsive.css` must stay last. `base.css` clips horizontal overflow on `html, body` (`overflow-x: clip`), so wide content must provide its own `overflow-x: auto` scroller (like `.td-table-wrap` in `TechnicalDetails.css`) — it can't rely on the page scrolling sideways, and off-screen content is clipped, not reachable. `clip` is deliberately used instead of `hidden` because `hidden` would turn the body into a scroll container and break the sticky side column in `layout.css`.

**Trainer parts (`src/components/TrainerParts.jsx`)** — stateless pieces of the trainer panel (`QuickStart`, `ModePicker`, `BandRows`, `GainRow`, `AnswerLegend`, `Transport`, `StreakMeter`, `ExploreBody`); `FrequencyTrainer` keeps the state and passes props in. `QuickStart` (shown until a source loads) is one panel with three step columns split by hairlines; step 1 is lit. `ModePicker` lays `MODES` out by `MODE_GROUPS`: Bands (Boosts/Cuts/Mixed) and Filters (Shelves/Pass Filters) are `.mode-panel` cards whose bottom edge is a flush strip of `.mode-key`s, one per mode (small sketch, label, badge; one click opens the mode — deliberately not a toggle, since picking opens rather than selects). Sweep's card has Boost and Dip keys whose `opts: { dir }` reach `selectMode(mode, opts)` to set `sweepSign` (there is no direction screen). How Much?, Match EQ, and Explore get a card each. Adding a mode means adding it to `MODES` *and* `MODE_GROUPS`. `useMediaQuery` (`src/hooks/useMediaQuery.js`) backs both the System theme and FreqGraph's compact phone layout.

**Theme** — `App` resolves `theme` (default `system`, which follows `prefers-color-scheme` live) to `data-theme="dark|light"` on `document.documentElement`; the CSS variables in `src/styles/base.css` handle the rest. The header button cycles System → Light → Dark. The choice is saved (see Persistence), and `index.html` applies it before first paint.

**Offline / install (`public/sw.js`, `public/manifest.webmanifest`)** — the service worker is registered from `main.jsx` in production builds only. Page navigations are network-first with the cached `/` shell as the offline fallback; other same-origin GETs are cache-first and refreshed in the background (asset names are content-hashed). Bump `CACHE` in `sw.js` when changing the caching strategy. Icons: `icon-192/512.png` (rounded), `icon-maskable-512.png` (full-bleed), and `apple-touch-icon.png`, all rendered from `favicon.svg`.

## Deployment

Deployed on Cloudflare Pages. `public/_redirects` contains `/* /index.html 200` to enable client-side routing — any new Wouter routes will work automatically without changes to this file.

## Key constants (`src/lib/progression.js`)

| Constant | Value | Meaning |
|---|---|---|
| `CORRECT_TO_ADVANCE` | 3 | Correct streak needed to level up |
| `WRONG_TO_DECREASE` | 2 | Wrong streak needed to level down |
| `MIN_LEVEL` / `MAX_LEVEL` | 2 / 15 | Band count range |
