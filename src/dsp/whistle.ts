import { WHISTLE } from "../config";
import { midiToHz, type Note } from "../types";

/** Small seeded PRNG so renders are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Voice {
  start: number;
  end: number;
  logHz: number;
  gain: number;
  /** log-frequency to glide from (legato), or null for a fresh attack. */
  glideFrom: number | null;
  /** true when this voice starts after silence (gets a breath "chiff"). */
  fresh: boolean;
}

function buildVoices(notes: Note[]): Voice[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const voices: Voice[] = [];
  for (const n of sorted) {
    const logHz = Math.log(midiToHz(n.midi));
    const prev = voices[voices.length - 1];
    let start = n.start;
    let glideFrom: number | null = null;
    let fresh = true;
    if (prev) {
      // Never overlap: this is a single whistle.
      if (start < prev.end) prev.end = Math.max(prev.start, start);
      const gap = start - prev.end;
      if (gap <= WHISTLE.maxGlideGapSec && Math.abs(logHz - prev.logHz) > 1e-6) {
        glideFrom = prev.logHz;
        start = prev.end; // legato: no silence between
        fresh = false;
      }
    }
    voices.push({ start, end: Math.max(start, n.end), logHz, gain: n.gain, glideFrom, fresh });
  }
  return voices;
}

const smoothstep = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

