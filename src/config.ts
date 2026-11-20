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

/**
 * Values below were measured from a real human whistle recording
 * (docs/WHISTLE_REFERENCE.md). Re-measure before changing them.
 */
export const WHISTLE = {
  outputSampleRate: 24000,
  /** Register: the reference whistler lived at 785-1415 Hz, median ~1030 Hz. */
  centerMidi: 83.2, // ~ 1000 Hz
  minMidi: 70, // ~ 466 Hz
  maxMidi: 94, // ~ 1480 Hz
  maxGlideGapSec: 0.06,
  attackSec: 0.025,
  releaseSec: 0.1,
  /** Overtones relative to the fundamental: measured -40 dB (2nd) and -58 dB (3rd). */
  harmonic2: 0.01,
  harmonic3: 0.0015,
  /** Real whistling has little regular vibrato: only a few long notes, and shallow. */
  vibratoHz: 5.0,
  vibratoCents: 8,
  vibratoShare: 0.15,
  vibratoDelaySec: 0.35,
  /** Slow natural pitch wander (cents). */
  wanderCents: 6,
  /** Breath-pressure fluctuation: couples a little pitch and loudness movement. */
  pressureCents: 7,
  pressureAmp: 0.12,
  /** Per-note "human error": each note gets its own random character. */
  intonationCents: 9,
  /** Notes drift in pitch while held: measured up to ~200 cents/second. */
  driftCentsPerSec: 200,
  gainSpread: 0.14,
  /** Onsets show no consistent scoop in the reference; only a small random one. */
  scoopCents: 20,
  scoopSec: 0.06,
  /** No consistent sag at the end of notes in the reference. */
  sagCents: 8,
  /** Airy skirt around the pitch (measured about -33 dB). */
  breathLevel: 0.06,
  /** Hiss above 3 kHz is almost absent in real whistles (measured about -56 dB). */
  hissLevel: 0.0004,
  /** Broadband breath puff at each fresh note onset (gain multiplier on the hiss); seen as a "cone" in the reference spectrogram. */
  onsetPuff: 90,
  /** Dry, close-mic feel. A hall-like reverb makes it sound like a flute. */
  reverbWet: 0.02,
  seed: 1337,
} as const;
