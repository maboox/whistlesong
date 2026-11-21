/** One whistled note. Times in seconds, gain 0..1. */
export interface Note {
  start: number;
  end: number;
  /** MIDI note number (69 = A4 = 440 Hz). */
  midi: number;
  gain: number;
  /**
   * Optional expression carried over from the source (portamento, vibrato, scoops):
   * pitch deviation in cents from `midi`, sampled every `bendHopSec` from `start`.
   */
  bend?: Float32Array;
  bendHopSec?: number;
  /**
   * Set when this note is the landing of a continuous glide from the previous note
   * (fast sweeps were merged): seconds the pitch should take to travel there.
   */
  glideSec?: number;
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