export function renderWhistle(
  notes: Note[],
  durationSec: number,
  sr: number,
  onProgress?: (fraction: number) => void,
): Float32Array {
  const total = Math.max(1, Math.ceil((durationSec + WHISTLE.releaseSec * 3) * sr));
  const out = new Float32Array(total);
  const voices = buildVoices(notes);
  const rnd = mulberry32(WHISTLE.seed);
  const BLOCK = 32;
  const blockSec = BLOCK / sr;

  const attackCoef = 1 - Math.exp(-blockSec / (WHISTLE.attackSec / 3));
  const releaseCoef = 1 - Math.exp(-blockSec / (WHISTLE.releaseSec / 3));

  const wPhase1 = rnd() * 6.283;
  const wPhase2 = rnd() * 6.283;
  const vPhase = rnd() * 6.283;
  const scoops = voices.map(() => 0.5 + 0.5 * rnd());
  let vi = 0; // index of current/next voice
  let phase = 0;
  let amp = 0;
  let lastLogHz = voices[0]?.logHz ?? Math.log(1200);
  let hzPrev = Math.exp(lastLogHz);
  let drift = 0; // slow random pitch wander (cents)
  let breathMod = 1;
  // Band-pass (RBJ) state for breath noise.
  let z1 = 0;
  let z2 = 0;
  const Q = 7;

  const nBlocks = Math.ceil(total / BLOCK);
  for (let b = 0; b < nBlocks; b++) {
    const t = (b * BLOCK) / sr;
    while (vi < voices.length && t >= voices[vi]!.end) vi++;
    const v = voices[vi];
    const active = v !== undefined && t >= v.start;

    // --- target pitch (log Hz) ---
    let logHz = lastLogHz;
    let tn = 0;
    if (active && v) {
      tn = t - v.start;
      logHz = v.logHz;
      if (v.glideFrom !== null) {
        const g = smoothstep(tn / WHISTLE.portamentoSec);
        logHz = v.glideFrom + (v.logHz - v.glideFrom) * g;
      }
    }
    lastLogHz = logHz;

    // --- amplitude envelope ---
    const target = active && v ? v.gain * 0.5 : 0;
    amp += (target - amp) * (target > amp ? attackCoef : releaseCoef);

    // --- expressive modulation ---
    drift += (rnd() * 2 - 1 - drift) * 0.04;
    breathMod += (rnd() * 2 - 1 - (breathMod - 1)) * 0.05;
    const vibRamp = active ? smoothstep((tn - WHISTLE.vibratoDelaySec) / 0.25) : 0;
    // Vibrato rate and depth breathe a little, as in a real (untrained) whistler.
    const vibHz = WHISTLE.vibratoHz + 0.5 * Math.sin(2 * Math.PI * 0.37 * t + wPhase2);
    const vibDepth = WHISTLE.vibratoCents * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.23 * t + wPhase1));
    const vibSin = Math.sin(2 * Math.PI * vibHz * t + vPhase);
    const vibCents = vibDepth * vibRamp * vibSin;
    const wander =
      WHISTLE.wanderCents * (0.6 * Math.sin(2 * Math.PI * 0.61 * t + wPhase1) + 0.4 * Math.sin(2 * Math.PI * 1.37 * t + wPhase2));
    let shape = 0; // onset scoop and release sag (cents)
    if (active && v && v.fresh) {
      shape = -WHISTLE.scoopCents * scoops[vi]! * (1 - smoothstep(tn / WHISTLE.scoopSec));
    } else if (!active && vi > 0) {
      shape = -WHISTLE.sagCents * smoothstep((t - voices[vi - 1]!.end) / WHISTLE.releaseSec);
    }
    const cents = vibCents + wander + drift * 2 + shape;
    // Amplitude follows the pitch wobble a little (tremolo of ~3 %).
    const shimmer = 1 + 0.03 * vibRamp * vibSin;
    const hz = Math.exp(logHz) * Math.pow(2, cents / 1200);

    // --- breath noise filter coefficients ---
    const w0 = (2 * Math.PI * Math.min(hz, sr * 0.45)) / sr;
    const alpha = Math.sin(w0) / (2 * Q);
    const a0 = 1 + alpha;
    const bb0 = alpha / a0;
    const a1 = (-2 * Math.cos(w0)) / a0;
    const a2 = (1 - alpha) / a0;
    const chiff = active && v?.fresh ? Math.exp(-tn / 0.035) : 0;
    // Low whistled notes are breathier, high ones purer.
    const airy = Math.min(1.5, Math.max(0.7, 1.5 - (hz - 500) / 2500));
    const breathGain = amp * WHISTLE.breathLevel * airy * (0.7 + 0.3 * breathMod) * (1 + 4 * chiff) * 3.2;

    const i0 = b * BLOCK;
    const i1 = Math.min(total, i0 + BLOCK);
    for (let i = i0; i < i1; i++) {
      const f = hzPrev + ((hz - hzPrev) * (i - i0 + 1)) / BLOCK;
      phase += (2 * Math.PI * f) / sr;
      if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
      const tone = Math.sin(phase) + WHISTLE.harmonic2 * Math.sin(2 * phase) + WHISTLE.harmonic3 * Math.sin(3 * phase);
      const nz = rnd() * 2 - 1;
      // Transposed direct form II band-pass (b1 = 0, b2 = -b0).
      const y = bb0 * nz + z1;
      z1 = z2 - a1 * y;
      z2 = -bb0 * nz - a2 * y;
      out[i] = amp * shimmer * tone + breathGain * y;
    }
    hzPrev = hz;
    if ((b & 1023) === 0) onProgress?.(b / nBlocks);
  }

  addRoom(out, sr, WHISTLE.reverbWet);

  // Plain peak normalisation: a soft clipper here would add harmonics to a pure tone.
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(out[i]!));
  if (peak > 0) {
    const g = 0.9 / peak;
    for (let i = 0; i < total; i++) out[i] = out[i]! * g;
  }
  onProgress?.(1);
  return out;
}

/** Tiny Schroeder room (4 combs + 2 all-passes) mixed in place. */
function addRoom(x: Float32Array, sr: number, wet: number): void {
  if (wet <= 0) return;
  const scale = sr / 44100;
  const combLens = [1116, 1188, 1277, 1356].map((n) => Math.round(n * scale));
  const apLens = [556, 441].map((n) => Math.round(n * scale));
  const combs = combLens.map((n) => ({ buf: new Float32Array(n), i: 0, lp: 0 }));
  const aps = apLens.map((n) => ({ buf: new Float32Array(n), i: 0 }));
  const fb = 0.82;
  const damp = 0.35;
  for (let n = 0; n < x.length; n++) {
    const dry = x[n]!;
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.i]!;
      c.lp = y * (1 - damp) + c.lp * damp;
      c.buf[c.i] = dry * 0.25 + c.lp * fb;
      c.i = (c.i + 1) % c.buf.length;
      acc += y;
    }
    for (const a of aps) {
      const y = a.buf[a.i]!;
      const w = acc + y * 0.5;
      a.buf[a.i] = w;
      acc = y - acc * 0.5;
      a.i = (a.i + 1) % a.buf.length;
    }
    x[n] = dry * (1 - wet * 0.5) + acc * wet;
  }
}
