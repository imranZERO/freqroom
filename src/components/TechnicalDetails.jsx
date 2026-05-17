import { Link } from 'wouter';
import './TechnicalDetails.css';

export function TechnicalDetails() {
  return (
    <div className="td-page">
      <header className="td-header">
        <Link href="/" className="td-back">← Back to FreqRoom</Link>
        <h1 className="td-title">Fr<span>eq</span>Room</h1>
        <p className="td-subtitle">Technical Details — how the audio processing, filter math, and training system work.</p>
      </header>

      <section className="td-section">
        <h2 className="td-h2">Why EQ Ear Training Works</h2>
        <p className="td-p">
          Human hearing is trained through repeated exposure with immediate feedback. EQ ear training
          exploits this by presenting a controlled, repeatable stimulus — the same noise source with and
          without a filter — and asking the listener to identify what changed. Over time, the brain
          learns to associate the timbral character of a spectral peak or dip with a frequency region,
          which transfers to real mixing situations.
        </p>
        <p className="td-p">
          The <strong>A/B toggle</strong> (EQ vs. Flat) is the core mechanic. Switching rapidly between
          the filtered and unfiltered signal lets the auditory system isolate the change, similar to
          visual A/B comparisons. Without the flat reference, there is no perceptual anchor.
        </p>
      </section>

      <section className="td-section">
        <h2 className="td-h2">Logarithmic Frequency Scale</h2>
        <p className="td-p">
          Human pitch perception is logarithmic — each octave doubles the frequency, and all octaves
          feel perceptually equal in size. Frequency bands in FreqRoom are spaced logarithmically
          to match this.
        </p>
        <p className="td-p">
          At level <strong>n</strong>, the app places <strong>n</strong> candidate frequencies by
          dividing the log-frequency space (20 Hz – 20 kHz) into n equal slices and placing one band
          at the geometric centre of each:
        </p>
        <div className="td-formula">{`f_i = 20 × (20000/20) ^ ((i + 0.5) / n)    for i = 0, 1, …, n−1`}</div>
        <p className="td-p">
          The geometric centre of an interval [lo, hi] is √(lo × hi), which is the midpoint in log
          space. This guarantees every octave region contributes the same number of candidate
          frequencies at every level.
        </p>
      </section>

      <section className="td-section">
        <h2 className="td-h2">The Peaking EQ Filter</h2>
        <p className="td-p">
          Each trial applies a <strong>biquad peaking EQ filter</strong> — the same type used in
          virtually every digital audio workstation. It boosts or cuts a symmetric bell-shaped region
          centred at a target frequency, implemented via the Web Audio API's <code className="td-code">BiquadFilterNode</code>{' '}
          with <code className="td-code">type: "peaking"</code>.
        </p>
        <h3 className="td-h3">Gain (dB)</h3>
        <p className="td-p">
          Sets the amplitude of the boost or cut. At +12 dB the filtered frequency is four times
          louder than the reference. At −6 dB it is half as loud. Beginners should start at 12 dB or
          higher and reduce gain as sensitivity improves.
        </p>
        <h3 className="td-h3">Q (Quality Factor / Bandwidth)</h3>
        <p className="td-p">
          Controls the width of the filter. A <strong>low Q</strong> (0.5–1.0) creates a broad curve
          spanning several octaves — easier to hear. A <strong>high Q</strong> (4–8) creates a narrow
          notch affecting only a fraction of an octave — much harder to identify.
        </p>
        <p className="td-p">
          The biquad coefficients follow the <strong>Audio EQ Cookbook</strong> by Robert Bristow-Johnson:
        </p>
        <div className="td-formula">{`A  = 10 ^ (gain / 40)\nω₀ = 2π × fc / fs\nα  = sin(ω₀) / (2Q)\n\nb0 =  1 + α·A      b1 = −2·cos(ω₀)    b2 = 1 − α·A\na0 =  1 + α/A      a1 = −2·cos(ω₀)    a2 = 1 − α/A`}</div>
        <p className="td-p">
          Where <em>fc</em> is the centre frequency and <em>fs</em> is the audio sample rate (44100
          or 48000 Hz depending on the device).
        </p>
      </section>

      <section className="td-section">
        <h2 className="td-h2">Frequency Response Visualisation</h2>
        <p className="td-p">
          The graph displays the filter's frequency response by evaluating the biquad <strong>transfer
          function H(z)</strong> on the unit circle (z = e<sup>jω</sup>), which gives the
          steady-state gain in dB at each frequency.
        </p>
        <p className="td-p">
          For normalised coefficients (b0n, b1n, b2n, a1n, a2n), the magnitude response at frequency f is:
        </p>
        <div className="td-formula">{`ω  = 2π·f / fs\n\nNr = b0n + b1n·cos(ω) + b2n·cos(2ω)\nNi = −(b1n·sin(ω) + b2n·sin(2ω))\nDr = 1 + a1n·cos(ω) + a2n·cos(2ω)\nDi = −(a1n·sin(ω) + a2n·sin(2ω))\n\n|H(f)| dB = 20·log₁₀( √((Nr² + Ni²) / (Dr² + Di²)) )`}</div>
        <p className="td-p">
          This is computed at 300 log-spaced points from 20 Hz to 20 kHz. Candidate curves are
          rendered in grey during a trial; the correct curve is revealed in colour after the answer.
        </p>
      </section>

      <section className="td-section">
        <h2 className="td-h2">Pink Noise — The Ideal Training Signal</h2>
        <p className="td-p">
          Pink noise has a <strong>1/f power spectral density</strong> — energy decreases by 3 dB
          per octave, so every octave carries equal total energy. This mirrors how human hearing
          weights frequency ranges, making every frequency region equally audible and equally
          challenging to train. It is the standard test signal for acoustic measurement.
        </p>
        <p className="td-p">
          White noise has a flat spectrum (equal energy per Hz), so it sounds increasingly bright
          because high frequencies dominate perceptually despite containing no more power per Hz than
          low frequencies.
        </p>
        <p className="td-p">
          FreqRoom generates pink noise using <strong>Paul Kellet's Voss-McCartney
          approximation</strong> — a seven-stage IIR filter applied to white noise samples:
        </p>
        <div className="td-formula">{`b0 =  0.99886·b0 + w·0.0555179\nb1 =  0.99332·b1 + w·0.0750759\nb2 =  0.96900·b2 + w·0.1538520\nb3 =  0.86650·b3 + w·0.3104856\nb4 =  0.55000·b4 + w·0.5329522\nb5 = −0.7616·b5  − w·0.0168980\noutput = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w·0.5362) × 0.11\nb6 = w·0.115926`}</div>
        <p className="td-p">
          Where <em>w</em> is a uniform white noise sample in [−1, 1]. The b5 stage uses a negative
          feedback coefficient as a complementary correction filter that improves spectral accuracy at
          higher frequencies. The 0.11 factor normalises the output. Both stereo channels are
          generated with independent filter state.
        </p>
      </section>

      <section className="td-section">
        <h2 className="td-h2">Adaptive Difficulty</h2>
        <p className="td-p">
          The level (2–15) sets the number of candidate frequency bands per trial. Advancement is
          governed by consecutive-answer streaks:
        </p>
        <div className="td-callout">
          <strong>3 correct in a row</strong> → level up (more bands, harder)<br />
          <strong>2 wrong in a row</strong> → level down (fewer bands, easier)
        </div>
        <p className="td-p">
          A single wrong answer resets the correct streak but does not immediately drop the level —
          the listener gets a chance to recover. The asymmetry (3 to advance, 2 to drop) biases the
          system toward keeping the listener near their performance ceiling rather than retreating
          on a single slip.
        </p>
      </section>

      <section className="td-section">
        <h2 className="td-h2">Note Name &amp; Region Labels</h2>
        <p className="td-p">
          After each trial, the answer frequency is labelled with its nearest musical note and its
          EQ region name.
        </p>
        <h3 className="td-h3">Note name</h3>
        <p className="td-p">
          The nearest MIDI note number is computed with A4 = 440 Hz (MIDI note 69) as the reference:
        </p>
        <div className="td-formula">{`MIDI   = round( 69 + 12 × log₂(f / 440) )\nnote   = NOTE_NAMES[ MIDI mod 12 ]     -- C C# D D# E F F# G G# A A# B\noctave = floor(MIDI / 12) − 1`}</div>
        <h3 className="td-h3">EQ region</h3>
        <div className="td-formula">{` < 80 Hz   →  Sub Bass\n80–250 Hz  →  Bass\n250–500 Hz →  Low Mid\n0.5–2 kHz  →  Midrange\n2–4 kHz    →  Upper Mid\n4–8 kHz    →  Presence\n > 8 kHz   →  Brilliance`}</div>
      </section>

      <section className="td-section">
        <h2 className="td-h2">Web Audio API Signal Chain</h2>
        <p className="td-p">
          All audio processing runs in the browser using the Web Audio API — no server, no external
          libraries. The signal chain per trial is:
        </p>
        <div className="td-formula">{`AudioBufferSourceNode → BiquadFilterNode → GainNode → AudioContext.destination`}</div>
        <p className="td-p">
          The source loops a pre-generated 30-second noise buffer. Switching between EQ and Flat stops
          the current source, captures the playback offset, then restarts with or without the filter —
          giving seamless, position-preserving A/B comparison. Volume is applied by the GainNode and
          updated in real time without restarting the source.
        </p>
      </section>

      <hr className="td-hr" />

      <section className="td-section">
        <h2 className="td-h2">Sources</h2>
        <div className="td-sources-list">
          <div className="td-source-item">
            <a href="https://webaudio.github.io/Audio-EQ-Cookbook/audio-eq-cookbook.html" target="_blank" rel="noopener noreferrer">Audio EQ Cookbook — Robert Bristow-Johnson</a>
            <p className="td-p">Canonical reference for biquad filter coefficient derivations. Used for the peaking EQ coefficients and frequency response formula.</p>
          </div>
          <div className="td-source-item">
            <a href="https://webaudio.github.io/web-audio-api/" target="_blank" rel="noopener noreferrer">Web Audio API Specification — W3C</a>
            <p className="td-p">Specification for the AudioContext, BiquadFilterNode, AudioBufferSourceNode, and GainNode used throughout the app.</p>
          </div>
          <div className="td-source-item">
            <a href="https://www.firstpr.com.au/dsp/pink-noise/" target="_blank" rel="noopener noreferrer">Pink Noise Generation — Phil Burk / Paul Kellet</a>
            <p className="td-p">Source for the Voss-McCartney pink noise approximation and filter coefficients.</p>
          </div>
          <div className="td-source-item">
            <a href="https://harmanhowtolisten.blogspot.com" target="_blank" rel="noopener noreferrer">How to Listen — Harman International</a>
            <p className="td-p">Original inspiration for the EQ ear training concept and A/B comparison methodology.</p>
          </div>
          <div className="td-source-item">
            <a href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API" target="_blank" rel="noopener noreferrer">Web Audio API — MDN Web Docs</a>
            <p className="td-p">Practical reference for Web Audio API usage, AudioContext lifecycle, and audio node graph management.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
