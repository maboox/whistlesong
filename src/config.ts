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
  /** Register: casual whistling lives around 0.7-2 kHz, lower sounds softer and more human. */
  centerMidi: 81.5, // ~ 860 Hz
  minMidi: 70, // ~ 466 Hz
  maxMidi: 96, // ~ 2093 Hz
  maxGlideGapSec: 0.09,
  attackSec: 0.04,
  releaseSec: 0.1,
  /** A human whistle is a nearly pure tone: very weak overtones (relative amplitude). */
  harmonic2: 0.03,
  harmonic3: 0.01,
  vibratoHz: 5.0,
  vibratoCents: 11,
  vibratoDelaySec: 0.35,
  /** Slow natural pitch wander (cents). */
  wanderCents: 7,
  /** Breath-pressure fluctuation: couples a little pitch and loudness movement. */
  pressureCents: 6,
  pressureAmp: 0.12,
  /** Per-note "human error": each note gets its own random character. */
  intonationCents: 9,
  gainSpread: 0.14,
  /** Fresh notes start a little flat and scoop up (cents, max). */
  scoopCents: 60,
  scoopSec: 0.05,
  /** Pitch sags slightly as the breath dies away (cents). */
  sagCents: 30,
  /** Narrow airy component around the pitch (relative to tone). */
  breathLevel: 0.03,
  /** Broadband hiss (above ~2.5 kHz) from the lips/teeth. */
  hissLevel: 0.012,
  /** Dry, close-mic feel. A hall-like reverb makes it sound like a flute. */
  reverbWet: 0.04,
  seed: 1337,
} as const;
