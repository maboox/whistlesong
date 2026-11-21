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
  /**
   * Melody register prior: candidates below `priorLowHz` are down-weighted (bass lines and chord roots
   * otherwise win), reaching full weight at `priorFullHz`. Floor is `priorLowWeight`.
   */
  priorLowHz: 150,
  priorFullHz: 500,
  priorLowWeight: 0.15,
  /** Normalised salience below this is treated as "no melody here". */
  voicingThreshold: 0.12,
  /** Max pitch change (bins) the tracker follows smoothly between frames. */
  trackWindowBins: 12,
  trackSlopePenalty: 0.012,
  trackJumpPenalty: 0.35,
} as const;

export const NOTES = {
  /** Short notes that are really part of a sweep (moving faster than this, cents/s) become one glide. */
  sweepCentsPerSec: 400,
  sweepMaxNoteSec: 0.16,
  sweepMaxGapSec: 0.05,
  /** Isolated blips (no neighbour within `isolatedGapSec`) shorter than this are tracker noise, not notes. */
  isolatedMinSec: 0.14,
  isolatedGapSec: 0.15,
  /** Keep this much of the source's in-note pitch movement (clamped), see Note.bend. */
  bendMaxCents: 120,
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
  maxGlideGapSec: 0.12,
  /** Longest explicit glide (merged sweep) we will draw as one continuous curve. */
  maxSweepSec: 0.4,
  /** Notes shorter than this get no scoop and a weaker breath puff (they sounded like alien chirps). */
  minExpressiveNoteSec: 0.2,
  attackSec: 0.02,
  releaseSec: 0.13,
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
  pressureAmp: 0.2,
  /** Turbulent flutter: loudness 3-25 Hz (~0.3-0.5 dB per octave band), pitch 3-12 Hz wobble (cents RMS). */
  flutterDb: 0.6,
  flutterCents: 6,
  /** Per-note "human error": each note gets its own random character. */
  intonationCents: 9,
  /** Notes drift in pitch while held: measured up to ~200 cents/second. */
  driftCentsPerSec: 260,
  gainSpread: 0.14,
  /**
   * Onsets: in web clips 56 % of notes start flat (median -70 c, quartile -165 c) and recover in ~90 ms;
   * the owner's own whistle scoops less. We scoop about half the notes by 40-190 cents.
   */
  scoopProb: 0.6,
  scoopMinCents: 20,
  scoopMaxCents: 350,
  scoopSec: 0.1,
  /** How much of the source's own pitch movement (Note.bend) the whistle follows. */
  bendShare: 0.7,
  /**
   * Articulation, measured on 4 real recordings (owner, web clips, a whistling cover):
   * 64-83 % of note changes have a silence (median 110-200 ms), 4-10 % a tongued dip,
   * 15-32 % are slurred. A continuous legato line is what made it sound like an instrument.
   */
  slurProb: 0.2,
  dipProb: 0.1,
  dipSec: 0.035,
  gapMinSec: 0.17,
  gapMaxSec: 0.3,
  /** Never shorten a note below this (absolute / share of its length) to make room for a gap. */
  minHeldSec: 0.07,
  minHeldShare: 0.45,
  /** Note endings: median droop -40..-50 cents; 20-29 % fall by more than 100 cents over 60-165 ms. */
  droopCents: 30,
  fallProb: 0.15,
  fallMinCents: 100,
  fallMaxCents: 400,
  fallSec: 0.12,
  /** Airy skirt around the pitch (measured about -33 dB). */
  breathLevel: 0.05,
  /** Hiss above 3 kHz is almost absent in real whistles (measured about -56 dB). */
  hissLevel: 0.002,
  /** Broadband breath puff at each fresh note onset (gain multiplier on the hiss); seen as a "cone" in the reference spectrogram. */
  onsetPuff: 60,
  /** Dry, close-mic feel. A hall-like reverb makes it sound like a flute. */
  reverbWet: 0.02,
  seed: 1337,
} as const;
