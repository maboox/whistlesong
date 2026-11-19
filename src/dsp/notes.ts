import { NOTES } from "../config";
import type { MelodyTrack, Note } from "../types";

/** Turn a frame-level melody track into discrete, semitone-snapped notes. */
export function segmentNotes(track: MelodyTrack): Note[] {
  const { hopSec, midi, level } = track;
  const T = midi.length;

  // 1. Hysteresis rounding: ignore vibrato / small drift.
  const snapped = new Float32Array(T).fill(NaN);
  let cur = NaN;
  for (let t = 0; t < T; t++) {
    const m = midi[t]!;
    if (Number.isNaN(m)) { cur = NaN; continue; }
    if (Number.isNaN(cur) || Math.abs(m - cur) > NOTES.hysteresis) cur = Math.round(m);
    snapped[t] = cur;
  }

  // 2. Bridge short unvoiced gaps between equal pitches.
  const maxGap = Math.round(NOTES.bridgeGapSec / hopSec);
  for (let t = 0; t < T; t++) {
    if (!Number.isNaN(snapped[t]!)) continue;
    let e = t;
    while (e < T && Number.isNaN(snapped[e]!)) e++;
    if (t > 0 && e < T && e - t <= maxGap && snapped[t - 1] === snapped[e]) {
      snapped.fill(snapped[e]!, t, e);
    }
    t = e;
  }

  // 3. Runs of equal pitch -> notes, with re-attack splitting on level dips.
  const notes: Note[] = [];
  const minFrames = Math.max(1, Math.round(NOTES.minNoteSec / hopSec));
  let t = 0;
  while (t < T) {
    if (Number.isNaN(snapped[t]!)) { t++; continue; }
    let e = t;
    while (e < T && snapped[e] === snapped[t]) e++;
    for (const [s, f] of splitOnReattack(level, t, e, minFrames)) {
      if (f - s < minFrames) continue;
      let sum = 0;
      for (let i = s; i < f; i++) sum += level[i]!;
      const mean = sum / (f - s);
      notes.push({
        start: s * hopSec,
        end: f * hopSec,
        midi: snapped[t]!,
        gain: Math.min(1, 0.35 + 0.65 * Math.sqrt(Math.min(1, mean / 0.9))),
      });
    }
    t = e;
  }
  return notes;
}

/** Split [s,e) where the strength dips and rises again (repeated notes). */
function splitOnReattack(level: Float32Array, s: number, e: number, minFrames: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let segStart = s;
  let peak = 0;
  let valley = Infinity;
  for (let i = s; i < e; i++) {
    const v = level[i]!;
    if (v > peak) { peak = v; valley = v; }
    if (v < valley) valley = v;
    if (valley < 0.5 * peak && v > Math.max(valley * 1.8, 0.7 * peak) && i - segStart >= minFrames) {
      out.push([segStart, i]);
      segStart = i;
      peak = v;
      valley = v;
    }
  }
  out.push([segStart, e]);
  return out;
}
