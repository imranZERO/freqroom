// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'preact/hooks';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/preact';
import { FrequencyTrainer, MODES } from '../src/components/FrequencyTrainer.jsx';
import { EMPTY_PROGRESS, recordResult } from '../src/lib/progress.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// frequency-trainer takes the engine as a prop, so a stub object exercises it
// without touching the Web Audio API.
function makeEngine(overrides = {}) {
  return {
    isLoaded: true, isLoading: false, isPlaying: false, loadError: null,
    volume: 0.5, sampleRate: 48000, duration: 30, loop: null,
    play: vi.fn(), stop: vi.fn(), seek: vi.fn(), setVolume: vi.fn(),
    getCurrentOffset: vi.fn(() => 0), setLoop: vi.fn(), loadBuffer: vi.fn(),
    getCtx: vi.fn(() => null),
    ...overrides,
  };
}

function renderTrainer({ random = null, engine: engineOverrides = {}, props = {} } = {}) {
  const engine = makeEngine(engineOverrides);
  const onResult = vi.fn();
  let spy = null;
  if (random !== null) spy = vi.spyOn(Math, 'random').mockReturnValue(random);
  const utils = render(
    <FrequencyTrainer
      engine={engine}
      gainDb={6}
      q={1.4}
      progress={EMPTY_PROGRESS}
      focus={false}
      autoplay={false}
      onResult={onResult}
      sourceId="pink"
      {...props}
    />
  );
  return { engine, onResult, spy, utils };
}

// Moves a Boost mode trial through to an active trial at the first band
async function startBoostTrial() {
  const ctx = renderTrainer({ random: 0 });
  fireEvent.click(screen.getByText('Boosts'));
  fireEvent.click(screen.getByText('Start Trial'));
  return ctx;
}

