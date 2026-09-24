// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'preact/hooks';
import { render, fireEvent, screen, cleanup } from '@testing-library/preact';
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
    for (const m of MODES) expect(screen.getByText(m.label)).toBeInTheDocument();
    expect(screen.queryByText('Start Trial')).not.toBeInTheDocument();
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