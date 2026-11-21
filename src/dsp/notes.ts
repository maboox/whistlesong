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
        bend: extractBend(midi, s, f, snapped[t]!),
        bendHopSec: hopSec,
      });
    }
    t = e;
  }
  return dropIsolatedBlips(mergeSweeps(notes));
}

function dropIsolatedBlips(notes: Note[]): Note[] {
  return notes.filter((n, i) => {
    if (n.end - n.start >= NOTES.isolatedMinSec) return true;
    const prev = notes[i - 1];
    const next = notes[i + 1];
    const lonelyBefore = !prev || n.start - prev.end > NOTES.isolatedGapSec;
    const lonelyAfter = !next || next.start - n.end > NOTES.isolatedGapSec;
    return !(lonelyBefore && lonelyAfter);
  });
}

/**
 * Fast pitch sweeps (whistle swoops, singer slides) get chopped into several short,
 * moving "notes". Replace them by one smooth glide between the stable notes either side.
 */
function mergeSweeps(notes: Note[]): Note[] {
  const out = [...notes];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < out.length - 1; i++) {
      const a = out[i - 1]!;
      const b = out[i]!;
      const c = out[i + 1]!;
      const dur = b.end - b.start;
      if (dur > NOTES.sweepMaxNoteSec) continue;
      if (b.start - a.end > NOTES.sweepMaxGapSec || c.start - b.end > NOTES.sweepMaxGapSec) continue;
      const monotonic = (a.midi <= b.midi && b.midi <= c.midi) || (a.midi >= b.midi && b.midi >= c.midi);
      if (!monotonic || Math.abs(c.midi - a.midi) < 2) continue;
      const bend = b.bend;
      const moving = bend && bend.length > 1 ? (Math.abs(bend[bend.length - 1]! - bend[0]!) / Math.max(dur, 0.02)) >= NOTES.sweepCentsPerSec : false;
      if (!moving) continue;
      out.splice(i, 1);
      c.glideSec = c.start - a.end;
      changed = true;
      break;
    }
  }
  return out;
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

/** Pitch deviation (cents) of the raw track from the snapped note: keeps the source's expression. */
function extractBend(midi: Float32Array, s: number, e: number, note: number): Float32Array {
  const raw = new Float32Array(e - s);
  let last = 0;
  for (let i = s; i < e; i++) {
    const m = midi[i]!;
    const dev = Number.isNaN(m) ? last : Math.max(-NOTES.bendMaxCents, Math.min(NOTES.bendMaxCents, (m - note) * 100));
    raw[i - s] = dev;
    last = dev;
  }
  // 3-point median removes tracker spikes without flattening real vibrato.
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const a = raw[Math.max(0, i - 1)]!;
    const b = raw[i]!;
    const c = raw[Math.min(raw.length - 1, i + 1)]!;
    out[i] = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
  }
  return out;
}
