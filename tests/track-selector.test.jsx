// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/preact';
import { TrackSelector } from '../src/components/TrackSelector.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const fakeCtx = () => ({
  sampleRate: 48000,
  createBuffer: (channels, length, sr) => ({
    numberOfChannels: channels, length, sampleRate: sr,
    getChannelData: () => new Float32Array(length),
  }),
});

function makeEngine(overrides = {}) {
  return {
    isLoaded: true, isLoading: false, isPlaying: false, loadError: null,
    volume: 0.5, sampleRate: 48000, duration: 30, loop: null,
    play: vi.fn(), stop: vi.fn(), seek: vi.fn(), setVolume: vi.fn(),
    getCurrentOffset: vi.fn(() => 0), setLoop: vi.fn(),
    loadBuffer: vi.fn(async () => {}), getCtx: fakeCtx,
    ...overrides,
  };
}

function renderSelector({ engine: engineOverrides = {}, controlsChanged = false } = {}) {
  const engine = makeEngine(engineOverrides);
  const onSourceChange = vi.fn();
  const onResetControls = vi.fn();
  const utils = render(
    <TrackSelector
      engine={engine} gainDb={6} setGainDb={vi.fn()} q={1.4} setQ={vi.fn()}
      focus={false} setFocus={vi.fn()} autoplay={false} setAutoplay={vi.fn()}
      initialSource={undefined} onSourceChange={onSourceChange}
      controlsChanged={controlsChanged} onResetControls={onResetControls}
    />
  );
  return { engine, onSourceChange, onResetControls, ...utils };
}

// A tiny valid 16-bit PCM WAV header, so probeAudioFile reports real specs for
// the upload button
function wavBytes({ rate = 44100, channels = 2, bits = 16 } = {}) {
  const b = new Uint8Array(44);
  const ascii = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  const u16 = (o, v) => { b[o] = v & 0xff; b[o + 1] = (v >>> 8) & 0xff; };
  const u32 = (o, v) => { b[o] = v & 0xff; b[o + 1] = (v >>> 8) & 0xff; b[o + 2] = (v >>> 16) & 0xff; b[o + 3] = (v >>> 24) & 0xff; };
  ascii(0, 'RIFF'); u32(4, 36); ascii(8, 'WAVE'); ascii(12, 'fmt ');
  u32(16, 16); u16(20, 1); u16(22, channels); u32(24, rate);
  u32(28, rate * channels * (bits / 8)); u16(32, channels * (bits / 8)); u16(34, bits);
  return b;
}

async function uploadWav(container, overrides) {
  const { engine } = renderSelector(overrides);
  const file = new File([wavBytes()], 't.wav', { type: 'audio/wav' });
  pickFile(container, file);
  return { engine, file };
}

