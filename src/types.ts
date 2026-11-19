/** One whistled note. Times in seconds, gain 0..1. */
export interface Note {
  start: number;
  end: number;
  /** MIDI note number (69 = A4 = 440 Hz). */
  midi: number;
  gain: number;
}

/** Frame-level melody estimate. `midi` is NaN where no melody was found. */
export interface MelodyTrack {
  hopSec: number;
  midi: Float32Array;
  /** Normalised strength, roughly 0..1+. */
  level: Float32Array;
}

export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const hzToMidi = (f: number): number => 69 + 12 * Math.log2(f / 440);
