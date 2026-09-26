import { useEffect } from 'react';
import { SiteHeader, SiteFooter } from './SiteChrome.jsx';
import './TechnicalDetails.css';

const SECTIONS = [
  ['features', 'Features'],
  ['why', 'Why EQ Ear Training Works'],
  ['modes', 'Training Modes'],
  ['bands', 'Band Placement'],
  ['peaking', 'The Peaking EQ Filter'],
  ['shelf-pass', 'Shelf and Pass Filters'],
  ['sweep', 'Sweep Scoring'],
  ['graph', 'The Frequency Response Graph'],
  ['difficulty', 'Adaptive Difficulty'],
  ['progress', 'Progress and Focus Practice'],
  ['noise', 'Noise and Synthesized Loops'],
  ['uploads', 'Uploaded Audio'],
  ['chain', 'Web Audio Signal Chain'],
  ['labels', 'Note and Region Labels'],
  ['storage', 'Privacy, Storage, and Offline Use'],
  ['learn', 'Learn More'],
];

// Further reading, roughly from first steps to in-depth
const RESOURCES = [
  ['EQ and listening', [
    ['https://iem-eq-guide.pages.dev/', 'EQ Guide for IEMs', 'A practical guide to equalizers for audio playback, from beginner to experienced: filter types, gain, Q, and how to shape a sound.'],
    ['https://www.teachmeaudio.com/mixing/techniques/audio-spectrum', 'The Audio Spectrum — Teach Me Audio', 'The frequency ranges from sub-bass to brilliance, what lives in each, and how they sound when boosted or cut.'],
    ['https://harmanhowtolisten.blogspot.com', 'How to Listen — Harman International', 'Harman\'s critical-listening training program, which inspired FreqRoom.'],
  ]],
  ['More ear training', [
    ['https://www.soundgym.co/', 'SoundGym', 'Audio ear-training games and courses covering EQ, compression, and more.'],
    ['https://www.quiztones.com/', 'Quiztones', 'Frequency ear-training app for learning to recognise bands by ear.'],
    ['https://imaging-lab.xyz/', 'Audio Imaging Test Lab', 'Tests how well you and your headphones or speakers place sounds in the stereo image.'],
  ]],
  ['Sound and signals', [
    ['https://pudding.cool/2018/02/waveforms/', "Let's Learn About Waveforms — The Pudding", 'An interactive introduction to sound waves, frequency, amplitude, and harmonics.'],
    ['https://jackschaedler.github.io/circles-sines-signals/', 'Seeing Circles, Sines, and Signals — Jack Schaedler', 'A visual, interactive primer on digital signal processing: sampling, aliasing, and the Fourier transform.'],
    ['http://www.sengpielaudio.com/calculator-bandwidth.htm', 'Q and Bandwidth Calculator — Sengpielaudio', 'Convert between Q, bandwidth in octaves, and cutoff frequencies; the site has many more audio calculators.'],
    ['https://ccrma.stanford.edu/~jos/filters/', 'Introduction to Digital Filters — Julius O. Smith III', 'A free, rigorous online book from Stanford CCRMA on how digital filters like biquads work.'],
  ]],
];