function pickFile(container, file) {
  const input = container.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// Picking a file flips isUpload (slider appears) but the upload-complete effect
// writes getCurrentOffset() back over position; settle the whole chain before
// driving the slider so no late setPosition(0) clobbers our inputs.
async function uploadAndSettle(container, file) {
  pickFile(container, file);
  await waitFor(() => {
    expect(container.querySelector('#ctrl-position')).not.toBeNull();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });
}

describe('TrackSelector', () => {
  it('lists the built-in sources and the upload slot', () => {
    renderSelector();
    expect(screen.getByText('Pink Noise')).toBeInTheDocument();
    expect(screen.getByText('White Noise')).toBeInTheDocument();
    expect(screen.getByText('Upload File')).toBeInTheDocument();
  });

  it('loads pink noise on click and reports the source change', async () => {
    const { engine, onSourceChange } = renderSelector();
    fireEvent.click(screen.getByText('Pink Noise'));
    expect(onSourceChange).toHaveBeenCalledWith('pink');
    await waitFor(() => expect(engine.loadBuffer).toHaveBeenCalledTimes(1));
    // the generated AudioBuffer goes straight to loadBuffer
    expect(engine.loadBuffer.mock.calls[0][0].numberOfChannels).toBe(2);
    expect(document.querySelector('.track-btn.active')).toHaveTextContent('Pink Noise');
  });

  it('shows uploaded file specs from the parsed header', async () => {
    const { container } = renderSelector();
    const file = new File([wavBytes()], 'mix.wav', { type: 'audio/wav' });
    await uploadAndSettle(container, file);
    expect(await screen.findByText(/44.1 kHz · 16-bit · Stereo/)).toBeInTheDocument();
    expect(container.querySelector('.control-duration').textContent).toBe('/0:30');
  });

  it('seeks on keyboard/assistive changes but not mid-drag', async () => {
    const { engine, container } = renderSelector();
    const emptyWav = new File([new Uint8Array(44)], 'a.wav', { type: 'audio/wav' });
    await uploadAndSettle(container, emptyWav);

    const slider = container.querySelector('#ctrl-position');
    // keyboard: onChange only
    fireEvent.change(slider, { target: { value: '5' } });
    expect(engine.seek).toHaveBeenCalledWith(5);

    // drag: pointerdown defers seeking until the pointer is released
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '8' } });
    expect(engine.seek).not.toHaveBeenCalledWith(8);
    fireEvent.pointerUp(slider);
    expect(engine.seek).toHaveBeenLastCalledWith(8);
  });

  it('ends a drag on pointercancel so keyboard seeking keeps working', async () => {
    const { engine, container } = renderSelector();
    const emptyWav = new File([new Uint8Array(44)], 'a.wav', { type: 'audio/wav' });
    await uploadAndSettle(container, emptyWav);

    const slider = container.querySelector('#ctrl-position');
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '7' } });
    fireEvent.pointerCancel(slider);
    expect(engine.seek).toHaveBeenLastCalledWith(7);
    // the drag is over, so a keyboard change seeks immediately again
    fireEvent.change(slider, { target: { value: '3' } });
    expect(engine.seek).toHaveBeenLastCalledWith(3);
  });

  it('seeks exactly once when a drag ends by pointerup then loses capture', async () => {
    const { engine, container } = renderSelector();
    const emptyWav = new File([new Uint8Array(44)], 'a.wav', { type: 'audio/wav' });
    await uploadAndSettle(container, emptyWav);

    const slider = container.querySelector('#ctrl-position');
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '8' } });
    // pointerup handles the seek, then the implicit released capture fires and
    // hits the same drag-end guard — it must not seek a second time
    fireEvent.pointerUp(slider);
    fireEvent.pointerCancel(slider);
    expect(engine.seek).toHaveBeenCalledTimes(1);
    expect(engine.seek).toHaveBeenLastCalledWith(8);
  });

  it('records loop A and B through the engine only when ordered correctly', async () => {
    const { engine, container } = renderSelector();
    const emptyWav = new File([new Uint8Array(44)], 'a.wav', { type: 'audio/wav' });
    await uploadAndSettle(container, emptyWav);

    const slider = container.querySelector('#ctrl-position');
    fireEvent.change(slider, { target: { value: '5' } });
    fireEvent.click(screen.getByText('Set A'));
    // B is not set yet: start only is passed so the engine keeps the whole track
    expect(engine.setLoop).toHaveBeenLastCalledWith(null, undefined);

    fireEvent.change(slider, { target: { value: '30' } });
    fireEvent.click(screen.getByText('Set B'));
    expect(engine.setLoop).toHaveBeenLastCalledWith(5, 30);
  });

  it('only shows the reset-controls button after a control changes', () => {
    renderSelector({ controlsChanged: false });
    expect(screen.queryByLabelText('Reset volume, gain, and Q to defaults')).not.toBeInTheDocument();

    const { onResetControls } = renderSelector({ controlsChanged: true });
    fireEvent.click(screen.getByLabelText('Reset volume, gain, and Q to defaults'));
    expect(onResetControls).toHaveBeenCalled();
  });
});