import type { Stage } from "../pipeline";
import type { Note } from "../types";

export type WorkerRequest = { type: "run"; samples: Float32Array; sampleRate: number } | { type: "cancel" };

export type WorkerResponse =
  | { type: "progress"; stage: Stage; fraction: number }
  | { type: "done"; wav: ArrayBuffer; notes: Note[]; durationSec: number }
  | { type: "error"; message: string };