// Every feature, grouped; `see` links to the section that explains it in depth
const FEATURES = [
  ['Training', [
    ['Six training modes', 'Boosts, Cuts, Mixed, Shelves, Pass Filters, and Sweep — peaks, dips, shelves, filter cutoffs, and free-form location.', 'modes'],
    ['Explore', 'A free-play EQ: drag a bell, shelf, or pass filter on the graph and hear it live, with a guide to what each region sounds like.', 'modes'],
    ['Adaptive difficulty', 'Each mode has its own level: 3 correct in a row levels up, 2 wrong levels down.', 'difficulty'],
    ['Gain and Q controls', 'Boost/cut amount (1–18 dB) and bell width (Q 0.5–8), applied live, even mid-trial.', 'peaking'],
    ['Instant A/B comparison', 'EQ and Flat switch without a click or restart, so both continue from the same point.', 'chain'],
    ['Frequency response graph', 'Every candidate curve is drawn during a trial and the hidden one is revealed after you answer; buttons sit under their curves.', 'graph'],
    ['Sweep scoring', 'Drag on the graph to the frequency you hear; scored by octave error with a tolerance that tightens by level.', 'sweep'],
    ['Answer labels', 'The nearest note, EQ region, filter type, or (in Sweep) your error in octaves.', 'labels'],
    ['Auto-play EQ', 'Optionally starts each trial playing the EQ straight away.', null],
    ['Focus weak bands', 'Optionally drills the octaves you miss most often.', 'progress'],
  ]],
  ['Audio', [
    ['Generated sources', 'Pink noise (recommended), white noise, and synthesized drum and band loops, all generated in the browser.', 'noise'],
    ['Your own music', 'Upload MP3, WAV, FLAC, OGG, or anything else your browser can play.', 'uploads'],
    ['File details', "The file's format, original sample rate, bit depth, channels, average bitrate, and length.", 'uploads'],
    ['Position and loop', 'Seek within an uploaded track and loop an A/B section.', 'uploads'],
    ['Volume and limiter', 'Master volume, and a limiter so large boosts never clip.', 'chain'],
  ]],
  ['Progress', [
    ['Scores', 'Session score with an accuracy meter, plus your lifetime score.', null],
    ['Weak-spot strip', 'Accuracy per octave, shown under the graph.', 'progress'],
    ['Saved between visits', 'Levels, settings, and stats are kept in your browser.', 'storage'],
    ['Resets', 'Reset the sliders to defaults, reset your progress, or clear all saved data.', 'storage'],
  ]],
  ['Everything else', [
    ['Keyboard shortcuts', '1–9/0 pick bands, ← → step, ↑ ↓ switch boost/cut in Mixed and Shelves, Space toggles EQ/Flat, Enter checks or advances.', null],
    ['Share links', 'Copy a link that recreates a challenge: mode, level, gain, Q, generated source, and for Sweep its boost/dip direction.', 'storage'],
    ['Light and dark themes', 'System (the default) follows your device; you can also pick Light or Dark, and your choice is remembered.', null],
    ['Installable and offline', 'Install it as an app and keep training without a connection.', 'storage'],
    ['Private', 'No account, no server: your audio and data never leave your browser.', 'storage'],
  ]],
];

function Section({ id, children }) {
  const index = SECTIONS.findIndex(([sid]) => sid === id);
  return (
    <section className="td-section" id={id}>
      <h2 className="td-h2">
        <span className="td-num">{String(index + 1).padStart(2, '0')}</span>
        {SECTIONS[index][1]}
      </h2>
      {children}
    </section>
  );
}

