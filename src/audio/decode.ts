import { ANALYSIS, LIMITS } from "../config";

export class InputError extends Error {}

/** Decode a user file to mono Float32 at the analysis sample rate (main thread). */
export async function decodeToMono(file: File): Promise<Float32Array> {
  if (file.size > LIMITS.maxFileBytes) {
    throw new InputError(`That file is too large (max ${Math.round(LIMITS.maxFileBytes / 1048576)} MB).`);
  }
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new InputError("This browser can't decode audio.");
  const ctx = new Ctx();
  try {
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    } catch {
      throw new InputError("Couldn't read that audio file. Try MP3, M4A, WAV, OGG or FLAC.");
    }
    if (buffer.duration > LIMITS.maxDurationSec + 0.5) {
      throw new InputError(`That song is ${Math.ceil(buffer.duration / 60)} min long. The limit is ${LIMITS.maxDurationSec / 60} minutes.`);
    }
    // Resample + downmix to mono with an offline context (works on iOS Safari too).
    const length = Math.max(1, Math.ceil(buffer.duration * ANALYSIS.sampleRate));
    const off = new OfflineAudioContext(1, length, ANALYSIS.sampleRate);
    const src = off.createBufferSource();
    src.buffer = buffer;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    return rendered.getChannelData(0).slice();
  } finally {
    void ctx.close();
  }
}
