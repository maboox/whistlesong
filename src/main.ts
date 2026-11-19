import { ANALYSIS } from "./config";
import { decodeToMono, InputError } from "./audio/decode";
import type { Stage } from "./pipeline";
import { drawRoll } from "./ui/roll";
import type { WorkerRequest, WorkerResponse } from "./worker/messages";

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

const ui = {
  pick: el("pick"),
  work: el("work"),
  result: el("result"),
  drop: el("drop"),
  file: el<HTMLInputElement>("file"),
  fileName: el("file-name"),
  stage: el("stage"),
  bar: el<HTMLProgressElement>("bar"),
  cancel: el("cancel"),
  error: el("error"),
  whistleAudio: el<HTMLAudioElement>("whistle-audio"),
  origAudio: el<HTMLAudioElement>("orig-audio"),
  roll: el<HTMLCanvasElement>("roll"),
  summary: el("summary"),
  download: el<HTMLAnchorElement>("download"),
  again: el("again"),
};

type View = "pick" | "work" | "result";
const urls: string[] = [];
let worker: Worker | null = null;
let runId = 0;

function show(view: View): void {
  ui.pick.hidden = view !== "pick";
  ui.work.hidden = view !== "work";
  ui.result.hidden = view !== "result";
}

function showError(message: string | null): void {
  ui.error.hidden = message === null;
  ui.error.textContent = message ?? "";
}

function releaseUrls(): void {
  ui.whistleAudio.removeAttribute("src");
  ui.origAudio.removeAttribute("src");
  ui.download.removeAttribute("href");
  for (const u of urls.splice(0)) URL.revokeObjectURL(u);
}

function stopWorker(): void {
  worker?.terminate();
  worker = null;
}

function reset(): void {
  runId++;
  stopWorker();
  releaseUrls();
  ui.file.value = "";
  show("pick");
}

const STAGE_LABEL: Record<Stage | "decode", string> = {
  decode: "Reading your song…",
  melody: "Listening for the melody…",
  notes: "Working out the notes…",
  whistle: "Learning to whistle…",
  encode: "Packing it up…",
};
// Share of the progress bar each stage owns.
const STAGE_RANGE: Record<Stage | "decode", [number, number]> = {
  decode: [0, 8],
  melody: [8, 60],
  notes: [60, 62],
  whistle: [62, 96],
  encode: [96, 100],
};

function setProgress(stage: Stage | "decode", fraction: number): void {
  const [a, b] = STAGE_RANGE[stage];
  ui.stage.textContent = STAGE_LABEL[stage];
  ui.bar.value = a + (b - a) * Math.min(1, Math.max(0, fraction));
}

async function handleFile(file: File): Promise<void> {
  const id = ++runId;
  showError(null);
  releaseUrls();
  ui.fileName.textContent = file.name; // textContent: file names are untrusted
  setProgress("decode", 0);
  show("work");
  try {
    const samples = await decodeToMono(file);
    if (id !== runId) return;
    setProgress("melody", 0);
    stopWorker();
    const w = new Worker(new URL("./worker/pipeline.worker.ts", import.meta.url), { type: "module" });
    worker = w;
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      if (id !== runId) return;
      const msg = ev.data;
      if (msg.type === "progress") {
        setProgress(msg.stage, msg.fraction);
      } else if (msg.type === "done") {
        stopWorker();
        const whistleUrl = URL.createObjectURL(new Blob([msg.wav], { type: "audio/wav" }));
        const origUrl = URL.createObjectURL(file);
        urls.push(whistleUrl, origUrl);
        ui.whistleAudio.src = whistleUrl;
        ui.origAudio.src = origUrl;
        ui.download.href = whistleUrl;
        ui.download.download = `${file.name.replace(/\.[^.]+$/, "").replace(/[^\w\- ]+/g, "") || "song"} (whistled).wav`;
        drawRoll(ui.roll, msg.notes, msg.durationSec);
        ui.summary.textContent =
          msg.notes.length === 0
            ? "No clear melody was found in this song."
            : `${msg.notes.length} notes whistled from a ${Math.round(msg.durationSec)} s song.`;
        show("result");
      } else {
        stopWorker();
        fail(msg.message);
      }
    };
    w.onerror = () => { if (id === runId) { stopWorker(); fail("Something went wrong while processing."); } };
    const req: WorkerRequest = { type: "run", samples, sampleRate: ANALYSIS.sampleRate };
    w.postMessage(req, [samples.buffer]);
  } catch (e) {
    if (id !== runId) return;
    fail(e instanceof InputError ? e.message : "Couldn't process that file.");
  }
}

function fail(message: string): void {
  runId++;
  show("pick");
  showError(message);
}

ui.file.addEventListener("change", () => {
  const f = ui.file.files?.[0];
  if (f) void handleFile(f);
});
ui.cancel.addEventListener("click", reset);
ui.again.addEventListener("click", reset);

ui.drop.addEventListener("dragover", (e) => { e.preventDefault(); ui.drop.classList.add("over"); });
ui.drop.addEventListener("dragleave", () => ui.drop.classList.remove("over"));
ui.drop.addEventListener("drop", (e) => {
  e.preventDefault();
  ui.drop.classList.remove("over");
  const f = e.dataTransfer?.files[0];
  if (f) void handleFile(f);
});
window.addEventListener("pagehide", () => { stopWorker(); releaseUrls(); });