describe('FrequencyTrainer', () => {
  it('shows the mode picker before a mode is chosen', () => {
    renderTrainer();
    expect(screen.getByText('Choose Test Mode')).toBeInTheDocument();
    // every mode has a button (grouped keys may shorten the visible label, not the accessible name)
    const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const m of MODES) expect(screen.getAllByRole('button', { name: new RegExp(esc(m.label)) }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Start Trial')).not.toBeInTheDocument();
  });

  it('puts Bands and Filters modes on keys in a shared panel, one click each', () => {
    renderTrainer();
    const bands = screen.getByRole('group', { name: 'Bands' });
    expect([...bands.querySelectorAll('.mode-key-label')].map(k => k.textContent)).toEqual(['Boosts', 'Cuts', 'Mixed']);
    const filters = screen.getByRole('group', { name: 'Filters' });
    expect([...filters.querySelectorAll('.mode-key-label')].map(k => k.textContent)).toEqual(['Shelves', 'Pass']);

    fireEvent.click(screen.getByRole('button', { name: /^Mixed:/ }));
    expect(screen.getByText(/· Mixed/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Change mode'));
    fireEvent.click(screen.getByRole('button', { name: /^Pass Filters:/ }));
    expect(screen.getByText(/· Pass Filters/)).toBeInTheDocument();
  });

  it('gives each octave of the accuracy strip an app tooltip', () => {
    const progress = { ...EMPTY_PROGRESS, stats: { peak: { 5: { n: 4, hits: 3 } } } };
    const { utils } = renderTrainer({ props: { progress } });
    const hits = [...utils.container.querySelectorAll('.graph-heat-hit:not(.graph-heat-hit-label)')];
    expect(hits).toHaveLength(10);
    expect(hits[0].dataset.tooltip).toBe('31.5 Hz octave · not rated yet (0 of 3 answers)');
    expect(hits[5].dataset.tooltip).toBe('1 kHz octave · 3/4 correct (75%)');
    // the outer segments' tooltips align inward so they stay inside the graph
    expect(hits[0]).toHaveClass('tt-start');
    expect(hits[9]).toHaveClass('tt-end');
    expect(utils.container.querySelector('.graph-heat title')).toBeNull();
  });

  it('labels the EQ regions and reads out the frequency under the mouse', () => {
    const { utils } = renderTrainer();
    const labels = [...utils.container.querySelectorAll('.graph-region-label')].map(t => t.textContent);
    expect(labels).toEqual(['Sub Bass', 'Bass', 'Low Mid', 'Midrange', 'Upper Mid', 'Presence', 'Brilliance']);

    const svg = utils.container.querySelector('.freq-graph-svg');
    const vh = Number(svg.getAttribute('viewBox').split(' ')[3]);
    // a 600 × vh box, so client coordinates equal viewBox units
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: vh });
    const title = () => utils.container.querySelector('.graph-readout-title, .graph-cursor-text').textContent;
    expect(title()).toBe('RESPONSE');
    // x = 32 + 554 · log10(1000 / 20) / 3 is 1 kHz; y = 100 is inside the plot
    const x1k = 32 + (554 * Math.log10(50)) / 3;
    fireEvent.pointerMove(svg, { pointerType: 'mouse', clientX: x1k, clientY: 100 });
    expect(title()).toMatch(/^1\.00 kHz · B5 · Midrange$/);
    expect(utils.container.querySelector('.graph-cursor-line')).not.toBeNull();
    // touches don't hover; leaving clears it
    fireEvent.pointerLeave(svg);
    expect(title()).toBe('RESPONSE');
    fireEvent.pointerMove(svg, { pointerType: 'touch', clientX: x1k, clientY: 100 });
    expect(title()).toBe('RESPONSE');
  });

  it('draws the live spectrum from the engine\'s analyser while playing, if switched on', async () => {
    const analyser = {
      frequencyBinCount: 1024, context: { sampleRate: 48000 },
      getFloatFrequencyData: vi.fn(arr => arr.fill(-50)),
    };
    const { utils } = renderTrainer({ engine: { isPlaying: true, getAnalyser: () => analyser }, props: { spectrum: true } });
    const line = utils.container.querySelector('.graph-spectrum-line');
    expect(utils.container.querySelector('.graph-spectrum')).toHaveClass('is-live');
    await waitFor(() => expect(line.getAttribute('d')).toMatch(/^M32\.0,/));
    expect(analyser.getFloatFrequencyData).toHaveBeenCalled();
  });

  it('centres the spectrum on the sound, not on a silent first frame', async () => {
    // playback restarting: the analyser reads silence first, then pink-ish noise
    let calls = 0;
    const analyser = {
      frequencyBinCount: 1024, context: { sampleRate: 48000 },
      getFloatFrequencyData: arr => {
        calls++;
        if (calls === 1) return arr.fill(-Infinity);
        for (let i = 0; i < arr.length; i++) arr[i] = -50 - 10 * Math.log10(Math.max(1, i));
      },
    };
    const { utils } = renderTrainer({ engine: { isPlaying: true, getAnalyser: () => analyser }, props: { spectrum: true } });
    const line = utils.container.querySelector('.graph-spectrum-line');
    // give the points a few frames (~0.2 s) to ease up from the silent start
    await waitFor(() => expect(calls).toBeGreaterThan(14), { timeout: 2000 });
    const ys = [...line.getAttribute('d').matchAll(/[ML][\d.]+,([\d.]+)/g)].map(m => Number(m[1]));
    // pink noise reads flat, so the trace sits on the 0 dB line (y = 17 + 144 / 2 = 89
    // on the wide layout), not pinned to the plot's top edge (y = 17)
    for (const y of ys) expect(Math.abs(y - 89)).toBeLessThan(6);
  });

  it('keeps the spectrum dark during a quiz trial until it is answered', async () => {
    const analyser = { frequencyBinCount: 1024, context: { sampleRate: 48000 }, getFloatFrequencyData: arr => arr.fill(-50) };
    const { utils } = renderTrainer({ random: 0, engine: { isPlaying: true, getAnalyser: () => analyser }, props: { spectrum: true } });
    const layer = () => utils.container.querySelector('.graph-spectrum');
    fireEvent.click(screen.getByText('Boosts'));
    fireEvent.click(screen.getByText('Start Trial'));
    expect(layer()).not.toHaveClass('is-live');        // it would give the band away
    // Flat shows the source's own spectrum, once the EQ'd sound has left the analyser
    fireEvent.click(screen.getByText('▶ Flat'));
    expect(layer()).not.toHaveClass('is-live');
    await waitFor(() => expect(layer()).toHaveClass('is-live'), { timeout: 1500 });
    fireEvent.click(screen.getByText('▶ EQ'));         // back to EQ: dark again at once
    expect(layer()).not.toHaveClass('is-live');
    fireEvent.click(utils.container.querySelectorAll('.freq-btn')[0]);
    fireEvent.click(screen.getByText('Check Answer'));
    expect(layer()).toHaveClass('is-live');            // after answering, A/B it freely
  });

  it('puts a Spectrum toggle beside Back / Share once a mode is open', () => {
    const setSpectrum = vi.fn();
    const { utils } = renderTrainer({ props: { spectrum: true, setSpectrum } });
    expect(screen.queryByRole('button', { name: 'Live spectrum' })).toBeNull();   // mode picker: nothing plays
    fireEvent.click(screen.getByText('Boosts'));
    const toggle = screen.getByRole('button', { name: 'Live spectrum' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle.closest('.trainer-header-end')).not.toBeNull();
    fireEvent.click(toggle);
    expect(setSpectrum).toHaveBeenCalledWith(false);
    // also in the trial header and in Explore
    fireEvent.click(screen.getByText('Start Trial'));
    expect(utils.container.querySelector('.trainer-header-end .spectrum-toggle')).not.toBeNull();
    fireEvent.click(screen.getByText('← Back'));
    fireEvent.click(screen.getByText('Explore'));
    expect(utils.container.querySelector('.trainer-header-end .spectrum-toggle')).not.toBeNull();
  });

  it('shows the spectrum for Match EQ\'s Yours once it has settled', async () => {
    const analyser = { frequencyBinCount: 1024, context: { sampleRate: 48000 }, getFloatFrequencyData: arr => arr.fill(-50) };
    const { utils } = renderTrainer({ random: 0, engine: { isPlaying: true, getAnalyser: () => analyser }, props: { spectrum: true, initialMode: 'match' } });
    const layer = () => utils.container.querySelector('.graph-spectrum');
    fireEvent.click(screen.getByText('Start Trial'));
    fireEvent.keyDown(window, { key: 'ArrowUp' });              // make a guess so Yours can play
    fireEvent.click(screen.getByText('▶ Target'));
    expect(layer()).not.toHaveClass('is-live');
    fireEvent.click(screen.getByText('▶ Yours'));
    await waitFor(() => expect(layer()).toHaveClass('is-live'), { timeout: 1500 });
  });

  it('leaves the spectrum out when switched off', () => {
    const { utils } = renderTrainer({ engine: { isPlaying: true, getAnalyser: () => null }, props: { spectrum: false } });
    expect(utils.container.querySelector('.graph-spectrum')).toBeNull();
  });

  it('shows the quick start before a source is loaded, step 1 lit', () => {
    const { utils } = renderTrainer({ engine: { isLoaded: false } });
    const steps = [...utils.container.querySelectorAll('.qs-step')];
    expect(steps.map(li => li.querySelector('.qs-title').textContent)).toEqual(['Load a source', 'Choose a mode', 'Listen and pick']);
    expect(steps[0]).toHaveClass('is-current');
    expect(utils.container.querySelector('.quickstart button')).toBeNull();
  });

  it('starts a trial with the level band count and transport controls', async () => {
    const { utils } = await startBoostTrial();
    // level 2 (default min) → two band buttons
    expect(utils.container.querySelectorAll('.freq-btn')).toHaveLength(2);
    expect(screen.getByText('▶ EQ')).toBeInTheDocument();
    expect(screen.getByText('▶ Flat')).toBeInTheDocument();
    expect(screen.getByText('Check Answer')).toBeDisabled();
  });

  it('marks a correct answer and reports it through onResult', async () => {
    const { engine, onResult, utils } = await startBoostTrial();
    // random() = 0 → the hidden band is the first one; boost sign is fixed +1
    const first = utils.container.querySelectorAll('.freq-btn')[0];
    fireEvent.click(first);
    expect(screen.getByText('Ready to check')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Check Answer'));

    expect(screen.getByText('✓ Correct!')).toBeInTheDocument();
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ mode: 'boost', correct: true, level: 2 }));
    // 2 bands = 1 bit of choice = 10 points
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ points: 10, errOct: null }));
    expect(screen.getByText('+10 pts')).toBeInTheDocument();
    expect(engine.stop).toHaveBeenCalled();
    expect(screen.getByText('Next Trial →')).toBeInTheDocument();
    // an answered trial no longer lets you pick another band
    expect(utils.container.querySelector('.freq-btn')).toBeDisabled();
  });

  it('reveals a wrong answer with the your-pick/answer legend', async () => {
    const { onResult, utils } = await startBoostTrial();
    const second = utils.container.querySelectorAll('.freq-btn')[1];
    fireEvent.click(second);
    fireEvent.click(screen.getByText('Check Answer'));

    expect(screen.getByText('✗ Incorrect')).toBeInTheDocument();
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ correct: false, freq: expect.any(Number) }));
    expect(screen.getByText('Was the answer')).toBeInTheDocument();
    expect(screen.getByText('Your pick')).toBeInTheDocument();
  });

  it('toggles the EQ/Flat play mode and gives the engine the right filter lists', async () => {
    const { engine } = await startBoostTrial();
    fireEvent.click(screen.getByText('▶ EQ'));
    expect(screen.getByText('◼ EQ')).toBeInTheDocument();
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(engine.play).toHaveBeenLastCalledWith([expect.objectContaining({ type: 'peaking', gain: 6 })]);
    // Flat crossfades with an empty filter list
    fireEvent.click(screen.getByText('▶ Flat'));
    expect(engine.play).toHaveBeenLastCalledWith([]);
    expect(screen.getByText('◼ Flat')).toBeInTheDocument();
  });

  it('supports the keyboard: 1–9 select bands, Enter checks', async () => {
    const { onResult } = await startBoostTrial();
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByText('Ready to check')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ mode: 'boost', correct: true }));
    // Enter after answering advances to the next trial
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByText('Check Answer')).toBeInTheDocument();
  });

  it('lets the arrow keys step through the bands', async () => {
    const { utils } = await startBoostTrial();
    fireEvent.keyDown(window, { key: 'ArrowRight' }); // no selection yet → first band
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    const selected = utils.container.querySelector('.freq-btn.f-selected');
    expect(selected).not.toBeNull();
    expect(utils.container.querySelectorAll('.freq-btn')[0]).not.toHaveClass('f-selected');
    expect(utils.container.querySelectorAll('.freq-btn')[1]).toHaveClass('f-selected');
  });

  it('uses ↑/↓ to pick the direction row in Mixed mode', async () => {
    const { onResult } = renderTrainer({ random: 0 });
    fireEvent.click(screen.getByText('Mixed'));
    fireEvent.click(screen.getByText('Start Trial'));

    // random=0 → hidden sign is +1 (boost row); pressing ↓ selects the cut row
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ mode: 'both', correct: false }));
  });

  it('shows a nudgeable sweep guess and scores it against the answer', async () => {
    const { onResult } = renderTrainer({ random: 0, props: { initialMode: 'sweep', initialLevel: 1 } });
    fireEvent.click(screen.getByText('Start Trial'));

    // level 1 tolerance is ±1 octave (hint splits '±1' across a <strong>)
    expect(document.querySelector('.sweep-hint').textContent).toContain('±1 oct');
    expect(document.querySelector('.start-desc')).toBeNull();

    fireEvent.keyDown(window, { key: 'ArrowRight' }); // 1000 → 1059 Hz guess
    expect(screen.getByText(/Guess 1.06 kHz/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Enter' });

    // hidden sweep answer is ~42 Hz (first SWEEP_GRID entry), ~4.6 octaves off
    expect(screen.getByText('✗ Incorrect')).toBeInTheDocument();
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ mode: 'sweep', correct: false }));
    // far beyond 3× the tolerance: no partial credit, and the error is reported
    const r = onResult.mock.calls.at(-1)[0];
    expect(r.points).toBe(0);
    expect(r.errOct).toBeGreaterThan(4);
    expect(screen.queryByText(/pts$/)).toBeNull();
  });

  it('picks the Sweep direction on its card: Boost and Dip keys open Sweep that way', () => {
    const { utils } = renderTrainer({ random: 0 });
    const sweep = screen.getByRole('group', { name: 'Sweep' });
    expect([...sweep.querySelectorAll('.mode-key-label')].map(k => k.textContent)).toEqual(['Boost', 'Dip']);
    const readout = () => [...utils.container.querySelectorAll('.graph-readout')].map(n => n.textContent).join('');

    fireEvent.click(screen.getByRole('button', { name: /^Sweep dip:/ }));
    expect(screen.getByText('−6dB · Sweep')).toBeInTheDocument();
    expect(document.querySelector('.start-desc').textContent).toContain('dip');
    expect(document.querySelector('.sweep-dir')).toBeNull();
    // Enter starts the trial; the hidden filter is a cut
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(readout()).toContain('−6 dB');
    expect(utils.container.querySelector('.graph-placeholder').textContent).toContain('dip');

    fireEvent.click(screen.getByText('← Back'));
    fireEvent.click(screen.getByRole('button', { name: /^Sweep boost:/ }));
    expect(screen.getByText('+6dB · Sweep')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Start Trial'));
    expect(readout()).toContain('+6 dB');
  });

  it('honours a sweep dip direction from a challenge link', () => {
    const { utils } = renderTrainer({ random: 0, props: { initialMode: 'sweep', initialLevel: 1, initialSweepDir: 'dip' } });
    expect(screen.getByText('−6dB · Sweep')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Start Trial'));
    const readout = [...utils.container.querySelectorAll('.graph-readout')].map(n => n.textContent).join('');
    expect(readout).toContain('−6 dB');
  });

  it('How Much? offers the level\'s gain keys at a marked frequency and scores the pick', () => {
    // random() = 0 → the first frequency and the first gain choice (+3 dB)
    const { engine, onResult, utils } = renderTrainer({ random: 0, props: { initialMode: 'gain' } });
    expect(screen.getByText('Level 1')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Start Trial'));
    const keys = [...utils.container.querySelectorAll('.gain-grid .freq-btn')].map(b => b.textContent);
    expect(keys).toEqual(['+3dB', '+9dB']);
    expect(screen.getByText(/How many dB at/)).toBeInTheDocument();
    // the hidden bell carries its own gain; the Gain slider (6 dB) doesn't apply
    fireEvent.keyDown(window, { key: ' ' });
    expect(engine.play).toHaveBeenLastCalledWith([expect.objectContaining({ type: 'peaking', gain: 3 })]);

    fireEvent.keyDown(window, { key: '2' });              // +9: wrong
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByText('✗ Incorrect')).toBeInTheDocument();
    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'gain', family: 'gain', correct: false, points: 0 }));

    fireEvent.keyDown(window, { key: 'Enter' });          // next trial
    fireEvent.keyDown(window, { key: 'ArrowRight' });     // first key: +3
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByText('✓ Correct!')).toBeInTheDocument();
    expect(screen.getByText('+10 pts')).toBeInTheDocument();
    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'gain', correct: true, points: 10 }));
  });

  it('Match EQ lets you shape your own bell, compare it with the target, and scores both errors', () => {
    // random() = 0 → the lowest grid frequency and a −3 dB bell
    const { engine, onResult } = renderTrainer({ random: 0, props: { initialMode: 'match' } });
    fireEvent.click(screen.getByText('Start Trial'));
    expect(screen.getByText('▶ Target')).toBeInTheDocument();
    expect(screen.getByText('▶ Yours')).toBeDisabled();
    expect(screen.getByText('Check Answer')).toBeDisabled();

    // keys move your bell from 1 kHz / 0 dB
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(screen.getByText(/Yours 1.00 kHz −0.5 dB/)).toBeInTheDocument();
    expect(screen.getByText('▶ Yours')).not.toBeDisabled();

    // Space: Target, then Yours (your bell as a one-item list)
    fireEvent.keyDown(window, { key: ' ' });
    expect(engine.play).toHaveBeenLastCalledWith([expect.objectContaining({ gain: -3 })]);
    fireEvent.keyDown(window, { key: ' ' });
    expect(engine.play).toHaveBeenLastCalledWith([expect.objectContaining({ frequency: 1000, gain: -0.5 })]);
    // moving your bell while it plays retunes it live
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(engine.play).toHaveBeenLastCalledWith([expect.objectContaining({ gain: -1 })]);

    // down to the bottom of the range (clamped at 40 Hz), within ±1 oct and ±4 dB
    for (let i = 0; i < 60; i++) fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByText('✓ Correct!')).toBeInTheDocument();
    const r = onResult.mock.lastCall[0];
    expect(r).toMatchObject({ mode: 'match', family: 'match', correct: true, points: 37 });
    expect(r.errDb).toBe(2);
    expect(r.errOct).toBeLessThan(1);
  });

  it('Explore mode moves the curve with the keyboard and plays it without scoring', () => {
    const { engine, onResult, utils } = renderTrainer();
    const readout = () => [...utils.container.querySelectorAll('.graph-readout')].map(n => n.textContent).join('');
    const guide = () => utils.container.querySelector('.explore-guide').textContent;

    fireEvent.click(screen.getByText('Explore'));
    expect(readout()).toContain('BELL');
    expect(readout()).toContain('+6 dB');
    expect(guide()).toContain('1.00 kHz');

    fireEvent.keyDown(window, { key: 'ArrowUp' });       // +1 dB
    expect(readout()).toContain('+7 dB');
    for (let i = 0; i < 12; i++) fireEvent.keyDown(window, { key: 'ArrowRight' }); // up an octave
    expect(guide()).toContain('2.00 kHz');

    // Space plays the EQ: the engine gets the explore filter as a one-item list
    fireEvent.keyDown(window, { key: ' ' });
    expect(engine.play).toHaveBeenLastCalledWith([expect.objectContaining({ type: 'peaking', gain: 7 })]);
    expect(engine.play.mock.lastCall[0][0].frequency).toBeCloseTo(2000, 6);

    // 2 switches to a low shelf; the live EQ follows
    fireEvent.keyDown(window, { key: '2' });
    expect(readout()).toContain('LOW SHELF');
    expect(engine.play).toHaveBeenLastCalledWith([expect.objectContaining({ type: 'lowshelf', gain: 7 })]);
    expect(screen.getByRole('button', { name: /Low shelf/ })).toHaveAttribute('aria-pressed', 'true');

    // pass filters ignore gain and describe what they remove
    fireEvent.click(screen.getByRole('button', { name: /High-pass/ }));
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(readout()).toContain('HIGH-PASS · 12 dB/oct');
    expect(guide()).toMatch(/Removes the lows below/);

    expect(onResult).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('← Back'));
    expect(screen.getByText('Choose Test Mode')).toBeInTheDocument();
  });

  it('uses a challenge link level only until you leave its mode', () => {
    const progress = { ...EMPTY_PROGRESS, levels: { boost: 4 } };
    renderTrainer({ props: { initialMode: 'boost', initialLevel: 9, progress } });
    expect(screen.getByText('Level 9')).toBeInTheDocument();

    // switch away and back: the saved level for Boosts is used, not the link's
    fireEvent.click(screen.getByText('Change mode'));
    fireEvent.click(screen.getByText('Cuts'));
    fireEvent.click(screen.getByText('Change mode'));
    fireEvent.click(screen.getByText('Boosts'));
    expect(screen.getByText('Level 4')).toBeInTheDocument();
  });

  it('advances the Level chip after three correct answers', async () => {
    const { onResult } = await startBoostTrial();
    expect(screen.getByText('Level 2')).toBeInTheDocument();
    const first = document.querySelectorAll('.freq-btn')[0];
    for (let i = 0; i < 3; i++) {
      fireEvent.click(first);
      fireEvent.click(screen.getByText('Check Answer'));
      fireEvent.click(screen.getByText('Next Trial →'));
    }
    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ correct: true, level: 3 }));
  });

  it('copies a share link for the current setup', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await startBoostTrial();
    fireEvent.click(screen.getByText('Share'));
    await vi.waitFor(() => expect(screen.getByText('Link copied')).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('?mode=boost'));
  });

  it('starts EQ playback on a new trial when autoplay is on', () => {
    const { engine } = renderTrainer({ random: 0, props: { autoplay: true } });
    fireEvent.click(screen.getByText('Boosts'));
    fireEvent.click(screen.getByText('Start Trial'));
    expect(engine.play).toHaveBeenCalledWith([expect.objectContaining({ type: 'peaking' })]);
    expect(screen.getByText('◼ EQ')).toBeInTheDocument();
  });

  // Mirrors App: folds each result back into the progress prop, so the level
  // chip and band count reflect the 3-up / 2-down rules end to end.
  function TrainerHarness({ engine, onResult }) {
    const [progress, setProgress] = useState(EMPTY_PROGRESS);
    return (
      <FrequencyTrainer
        engine={engine}
        gainDb={6}
        q={1.4}
        progress={progress}
        focus={false}
        autoplay={false}
        onResult={r => { onResult(r); setProgress(p => recordResult(p, r)); }}
        sourceId="pink"
      />
    );
  }

  it('drops a level after two wrong answers in a row', () => {
    const engine = makeEngine();
    const onResult = vi.fn();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<TrainerHarness engine={engine} onResult={onResult} />);
    fireEvent.click(screen.getByText('Boosts'));
    fireEvent.click(screen.getByText('Start Trial'));
    expect(screen.getByText('Level 2')).toBeInTheDocument();

    const band = i => document.querySelectorAll('.freq-btn')[i];
    // three correct in a row → Level 3, and the next trial shows three bands
    for (let i = 0; i < 3; i++) {
      fireEvent.click(band(0));
      fireEvent.click(screen.getByText('Check Answer'));
      fireEvent.click(screen.getByText('Next Trial →'));
    }
    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ correct: true, level: 3 }));
    expect(screen.getByText('Level 3')).toBeInTheDocument();
    expect(screen.getByText('0/3 correct → level up')).toBeInTheDocument();
    expect(band(2)).toBeInTheDocument();

    // first wrong: the streak starts, the level holds
    fireEvent.click(band(1));
    fireEvent.click(screen.getByText('Check Answer'));
    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ correct: false, level: 3 }));
    expect(screen.getByText('Level 3')).toBeInTheDocument();
    expect(screen.getByText('1/2 wrong → level down')).toBeInTheDocument();
    expect(document.querySelectorAll('.pip-wrong')).toHaveLength(1);

    // second wrong: down to Level 2
    fireEvent.click(screen.getByText('Next Trial →'));
    fireEvent.click(band(1));
    fireEvent.click(screen.getByText('Check Answer'));
    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ correct: false, level: 2 }));
    expect(screen.getByText('Level 2')).toBeInTheDocument();
    expect(screen.getByText('0/3 correct → level up')).toBeInTheDocument();
  });

  it('advances from an answered sweep to a fresh sweep trial', () => {
    const { onResult } = renderTrainer({ random: 0, props: { initialMode: 'sweep', initialLevel: 1 } });
    fireEvent.click(screen.getByText('Start Trial'));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ mode: 'sweep', correct: false }));

    fireEvent.click(screen.getByText('Next Trial →'));
    expect(screen.getByText('Click or drag on the graph')).toBeInTheDocument();
    expect(document.querySelector('.sweep-hint').textContent).toContain('±1 oct');
  });

  it('backs out of an active mode to the mode picker', async () => {
    const { engine } = await startBoostTrial();
    expect(screen.getByText('← Back')).toBeInTheDocument();

    fireEvent.click(screen.getByText('← Back'));
    expect(screen.getByText('Choose Test Mode')).toBeInTheDocument();
    expect(engine.stop).toHaveBeenCalled();

    // a fresh mode starts a clean trial without reloading
    fireEvent.click(screen.getByText('Cuts'));
    expect(screen.getByText('Start Trial')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Start Trial'));
    expect(screen.getByText('Check Answer')).toBeInTheDocument();
  });

  it('keeps the back button available after answering', async () => {
    const { utils } = await startBoostTrial();
    const first = utils.container.querySelectorAll('.freq-btn')[0];
    fireEvent.click(first);
    fireEvent.click(screen.getByText('Check Answer'));
    expect(screen.getByText('✓ Correct!')).toBeInTheDocument();
    fireEvent.click(screen.getByText('← Back'));
    expect(screen.getByText('Choose Test Mode')).toBeInTheDocument();
  });
});