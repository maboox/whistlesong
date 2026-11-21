import { describe, expect, it } from "vitest";
import { ANALYSIS } from "../src/config";
import { extractMelody } from "../src/dsp/melody";
import { midiToHz } from "../src/types";
import { tone } from "./helpers";

const SR = ANALYSIS.sampleRate;

describe("melody over accompaniment", () => {
  it("follows the top line despite bass and chord tones (register prior)", () => {
    const melody = [72, 72, 79, 79, 81, 81, 79];
    const parts: Parameters<typeof tone>[2] = [];
    melody.forEach((m, i) => {
      parts.push({ hz: midiToHz(m), start: i * 0.6, end: i * 0.6 + 0.55, amp: 0.25 });
    });
    // Rich bass + chord tones under the whole thing, as loud as the melody.
    const total = melody.length * 0.6;
    for (let b = 0; b < total; b += 1.2) {
      parts.push({ hz: midiToHz(48), start: b, end: b + 1.1, amp: 0.3, harmonics: [1, 0.8, 0.6, 0.5, 0.4] });
      parts.push({ hz: midiToHz(52), start: b + 0.3, end: b + 1.1, amp: 0.2, harmonics: [1, 0.7, 0.5, 0.4] });
      parts.push({ hz: midiToHz(55), start: b + 0.6, end: b + 1.1, amp: 0.2, harmonics: [1, 0.7, 0.5, 0.4] });
    }
    const track = extractMelody(tone(SR, total + 0.2, parts), SR);
    let ok = 0;
    let n = 0;
    for (let i = 0; i < track.midi.length; i++) {
      const t = i * track.hopSec;
      const idx = Math.floor(t / 0.6);
      if (idx >= melody.length || t - idx * 0.6 > 0.5 || t - idx * 0.6 < 0.06) continue; // skip note edges
      n++;
      if (Math.abs(track.midi[i]! - melody[idx]!) < 0.5) ok++;
    }
    expect(ok / n).toBeGreaterThan(0.8);
  });
});
