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
  // --- per-note human character (all drawn from the seeded PRNG) ---
  pitchOffCents: number;
  slopeCents: number; // slow drift across the note, cents per second
  vibScale: number; // 0 = straight tone
  glideSec: number;
  scoop: number; // 0..1 of scoopCents
  breath: number;
  decay: number; // loudness fade across the note
}

function buildVoices(notes: Note[], rnd: () => number): Voice[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const voices: Voice[] = [];
  const centered = (): number => rnd() + rnd() - 1; // triangular, -1..1
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
    const dur = Math.max(0, n.end - start);
    voices.push({
      start,
      end: Math.max(start, n.end),
      logHz,
      gain: Math.min(1, Math.max(0.05, n.gain * (1 + WHISTLE.gainSpread * centered()))),
      glideFrom,
      fresh,
      pitchOffCents: WHISTLE.intonationCents * centered(),
      slopeCents: WHISTLE.driftCentsPerSec * centered(),
      // Short notes are usually straight; longer ones sometimes get vibrato.
      vibScale: dur < 0.35 || rnd() > WHISTLE.vibratoShare ? 0 : 0.5 + 0.8 * rnd(),
      glideSec: 0.03 + 0.05 * rnd(),
      scoop: rnd() < 0.25 ? 0.1 : 0.4 + 0.6 * rnd(),
      breath: 0.8 + 0.7 * rnd(),
      decay: 0.2 * rnd(),
    });
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
  const rnd = mulberry32(WHISTLE.seed);
  const voices = buildVoices(notes, rnd);
  const BLOCK = 32;
  const blockSec = BLOCK / sr;

  const attackCoef = 1 - Math.exp(-blockSec / (WHISTLE.attackSec / 3));
  const releaseCoef = 1 - Math.exp(-blockSec / (WHISTLE.releaseSec / 3));
  // Pressure noise: random walk low-passed to ~3 Hz.
  const pressureCoef = 1 - Math.exp(-2 * Math.PI * 3 * blockSec);

  const wPhase1 = rnd() * 6.283;
  const wPhase2 = rnd() * 6.283;
  const vPhase = rnd() * 6.283;
  let vi = 0; // index of current/next voice
  let phase = 0;
  let amp = 0;
  let lastLogHz = voices[0]?.logHz ?? Math.log(900);
  let hzPrev = Math.exp(lastLogHz);
  let drift = 0;
  let pressure = 0;
  let breathMod = 1;
  // Narrow band-pass (RBJ) state for airy component around the pitch.
  let z1 = 0;
  let z2 = 0;
  const Q = 12;
  // One-pole high-pass state for lip/teeth hiss.
  let hissLp = 0;
  const hissAlpha = 1 - Math.exp((-2 * Math.PI * 2500) / sr);

  const nBlocks = Math.ceil(total / BLOCK);
  for (let b = 0; b < nBlocks; b++) {
    const t = (b * BLOCK) / sr;
    while (vi < voices.length && t >= voices[vi]!.end) vi++;
    const v = voices[vi];
    const active = v !== undefined && t >= v.start;

    // --- target pitch (log Hz) ---
    let logHz = lastLogHz;
    let tn = 0;
    let frac = 0;
    if (active && v) {
      tn = t - v.start;
      frac = v.end > v.start ? tn / (v.end - v.start) : 0;
      logHz = v.logHz;
      if (v.glideFrom !== null) {
        const g = smoothstep(tn / v.glideSec);
        logHz = v.glideFrom + (v.logHz - v.glideFrom) * g;
      }
    }
    lastLogHz = logHz;

    // --- slow random processes ---
    drift += (rnd() * 2 - 1 - drift) * 0.04;
    pressure += (rnd() * 2 - 1 - pressure) * pressureCoef;
    breathMod += (rnd() * 2 - 1 - (breathMod - 1)) * 0.05;
    const press = pressure * 6; // ~ unit variance after smoothing

    // --- amplitude envelope (note loudness fades a little; pressure wobbles it) ---
    const noteLevel = active && v ? v.gain * 0.5 * (1 - v.decay * Math.min(1, frac)) : 0;
    const target = noteLevel * (1 + WHISTLE.pressureAmp * press);
    amp += (target - amp) * (target > amp ? attackCoef : releaseCoef);

    // --- pitch expression ---
    const vibRamp = active && v ? smoothstep((tn - WHISTLE.vibratoDelaySec) / 0.3) * v.vibScale : 0;
    const vibHz = WHISTLE.vibratoHz + 0.6 * Math.sin(2 * Math.PI * 0.31 * t + wPhase2);
    const vibDepth = WHISTLE.vibratoCents * (0.75 + 0.25 * Math.sin(2 * Math.PI * 0.19 * t + wPhase1));
    const vibSin = Math.sin(2 * Math.PI * vibHz * t + vPhase);
    const vibCents = vibDepth * vibRamp * vibSin;
    const wander =
      WHISTLE.wanderCents * (0.6 * Math.sin(2 * Math.PI * 0.53 * t + wPhase1) + 0.4 * Math.sin(2 * Math.PI * 1.31 * t + wPhase2));
    let shape = 0; // onset scoop and release sag (cents)
    let noteCents = 0; // per-note intonation error and slow slope
    if (active && v) {
      noteCents = v.pitchOffCents + v.slopeCents * Math.min(tn, 1.5);
      if (v.fresh) shape = -WHISTLE.scoopCents * v.scoop * (1 - smoothstep(tn / WHISTLE.scoopSec));
    } else if (vi > 0) {
      shape = -WHISTLE.sagCents * smoothstep((t - voices[vi - 1]!.end) / WHISTLE.releaseSec);
      noteCents = voices[vi - 1]!.pitchOffCents;
    }
    const cents = vibCents + wander + drift * 2 + WHISTLE.pressureCents * press + noteCents + shape;
    const hz = Math.exp(logHz) * Math.pow(2, cents / 1200);
    const shimmer = 1 + 0.03 * vibRamp * vibSin;

    // --- breath components ---
    const w0 = (2 * Math.PI * Math.min(hz, sr * 0.45)) / sr;
    const alpha = Math.sin(w0) / (2 * Q);
    const a0 = 1 + alpha;
    const bb0 = alpha / a0;
    const a1 = (-2 * Math.cos(w0)) / a0;
    const a2 = (1 - alpha) / a0;
    const chiff = active && v?.fresh ? Math.exp(-tn / 0.04) : 0;
    const airy = Math.min(1.6, Math.max(0.7, 1.7 - (hz - 450) / 1500)); // low notes breathier
    const vb = v ? v.breath : 1;
    const breathGain =
      amp * WHISTLE.breathLevel * airy * vb * (0.7 + 0.3 * breathMod) * (1 + 5 * chiff) * 4 * (1 + 0.3 * press);
    const hissGain = amp * WHISTLE.hissLevel * vb * (1 + 6 * chiff) * (1 + 0.3 * press);

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
      hissLp += hissAlpha * (nz - hissLp);
      const hiss = nz - hissLp;
      out[i] = amp * shimmer * tone + breathGain * y + hissGain * hiss;
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
  const fb = 0.8;
  const damp = 0.4;
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