export function TechnicalDetails({ chrome }) {
  // Arriving from the app keeps its scroll position; start at the top unless a section is linked
  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0);
  }, []);

  return (
    <div className="app td-page">
      <SiteHeader {...chrome} subtitle="Technical Details — how the audio processing, filter math, and training system work" />

      <main className="app-main">

        <nav className="td-toc" aria-label="Contents">
          <h2 className="td-toc-label">Contents</h2>
          <ol>
            {SECTIONS.map(([id, title], i) => (
              <li key={id}>
                <a href={`#${id}`}><span className="td-num">{String(i + 1).padStart(2, '0')}</span>{title}</a>
              </li>
            ))}
          </ol>
        </nav>

        <Section id="features">
          <div className="td-feature-grid">
            {FEATURES.map(([group, items]) => (
              <div key={group} className="td-feature-group">
                <h3 className="td-h3">{group}</h3>
                <ul>
                  {items.map(([name, text, see]) => (
                    <li key={name}>
                      <strong>{name}</strong> — {text}
                      {see && <> <a href={`#${see}`} className="td-see">More</a></>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section id="why">
          <p className="td-p">
            Hearing is trained through repeated exposure with immediate feedback. EQ ear training presents a
            controlled, repeatable stimulus — the same source with and without a filter — and asks the listener
            to identify what changed. Over time the brain learns to associate the timbral character of a peak,
            dip, shelf, or roll-off with a frequency region, and that skill transfers to real mixing.
          </p>
          <p className="td-p">
            The <strong>A/B toggle</strong> (EQ vs. Flat) is the core mechanic. Switching between the filtered
            and unfiltered signal lets the auditory system isolate the change; without the flat reference there
            is no perceptual anchor. FreqRoom switches between the two without restarting playback (see{' '}
            <a href="#chain">Signal Chain</a>), so both sides of the comparison continue from the same point in
            the audio.
          </p>
        </Section>

        <Section id="modes">
          <p className="td-p">
            Every mode hides one filter and asks you to identify it. They differ in the filter type, what you
            answer, and how difficulty scales:
          </p>
          <div className="td-table-wrap">
            <table className="td-table">
              <thead>
                <tr><th>Mode</th><th>Hidden filter</th><th>You answer</th><th>Candidates span</th><th>Levels</th></tr>
              </thead>
              <tbody>
                <tr><td>Boosts</td><td>peaking, +gain</td><td>band</td><td>20 Hz – 20 kHz</td><td>2–15 bands</td></tr>
                <tr><td>Cuts</td><td>peaking, −gain</td><td>band</td><td>20 Hz – 20 kHz</td><td>2–15 bands</td></tr>
                <tr><td>Mixed</td><td>peaking, ±gain</td><td>band and direction</td><td>20 Hz – 20 kHz</td><td>2–15 bands</td></tr>
                <tr><td>Shelves</td><td>low/high shelf, ±gain</td><td>corner and direction</td><td>60 Hz – 10 kHz</td><td>2–8 corners</td></tr>
                <tr><td>Pass Filters</td><td>high-pass or low-pass</td><td>cutoff frequency</td><td>HP 40 Hz – 1 kHz, LP 1 – 16 kHz</td><td>2–8 cutoffs</td></tr>
                <tr><td>Sweep</td><td>peaking, ±gain</td><td>any frequency, by dragging</td><td>40 Hz – 16 kHz</td><td>1–5 (tolerance)</td></tr>
              </tbody>
            </table>
          </div>
          <p className="td-p">
            In Shelves, corners below 1 kHz are low shelves and corners above are high shelves; the direction
            (boost or cut) is random, and you answer it with the corner using the boost and cut rows. In Pass Filters the Gain slider has no effect.
          </p>
          <p className="td-p">
            <strong>Explore</strong> sits above the six modes and isn't scored. You drag one filter across the graph — left and
            right set the frequency, up and down the gain (±18 dB) — and pick its type: bell, low or high shelf, high-pass,
            or low-pass. The bell uses the Q fader. The engine retunes the filter live while EQ plays, and a guide under the
            graph names the region, the nearest note, and what a boost or cut there tends to sound like (for example,
            boxy for a low-mid boost, dull for a treble cut). Nothing is recorded to your progress.
          </p>
        </Section>

        <Section id="bands">
          <p className="td-p">
            Pitch perception is roughly logarithmic: each octave doubles the frequency, and octaves feel similar
            in size. Candidate frequencies are therefore spaced evenly on a logarithmic axis. At level{' '}
            <strong>n</strong> the mode's span [lo, hi] is divided into n equal slices in log space, with one
            candidate at the geometric centre of each:
          </p>
          <div className="td-formula">{`f_i = lo × (hi / lo) ^ ((i + 0.5) / n)      i = 0, 1, …, n − 1`}</div>
          <p className="td-p">
            The geometric centre of a slice [a, b] is √(a·b), its midpoint in log space, so candidates sit an equal
            number of octaves apart and are rounded to the nearest hertz. For the full 20 Hz – 20 kHz span (10
            octaves), level 2 places candidates 5 octaves apart and level 15 places them 2/3 of an octave apart.
          </p>
          <p className="td-p">
            Because the spacing is even on the graph's log axis, the answer buttons are laid out as n equal
            columns inset to the plot area, so each button sits directly under its curve.
          </p>
        </Section>

        <Section id="peaking">
          <p className="td-p">
            Boosts, Cuts, Mixed, and Sweep use a <strong>peaking EQ</strong> — a symmetric bell centred on a
            frequency, the most common filter in any DAW — implemented with the Web Audio API's{' '}
            <code className="td-code">BiquadFilterNode</code> set to <code className="td-code">type: "peaking"</code>.
          </p>
          <h3 className="td-h3">Gain (1–18 dB)</h3>
          <p className="td-p">
            Sets the height of the bell. Decibels are logarithmic: +6 dB doubles the amplitude at the centre
            frequency, +12 dB is about 4×, and +18 dB about 8×; −6 dB halves it. Perceived loudness grows more
            slowly than amplitude, so a boost sounds less dramatic than those ratios suggest. Beginners should start
            at 12 dB or more and lower the gain as their ears improve.
          </p>
          <h3 className="td-h3">Q (0.5–8)</h3>
          <p className="td-p">
            Q sets the width of the bell. For a peaking filter, the bandwidth in octaves between the half-gain
            points (where the boost in dB is half its peak) is approximately:
          </p>
          <div className="td-formula">{`BW ≈ (2 / ln 2) · asinh( 1 / (2Q) )`}</div>
          <div className="td-table-wrap">
            <table className="td-table td-table-compact">
              <thead><tr><th>Q</th><td>0.5</td><td>1</td><td>1.4</td><td>2</td><td>2.9</td><td>4.3</td><td>8</td></tr></thead>
              <tbody><tr><th>Bandwidth</th><td>2.5 oct</td><td>1.4 oct</td><td>1 oct</td><td>0.7 oct</td><td>½ oct</td><td>⅓ oct</td><td>0.18 oct</td></tr></tbody>
            </table>
          </div>
          <p className="td-p">
            Broad bells (low Q) change more of the spectrum and are easier to hear; narrow ones (high Q) are much
            harder. The default of 1.4 is about one octave wide.
          </p>
          <h3 className="td-h3">Coefficients</h3>
          <p className="td-p">
            The biquad coefficients follow Robert Bristow-Johnson's <strong>Audio EQ Cookbook</strong>, which the
            Web Audio specification adopts:
          </p>
          <div className="td-formula">{`A  = 10^(gain / 40)\nω₀ = 2π · f₀ / fs\nα  = sin(ω₀) / (2Q)\n\nb0 = 1 + α·A      b1 = −2·cos(ω₀)      b2 = 1 − α·A\na0 = 1 + α/A      a1 = −2·cos(ω₀)      a2 = 1 − α/A`}</div>
          <p className="td-p">
            Here <em>f₀</em> is the centre frequency and <em>fs</em> is the AudioContext's sample rate — usually
            44.1 or 48 kHz, set by the output device.
          </p>
        </Section>

        <Section id="shelf-pass">
          <h3 className="td-h3">Shelves</h3>
          <p className="td-p">
            <code className="td-code">lowshelf</code> and <code className="td-code">highshelf</code> filters lift or
            lower everything below or above a corner frequency. Web Audio ignores Q for shelves and fixes the slope
            at <em>S</em> = 1, the steepest slope without overshoot; at the corner the gain is exactly half the
            shelf gain in dB. With <em>A</em> and <em>ω₀</em> as above:
          </p>
          <div className="td-formula">{`α = sin(ω₀)/2 · √2                     (S = 1)\n\nlow shelf\nb0 =  A·((A+1) − (A−1)·cos ω₀ + 2√A·α)\nb1 = 2A·((A−1) − (A+1)·cos ω₀)\nb2 =  A·((A+1) − (A−1)·cos ω₀ − 2√A·α)\na0 =     (A+1) + (A−1)·cos ω₀ + 2√A·α\na1 = −2·((A−1) + (A+1)·cos ω₀)\na2 =     (A+1) + (A−1)·cos ω₀ − 2√A·α\n\nhigh shelf\nb0 =   A·((A+1) + (A−1)·cos ω₀ + 2√A·α)\nb1 = −2A·((A−1) + (A+1)·cos ω₀)\nb2 =   A·((A+1) + (A−1)·cos ω₀ − 2√A·α)\na0 =      (A+1) − (A−1)·cos ω₀ + 2√A·α\na1 =  2·((A−1) − (A+1)·cos ω₀)\na2 =      (A+1) − (A−1)·cos ω₀ − 2√A·α`}</div>
          <h3 className="td-h3">High-pass and low-pass</h3>
          <p className="td-p">
            For <code className="td-code">highpass</code> and <code className="td-code">lowpass</code>, Web Audio
            reads Q in <strong>decibels</strong> of resonance rather than as a plain ratio. FreqRoom uses
            Q = −3.01 dB, which is a Butterworth response (linear Q = 1/√2 ≈ 0.707): maximally flat in the passband,
            −3 dB at the cutoff, then rolling off at 12 dB per octave.
          </p>
          <div className="td-formula">{`α = sin(ω₀) / (2 · 10^(Q/20))\n\nlow-pass    b0 = (1 − cos ω₀)/2    b1 =   1 − cos ω₀     b2 = (1 − cos ω₀)/2\nhigh-pass   b0 = (1 + cos ω₀)/2    b1 = −(1 + cos ω₀)    b2 = (1 + cos ω₀)/2\nboth        a0 = 1 + α             a1 = −2·cos ω₀        a2 = 1 − α`}</div>
        </Section>

        <Section id="sweep">
          <p className="td-p">
            Sweep mode has no buttons: on the start screen you pick the direction (a boost or a dip), then drag a marker across
            the graph to where you hear it (← and → nudge
            it by a semitone, 1/12 octave). The hidden frequency is drawn from 72 log-spaced points between 40 Hz and
            16 kHz. Your answer is scored by its distance from the true frequency in octaves:
          </p>
          <div className="td-formula">{`error = | log₂( guess / actual ) |      (octaves)`}</div>
          <p className="td-p">
            A guess counts as correct when the error is within the level's tolerance, which tightens as you level up:
          </p>
          <div className="td-table-wrap">
            <table className="td-table td-table-compact">
              <thead><tr><th>Level</th><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td></tr></thead>
              <tbody><tr><th>Tolerance</th><td>±1 oct</td><td>±⅔ oct</td><td>±½ oct</td><td>±⅓ oct</td><td>±⅙ oct</td></tr></tbody>
            </table>
          </div>
          <p className="td-p">
            ±⅙ octave is two semitones either side. After answering, the graph draws the true curve and a bracket
            from your marker to it, labelled with the error.
          </p>
        </Section>

        <Section id="graph">
          <p className="td-p">
            The graph evaluates each biquad's <strong>transfer function H(z)</strong> on the unit circle
            (z = e<sup>jω</sup>), giving the steady-state gain in dB at each frequency. With normalised coefficients
            (each divided by a0):
          </p>
          <div className="td-formula">{`ω  = 2π · f / fs\n\nNr = b0 + b1·cos ω + b2·cos 2ω        Ni = −(b1·sin ω + b2·sin 2ω)\nDr = 1  + a1·cos ω + a2·cos 2ω        Di = −(a1·sin ω + a2·sin 2ω)\n\n|H(f)| in dB = 10 · log₁₀( (Nr² + Ni²) / (Dr² + Di²) )`}</div>
          <p className="td-p">
            Curves are sampled at 301 log-spaced points from 20 Hz to 20 kHz. The graph uses the exact descriptor that
            is sent to the audio engine, and matches <code className="td-code">BiquadFilterNode.getFrequencyResponse</code>{' '}
            for every filter type, so what you see is what you hear.
          </p>
          <p className="td-p">
            During a trial every candidate is drawn in grey — both directions in Mixed and Shelves — and after you
            answer, the hidden filter is revealed in colour: amber for boosts, blue for cuts and pass filters. The dB
            axis is ±12 dB and widens in 6 dB steps (to ±18 dB) when the gain exceeds 12 dB, so curves are never
            clipped.
          </p>
        </Section>

        <Section id="difficulty">
          <p className="td-p">
            Each mode keeps its own level, which sets the number of candidates (or, in Sweep, the tolerance).
            Levels change on consecutive-answer streaks:
          </p>
          <div className="td-callout">
            <strong>3 correct in a row</strong> → level up (more candidates, or a tighter tolerance)<br />
            <strong>2 wrong in a row</strong> → level down
          </div>
          <p className="td-p">
            A single wrong answer resets the correct streak but doesn't drop the level, so one slip isn't punished.
            The asymmetry (3 to advance, 2 to drop) keeps you working close to your limit. Peak modes run from 2 to
            15 bands, Shelves and Pass Filters from 2 to 8 (closer corners or cutoffs become impractical to tell
            apart), and Sweep from level 1 to 5.
          </p>
        </Section>

        <Section id="progress">
          <p className="td-p">
            Every answer is recorded against the hidden frequency's <strong>octave bucket</strong>. There are ten
            buckets centred on the standard octave bands (31.5, 63, 125, 250, 500 Hz, 1, 2, 4, 8, 16 kHz); a
            frequency belongs to the nearest one:
          </p>
          <div className="td-formula">{`bucket = clamp( round( log₂(f / 31.5) ), 0, 9 )`}</div>
          <p className="td-p">
            Stats are kept separately for peak, shelf, pass, and sweep modes. The strip under the graph's frequency
            axis shows accuracy per bucket — red below 50%, amber below 80%, green above — once a bucket has at
            least 3 answers; hovering a segment shows the exact count.
          </p>
          <p className="td-p">
            With <strong>Focus weak bands</strong> on, the hidden frequency is chosen with a weight per candidate
            instead of uniformly:
          </p>
          <div className="td-formula">{`weight = (1 − accuracy) + 0.15          accuracy = 0.5 until a bucket has 3+ answers`}</div>
          <p className="td-p">
            A band you always miss is therefore about 7.7× as likely as one you always get right (1.15 vs. 0.15),
            while untried regions still come up regularly.
          </p>
        </Section>

        <Section id="noise">
          <p className="td-p">
            Pink noise has a <strong>1/f power spectrum</strong>: power per hertz falls by 3 dB per octave, so every
            octave carries equal total power. Because hearing resolves frequency on a roughly logarithmic scale, this
            makes every region about equally prominent, which is why pink noise is the standard signal for acoustic
            measurement and the recommended source here.
          </p>
          <p className="td-p">
            White noise has equal power per hertz. Each octave spans twice as many hertz as the one below it, so each
            octave carries 3 dB more power — which is why white noise sounds bright and hissy.
          </p>
          <p className="td-p">
            FreqRoom generates pink noise with <strong>Paul Kellet's refined filter</strong>: white noise is fed
            through a bank of first-order low-pass filters whose outputs are summed to approximate the −3 dB/octave
            slope to within about ±0.05 dB across the audio band.
          </p>
          <div className="td-formula">{`b0 =  0.99886·b0 + w·0.0555179\nb1 =  0.99332·b1 + w·0.0750759\nb2 =  0.96900·b2 + w·0.1538520\nb3 =  0.86650·b3 + w·0.3104856\nb4 =  0.55000·b4 + w·0.5329522\nb5 = −0.7616·b5  − w·0.0168980\noutput = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w·0.5362) × 0.11\nb6 = w·0.115926`}</div>
          <p className="td-p">
            Here <em>w</em> is a uniform random sample in [−1, 1]. The b5 term, with its negative coefficient, and
            the one-sample-delayed b6 term correct the response at the top of the spectrum; the 0.11 factor sets the
            level (peaks around 0.9), and output is clamped to ±1. White noise is uniform random samples scaled by
            0.45. Both are generated as 30-second stereo buffers with independent channels and loop seamlessly.
          </p>
          <p className="td-p">
            Noise is ideal for learning, but music is what you'll EQ. The <strong>Drum Loop</strong> and{' '}
            <strong>Band Loop</strong> are synthesized in plain JavaScript on demand, so no audio files ship with the
            app. Each is 8 bars at 100 BPM (19.2 s), stereo, with light swing:
          </p>
          <ul className="td-list">
            <li><strong>Kick</strong>: a sine whose pitch drops from 130 to 45 Hz, plus a 4 ms noise click.</li>
            <li><strong>Snare</strong>: first-difference (brightened) noise over a 190 Hz tone body.</li>
            <li><strong>Hats</strong>: second-difference noise, hiss mostly above 6 kHz; the last 8th of each bar opens.</li>
            <li><strong>Bass</strong> (Band Loop): a sawtooth through a 500 Hz one-pole low-pass, in 8ths on the chord roots.</li>
            <li><strong>Pad</strong> (Band Loop): C–Am–F–G triads, each note two sawtooths detuned ±7 cents and panned apart, through two 2.2 kHz one-poles with a slow attack.</li>
          </ul>
          <p className="td-p">
            Every note is written at its start position modulo the loop length, so tails that run past the end wrap
            to the start and the loop point is seamless. A seeded random generator makes each render identical.
            Both loops are scaled toward an RMS of 0.16, close to the pink noise, with peaks held under 0.95.
          </p>
        </Section>

        <Section id="uploads">
          <p className="td-p">
            Uploaded files are decoded with <code className="td-code">decodeAudioData</code>, which resamples them to
            the AudioContext's rate. The original format details are therefore read from the file header instead:
          </p>
          <div className="td-table-wrap">
            <table className="td-table">
              <thead><tr><th>Format</th><th>Where the details come from</th></tr></thead>
              <tbody>
                <tr><td>WAV</td><td><code className="td-code">fmt </code> chunk: channels, sample rate, bit depth (including 32-bit float and WAVE_FORMAT_EXTENSIBLE)</td></tr>
                <tr><td>FLAC</td><td>STREAMINFO block: bit-packed sample rate, channels, and bit depth</td></tr>
                <tr><td>MP3</td><td>first MPEG frame header after any ID3v2 tag: MPEG version, sample rate, channel mode</td></tr>
                <tr><td>Ogg Vorbis / Opus</td><td>identification header in the first page (Opus reports its original input rate)</td></tr>
                <tr><td>M4A / other</td><td>format name only</td></tr>
              </tbody>
            </table>
          </div>
          <p className="td-p">
            The bitrate shown is the average over the whole file — size × 8 ÷ duration — which is the meaningful
            figure for variable-bitrate files. <strong>Set A</strong> and <strong>Set B</strong> loop a section via
            the source node's <code className="td-code">loopStart</code>/<code className="td-code">loopEnd</code>;
            playback wraps inside the region, and seeking outside it jumps back to its start.
          </p>
        </Section>

        <Section id="chain">
          <p className="td-p">
            All audio processing runs in the browser with the Web Audio API — no server and no audio libraries. The
            node graph is built once and reused:
          </p>
          <div className="td-formula td-diagram">{`AudioBufferSourceNode         loops the buffer or A/B region
      │
  voice GainNode                fades on start, stop, seek
      │
  input GainNode
      ├─────────────────────┐
      │                     │
  flat GainNode           BiquadFilterNode
      │                     │
      │                   EQ GainNode
      │                     │
      ├─────────────────────┘
      │
  master GainNode               volume
      │
  DynamicsCompressorNode        limiter
      │
  AudioContext.destination`}</div>
          <p className="td-p">
            Switching between EQ and Flat crossfades the two parallel paths with{' '}
            <code className="td-code">setTargetAtTime</code> (time constant 5 ms, settled in about 25 ms) rather than
            restarting playback, so A/B comparison is click-free and never loses its place. Gain and Q changes ramp
            the filter parameters in place, and volume ramps the master gain. Stopping or seeking fades the current
            source's own voice gain out over 50 ms, so a seek crossfades between the old and new positions.
          </p>
          <p className="td-p">
            Large boosts on dense material can exceed full scale, and digital clipping would add distortion that
            gives the answer away. The compressor acts as a limiter: threshold −1 dBFS, ratio 20:1, 0 dB knee, 1 ms
            attack, 100 ms release. The noise sources at normal volume stay below the threshold unless boosted, and
            the EQ and Flat paths share the same limiter, so the comparison stays fair.
          </p>
        </Section>

        <Section id="labels">
          <p className="td-p">
            After each answer the hidden frequency is labelled with an EQ region name, plus its nearest musical note
            (Boosts, Cuts, Mixed), its exact frequency and your error (Sweep), or its filter type (Shelves, Pass
            Filters).
          </p>
          <h3 className="td-h3">Note name</h3>
          <p className="td-p">
            The nearest MIDI note uses A4 = 440 Hz (MIDI note 69) as the reference:
          </p>
          <div className="td-formula">{`MIDI   = round( 69 + 12 · log₂(f / 440) )\nnote   = NOTE_NAMES[ MIDI mod 12 ]        C C# D D# E F F# G G# A A# B\noctave = floor(MIDI / 12) − 1`}</div>
          <h3 className="td-h3">EQ region</h3>
          <div className="td-formula">{`  < 80 Hz     Sub Bass\n 80–250 Hz    Bass\n250–500 Hz    Low Mid\n0.5–2 kHz     Midrange\n  2–4 kHz     Upper Mid\n  4–8 kHz     Presence\n  > 8 kHz     Brilliance`}</div>
        </Section>

        <Section id="storage">
          <p className="td-p">
            FreqRoom has no server and sends nothing anywhere. Uploaded files are read locally in the browser. Your
            settings (theme, volume, gain, Q, switches) and progress (level per mode, lifetime score, per-octave
            stats) are saved in the browser's <code className="td-code">localStorage</code> under a{' '}
            <code className="td-code">freqroom:</code> prefix. <strong>Reset progress</strong> clears the progress
            only; <strong>Clear saved data</strong> removes every <code className="td-code">freqroom:</code> entry.
            If storage is unavailable (for example in some private-browsing modes), the app works with defaults.
          </p>
          <p className="td-p">
            Share links carry only the challenge settings in the URL (mode, level, gain, Q, generated source, plus the boost/dip
            direction for Sweep). A service
            worker caches the app so it can be installed and used offline: pages load from the network when
            available, falling back to the cached copy, and other files load from the cache and refresh in the
            background.
          </p>
        </Section>

        <Section id="learn">
          <p className="td-p">
            Guides, tools, and deeper reading on EQ, hearing, and audio. All external links open in a new tab.
          </p>
          {RESOURCES.map(([group, links]) => (
            <div key={group} className="td-resource-group">
              <h3 className="td-h3">{group}</h3>
              <div className="td-sources-list">
                {links.map(([href, title, text]) => (
                  <div key={href} className="td-source-item">
                    <a href={href} target="_blank" rel="noopener noreferrer">{title}</a>
                    <p className="td-p">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Section>

        <hr className="td-hr" />

        <section className="td-section" id="sources">
          <h2 className="td-h2">Sources</h2>
          <div className="td-sources-list">
            <div className="td-source-item">
              <a href="https://webaudio.github.io/Audio-EQ-Cookbook/audio-eq-cookbook.html" target="_blank" rel="noopener noreferrer">Audio EQ Cookbook — Robert Bristow-Johnson</a>
              <p className="td-p">Canonical derivation of the biquad coefficients for peaking, shelf, and pass filters, and the Q-to-bandwidth relation.</p>
            </div>
            <div className="td-source-item">
              <a href="https://webaudio.github.io/web-audio-api/#BiquadFilterNode" target="_blank" rel="noopener noreferrer">Web Audio API Specification — BiquadFilterNode (W3C)</a>
              <p className="td-p">Exact filter formulas the browser implements, including the fixed shelf slope and Q in dB for low-pass and high-pass.</p>
            </div>
            <div className="td-source-item">
              <a href="https://www.firstpr.com.au/dsp/pink-noise/" target="_blank" rel="noopener noreferrer">Generation of Pink Noise — Phil Burk / Paul Kellet</a>
              <p className="td-p">Source of the refined pink-noise filter coefficients (Kellet), alongside the Voss-McCartney algorithm.</p>
            </div>
            <div className="td-source-item">
              <a href="https://harmanhowtolisten.blogspot.com" target="_blank" rel="noopener noreferrer">How to Listen — Harman International</a>
              <p className="td-p">Original inspiration for the EQ ear-training approach and A/B comparison method.</p>
            </div>
            <div className="td-source-item">
              <a href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API" target="_blank" rel="noopener noreferrer">Web Audio API — MDN Web Docs</a>
              <p className="td-p">Practical reference for AudioContext, audio-node graphs, and parameter automation.</p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter page="technical" />
    </div>
  );
}
