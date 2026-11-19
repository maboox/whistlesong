import { ANALYSIS } from "../config";
import type { MelodyTrack } from "../types";
import { FFT } from "./fft";

export interface ExtractOptions {
  onProgress?: (fraction: number) => void;
  /** Return true to abort (throws "cancelled"). */
  isCancelled?: () => boolean;
}

/**
 * Melody extraction for polyphonic audio:
 *  1. STFT (two real frames per complex FFT).
 *  2. Spectral whitening, then harmonic-sum "salience" on a log-frequency grid.
 *  3. Viterbi tracking over salience for a smooth single pitch line.
 *  4. Voicing decision by normalised salience.
 */
export function extractMelody(x: Float32Array, sr: number, opts: ExtractOptions = {}): MelodyTrack {
  const N = ANALYSIS.fftSize;
  const K = N / 2 + 1;
  const hop = Math.max(1, Math.round(sr * ANALYSIS.hopSec));
  const hopSec = hop / sr;
  const T = Math.max(1, Math.floor(x.length / hop) + 1);
  const binHz = sr / N;

  const B = Math.floor((1200 * Math.log2(ANALYSIS.fMaxHz / ANALYSIS.fMinHz)) / ANALYSIS.centsPerBin) + 1;
  const candPos: Float64Array[] = []; // per candidate, per harmonic: fractional FFT-bin position
  const candCount: number[] = [];
  for (let c = 0; c < B; c++) {
    const f = ANALYSIS.fMinHz * Math.pow(2, (c * ANALYSIS.centsPerBin) / 1200);
    const pos = new Float64Array(ANALYSIS.harmonics);
    let n = 0;
    for (let h = 1; h <= ANALYSIS.harmonics; h++) {
      const p = (h * f) / binHz;
      if (p >= K - 2) break;
      pos[n++] = p;
    }
    candPos.push(pos);
    candCount.push(n);
  }
  const weights = new Float64Array(ANALYSIS.harmonics);
  for (let h = 0; h < ANALYSIS.harmonics; h++) weights[h] = Math.pow(ANALYSIS.harmonicDecay, h);

  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  const fft = new FFT(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const magA = new Float64Array(K);
  const magB = new Float64Array(K);
  const white = new Float64Array(K);
  const prefix = new Float64Array(K + 1);

  const sal = new Float32Array(T * B);

  const whitenAndScore = (mag: Float64Array, t: number): void => {
    for (let k = 0; k < K; k++) mag[k] = Math.sqrt(mag[k]!);
    prefix[0] = 0;
    for (let k = 0; k < K; k++) prefix[k + 1] = prefix[k]! + mag[k]!;
    const R = 10;
    for (let k = 0; k < K; k++) {
      const lo = Math.max(0, k - R);
      const hi = Math.min(K - 1, k + R);
      const mean = (prefix[hi + 1]! - prefix[lo]!) / (hi - lo + 1);
      const v = mag[k]! - 0.7 * mean;
      white[k] = v > 0 ? v : 0;
    }
    const base = t * B;
    for (let c = 0; c < B; c++) {
      const pos = candPos[c]!;
      const n = candCount[c]!;
      let s = 0;
      for (let h = 0; h < n; h++) {
        const p = pos[h]!;
        const i0 = Math.floor(p);
        const fr = p - i0;
        s += weights[h]! * (white[i0]! * (1 - fr) + white[i0 + 1]! * fr);
      }
      sal[base + c] = s;
    }
  };

  const loadFrame = (t: number, target: Float64Array): void => {
    const start = t * hop - N / 2;
    for (let i = 0; i < N; i++) {
      const idx = start + i;
      target[i] = idx >= 0 && idx < x.length ? x[idx]! * win[i]! : 0;
    }
  };

  for (let t = 0; t < T; t += 2) {
    if (opts.isCancelled?.()) throw new Error("cancelled");
    const hasB = t + 1 < T;
    loadFrame(t, re);
    if (hasB) loadFrame(t + 1, im);
    else im.fill(0);
    fft.transform(re, im);
    for (let k = 0; k < K; k++) {
      const nk = (N - k) % N;
      const ar = 0.5 * (re[k]! + re[nk]!);
      const ai = 0.5 * (im[k]! - im[nk]!);
      const br = 0.5 * (im[k]! + im[nk]!);
      const bi = -0.5 * (re[k]! - re[nk]!);
      magA[k] = Math.hypot(ar, ai);
      magB[k] = Math.hypot(br, bi);
    }
    whitenAndScore(magA, t);
    if (hasB) whitenAndScore(magB, t + 1);
    if ((t & 127) === 0) opts.onProgress?.((t / T) * 0.8);
  }

  // Normalise by the 98th percentile of per-frame maxima (robust global loudness).
  const frameMax = new Float32Array(T);
  for (let t = 0; t < T; t++) {
    let m = 0;
    for (let c = 0; c < B; c++) m = Math.max(m, sal[t * B + c]!);
    frameMax[t] = m;
  }
  const sorted = Float32Array.from(frameMax).sort();
  const ref = sorted[Math.min(T - 1, Math.floor(T * 0.98))]!;
  const scale = ref > 1e-9 ? 1 / ref : 0;
  for (let i = 0; i < sal.length; i++) sal[i] = sal[i]! * scale;

  // Viterbi tracking.
  const W = ANALYSIS.trackWindowBins;
  const bp = new Int16Array(T * B);
  let prev = new Float32Array(B);
  let cur = new Float32Array(B);
  for (let c = 0; c < B; c++) prev[c] = sal[c]!;
  for (let t = 1; t < T; t++) {
    if (opts.isCancelled?.()) throw new Error("cancelled");
    let gBest = -Infinity;
    let gIdx = 0;
    for (let i = 0; i < B; i++) if (prev[i]! > gBest) { gBest = prev[i]!; gIdx = i; }
    const jump = gBest - ANALYSIS.trackJumpPenalty;
    let curMax = -Infinity;
    for (let j = 0; j < B; j++) {
      let best = jump;
      let arg = gIdx;
      const lo = Math.max(0, j - W);
      const hi = Math.min(B - 1, j + W);
      for (let i = lo; i <= hi; i++) {
        const v = prev[i]! - ANALYSIS.trackSlopePenalty * Math.abs(i - j);
        if (v > best) { best = v; arg = i; }
      }
      bp[t * B + j] = arg;
      const val = best + sal[t * B + j]!;
      cur[j] = val;
      if (val > curMax) curMax = val;
    }
    for (let j = 0; j < B; j++) cur[j] = cur[j]! - curMax; // keep numbers small
    const tmp = prev; prev = cur; cur = tmp;
    if ((t & 255) === 0) opts.onProgress?.(0.8 + (t / T) * 0.2);
  }
  let end = 0;
  for (let c = 1; c < B; c++) if (prev[c]! > prev[end]!) end = c;
  const path = new Int16Array(T);
  path[T - 1] = end;
  for (let t = T - 1; t > 0; t--) path[t - 1] = bp[t * B + path[t]!]!;

  const midi = new Float32Array(T);
  const level = new Float32Array(T);
  for (let t = 0; t < T; t++) {
    const c = path[t]!;
    level[t] = sal[t * B + c]!;
    if (level[t]! >= ANALYSIS.voicingThreshold) {
      const f = ANALYSIS.fMinHz * Math.pow(2, (c * ANALYSIS.centsPerBin) / 1200);
      midi[t] = 69 + 12 * Math.log2(f / 440);
    } else {
      midi[t] = NaN;
    }
  }
  opts.onProgress?.(1);
  return { hopSec, midi: medianSmooth(midi, 2), level };
}

/** Median over voiced neighbours within ±radius frames; unvoiced stays NaN. */
export function medianSmooth(midi: Float32Array, radius: number): Float32Array {
  const out = new Float32Array(midi.length);
  const buf: number[] = [];
  for (let i = 0; i < midi.length; i++) {
    if (Number.isNaN(midi[i]!)) { out[i] = NaN; continue; }
    buf.length = 0;
    for (let k = Math.max(0, i - radius); k <= Math.min(midi.length - 1, i + radius); k++) {
      if (!Number.isNaN(midi[k]!)) buf.push(midi[k]!);
    }
    buf.sort((a, b) => a - b);
    out[i] = buf[buf.length >> 1]!;
  }
  return out;
}
