import { describe, expect, it } from "vitest";
import { ANALYSIS, WHISTLE } from "../src/config";
import { extractMelody } from "../src/dsp/melody";
import { fitToWhistleRange } from "../src/dsp/range";
import { segmentNotes } from "../src/dsp/notes";
import { renderWhistle } from "../src/dsp/whistle";
import { encodeWav16 } from "../src/audio/wav";
import { runPipeline } from "../src/pipeline";
import { hzToMidi, midiToHz, type Note } from "../src/types";
import { tone } from "./helpers";

const SR = ANALYSIS.sampleRate;

describe("melody analysis", () => {
  it("finds a simple melody over a bass line", () => {
    const mel = [60, 64, 67, 72]; // C4 E4 G4 C5
    const parts = mel.map((m, i) => ({ hz: midiToHz(m), start: i * 0.5, end: i * 0.5 + 0.45, amp: 0.3 }));
    parts.push({ hz: 82.4, start: 0, end: 2, amp: 0.25 }); // E2 bass drone
    const x = tone(SR, 2.1, parts);
    const notes = segmentNotes(extractMelody(x, SR));
    expect(notes.map((n) => n.midi)).toEqual(mel);
    expect(notes[1]!.start).toBeCloseTo(0.5, 1);
  });

  it("returns no notes for silence", () => {
    const notes = segmentNotes(extractMelody(new Float32Array(SR * 2), SR));
    expect(notes).toEqual([]);
  });

  // Known limitation (see docs/ROADMAP.md, phase 4): a 93 ms analysis window smears tiny dips.
  it.todo("splits back-to-back repeated notes with almost no gap");

  it("does not split a steady note", () => {
    const notes = segmentNotes(extractMelody(tone(SR, 2, [{ hz: midiToHz(64), start: 0.1, end: 1.9, amp: 0.3 }]), SR));
    expect(notes.length).toBe(1);
  });

  it("splits repeated notes", () => {
    const parts = [0, 0.4].map((s) => ({ hz: midiToHz(67), start: s, end: s + 0.33, amp: 0.3 }));
    const notes = segmentNotes(extractMelody(tone(SR, 1, parts), SR));
    expect(notes.length).toBe(2);
  });
});

describe("whistle synth", () => {
  const notes: Note[] = [
    { start: 0.1, end: 0.6, midi: 84, gain: 0.8 },
    { start: 0.6, end: 1.1, midi: 88, gain: 0.8 },
    { start: 1.3, end: 1.8, midi: 91, gain: 0.8 },
  ];

  it("is deterministic and bounded", () => {
    const a = renderWhistle(notes, 2, SR);
    const b = renderWhistle(notes, 2, SR);
    expect(a).toEqual(b);
    expect(Math.max(...a.map(Math.abs))).toBeLessThanOrEqual(1);
  });

  it("round-trips: analysing the whistle recovers the notes", () => {
    const audio = renderWhistle(notes, 2, SR);
    const found = segmentNotes(extractMelody(audio, SR));
    // whistle range is above the analysis range (fMax 1760 Hz ~ MIDI 93) so these are in range
    expect(found.map((n) => n.midi)).toEqual([84, 88, 91]);
  });
});

describe("range fitting", () => {
  it("moves low melodies up whole octaves and keeps pitch classes", () => {
    const low: Note[] = [48, 52, 55].map((m, i) => ({ start: i, end: i + 0.9, midi: m, gain: 1 }));
    const fitted = fitToWhistleRange(low);
    fitted.forEach((n, i) => {
      expect((n.midi - low[i]!.midi) % 12).toBe(0);
      expect(n.midi).toBeGreaterThanOrEqual(WHISTLE.minMidi);
      expect(n.midi).toBeLessThanOrEqual(WHISTLE.maxMidi);
    });
    const hz = midiToHz(fitted[0]!.midi);
    expect(hz).toBeGreaterThan(440);
    expect(hzToMidi(hz)).toBeCloseTo(fitted[0]!.midi);
  });
});

describe("wav + pipeline", () => {
  it("writes a valid header", () => {
    const wav = new DataView(encodeWav16(new Float32Array(100), 24000));
    expect(String.fromCharCode(wav.getUint8(0), wav.getUint8(1), wav.getUint8(2), wav.getUint8(3))).toBe("RIFF");
    expect(wav.getUint32(24, true)).toBe(24000);
    expect(wav.byteLength).toBe(44 + 200);
  });

  it("runs end to end and reports progress", () => {
    const x = tone(SR, 2, [
      { hz: midiToHz(60), start: 0, end: 0.9, amp: 0.3 },
      { hz: midiToHz(67), start: 1, end: 1.9, amp: 0.3 },
    ]);
    const stages = new Set<string>();
    const r = runPipeline(x, SR, { onProgress: (s) => stages.add(s) });
    expect(r.notes.length).toBe(2);
    expect(r.wav.byteLength).toBeGreaterThan(44);
    expect([...stages]).toEqual(["melody", "notes", "whistle", "encode"]);
  });
});
