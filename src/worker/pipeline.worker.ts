/// <reference lib="webworker" />
import { runPipeline } from "../pipeline";
import type { WorkerRequest, WorkerResponse } from "./messages";

const post = (msg: WorkerResponse, transfer: Transferable[] = []): void => {
  (self as DedicatedWorkerGlobalScope).postMessage(msg, transfer);
};

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg.type !== "run") return; // cancel is handled by terminating the worker
  try {
    const result = runPipeline(msg.samples, msg.sampleRate, {
      onProgress: (stage, fraction) => post({ type: "progress", stage, fraction }),
    });
    post({ type: "done", wav: result.wav, notes: result.notes, durationSec: result.durationSec }, [result.wav]);
  } catch (e) {
    post({ type: "error", message: e instanceof Error ? e.message : "Unknown error" });
  }
};
