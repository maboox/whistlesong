import { ANALYSIS, WHISTLE } from "./config";
import { encodeWav16 } from "./audio/wav";
import { extractMelody } from "./dsp/melody";
import { segmentNotes } from "./dsp/notes";
import { fitToWhistleRange } from "./dsp/range";
import { renderWhistle } from "./dsp/whistle";
import type { Note } from "./types";

export type Stage = "melody" | "notes" | "whistle" | "encode";

export interface PipelineResult {
  wav: ArrayBuffer;
  /** Notes after register fitting (what is actually whistled). */
  notes: Note[];
  durationSec: number;
}

export interface PipelineHooks {
  onProgress?: (stage: Stage, fraction: number) => void;
  isCancelled?: () => boolean;
}

/** Pure, DOM-free pipeline: mono samples in, whistled WAV out. */
export function runPipeline(samples: Float32Array, sampleRate: number, hooks: PipelineHooks = {}): PipelineResult {
  if (sampleRate !== ANALYSIS.sampleRate) throw new Error(`Expected ${ANALYSIS.sampleRate} Hz input`);
  const durationSec = samples.length / sampleRate;
  const track = extractMelody(samples, sampleRate, {
    onProgress: (f) => hooks.onProgress?.("melody", f),
    isCancelled: hooks.isCancelled,
  });
  hooks.onProgress?.("notes", 0);
  const notes = fitToWhistleRange(segmentNotes(track));
  hooks.onProgress?.("notes", 1);
  const audio = renderWhistle(notes, durationSec, WHISTLE.outputSampleRate, (f) => hooks.onProgress?.("whistle", f));
  hooks.onProgress?.("encode", 0);
  const wav = encodeWav16(audio, WHISTLE.outputSampleRate);
  hooks.onProgress?.("encode", 1);
  return { wav, notes, durationSec };
}
