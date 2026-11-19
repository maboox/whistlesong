/** Central place for every tunable. No magic numbers elsewhere. */

export const LIMITS = {
  /** Hard cap on song length (seconds). */
  maxDurationSec: 5 * 60,
  /** Hard cap on input file size (bytes) – protects phone memory. */
  maxFileBytes: 60 * 1024 * 1024,
} as const;

export const ANALYSIS = {
  /** Sample rate the analysis runs at. */
  sampleRate: 22050,
  fftSize: 2048,
  hopSec: 0.02,
  /** Melody search range in Hz (about A2..A6). */
  fMinHz: 110,
  fMaxHz: 1760,
  centsPerBin: 25,
  harmonics: 12,
  harmonicDecay: 0.85,
  /** Normalised salience below this is treated as "no melody here". */
  voicingThreshold: 0.12,
  /** Max pitch change (bins) the tracker follows smoothly between frames. */
  trackWindowBins: 12,
  trackSlopePenalty: 0.012,
  trackJumpPenalty: 0.35,
} as const;

export const NOTES = {
  /** Hysteresis before a new pitch is accepted (semitones). */
  hysteresis: 0.65,
  minNoteSec: 0.08,
  /** Unvoiced gaps shorter than this between equal pitches are bridged. */
  bridgeGapSec: 0.06,
} as const;

export const WHISTLE = {
  outputSampleRate: 24000,
  /** Comfortable whistle centre (MIDI) and hard range. ~1.2 kHz centre. */
  centerMidi: 86.4,
  minMidi: 72, // ~523 Hz
  maxMidi: 100, // ~2637 Hz
  portamentoSec: 0.05,
  maxGlideGapSec: 0.09,
  attackSec: 0.035,
  releaseSec: 0.09,
  /** A human whistle is a nearly pure tone: very weak overtones (relative amplitude). */
  harmonic2: 0.03,
  harmonic3: 0.01,
  vibratoHz: 5.4,
  vibratoCents: 13,
  vibratoDelaySec: 0.3,
  /** Slow natural pitch wander (cents) so the tone never sounds "locked". */
  wanderCents: 6,
  /** Fresh notes start a little flat and scoop up (cents, max). */
  scoopCents: 55,
  scoopSec: 0.045,
  /** Pitch sags slightly as the breath dies away (cents). */
  sagCents: 28,
  /** Hiss relative to the tone: about -35 dB or lower in steady state. */
  breathLevel: 0.014,
  /** Small room so it does not sound like a dry test tone. */
  reverbWet: 0.12,
  seed: 1337,
} as const;
