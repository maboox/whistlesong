import { WHISTLE } from "../config";
import type { Note } from "../types";

/**
 * Move the whole melody by whole octaves so its centre sits in a comfortable
 * whistle register, then fold stray notes into the playable range.
 * Pitch classes (note names) are never altered.
 */
export function fitToWhistleRange(notes: Note[]): Note[] {
  if (notes.length === 0) return [];
  // Duration-weighted median pitch.
  const sorted = [...notes].sort((a, b) => a.midi - b.midi);
  const total = sorted.reduce((s, n) => s + (n.end - n.start), 0);
  let acc = 0;
  let median = sorted[0]!.midi;
  for (const n of sorted) {
    acc += n.end - n.start;
    if (acc >= total / 2) { median = n.midi; break; }
  }
  const shift = 12 * Math.round((WHISTLE.centerMidi - median) / 12);
  return notes.map((n) => {
    let m = n.midi + shift;
    while (m < WHISTLE.minMidi) m += 12;
    while (m > WHISTLE.maxMidi) m -= 12;
    return { ...n, midi: m };
  });
}
