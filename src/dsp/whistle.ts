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
  scoopCents: number; // flat start, recovered over scoopSec (0 = none)
  scoopSec: number;
  /** Pitch fall while the note dies away (cents, positive = down) and its duration. */
  fallCents: number;
  fallSec: number;
  bend: Float32Array | null;
  bendHopSec: number;
  breath: number;
  decay: number; // loudness fade across the note
}

type Transition = "slur" | "dip" | "gap";

/**
 * Plan how a real whistler would connect each note to the next one. Measured on
 * real recordings (docs/WHISTLE_REFERENCE.md): most note changes have a short silence
 * (re-articulation), a few are tongued "dips", only ~20 % are slurred glides.
 */
function planTransitions(notes: Note[], rnd: () => number, human: number): Transition[] {
  return notes.map((n, i) => {
    const next = notes[i + 1];
    if (!next) return "gap";
    if (next.glideSec !== undefined) return "slur"; // a sweep in the source: keep it continuous
    if (human === 0) return next.start - n.end <= WHISTLE.maxGlideGapSec && next.midi !== n.midi ? "slur" : "gap";
    const r = rnd();
    if (r < WHISTLE.slurProb && next.midi !== n.midi) return "slur";
    if (r < WHISTLE.slurProb + WHISTLE.dipProb) return "dip";
    return "gap";
  });
}

function buildVoices(notes: Note[], rnd: () => number, human: number): Voice[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start).map((n) => ({ ...n }));
  const plan = planTransitions(sorted, rnd, human);
  // Shorten notes so the planned silence fits, as a whistler steals time from the note.
  sorted.forEach((n, i) => {
    const next = sorted[i + 1];
    if (!next || plan[i] === "slur") return;
    const want = plan[i] === "dip" ? WHISTLE.dipSec : WHISTLE.gapMinSec + (WHISTLE.gapMaxSec - WHISTLE.gapMinSec) * rnd();
    const dur = n.end - n.start;
    const latestEnd = next.start - want;
    const minEnd = n.start + Math.max(WHISTLE.minHeldSec, dur * WHISTLE.minHeldShare);
    if (n.end > latestEnd) n.end = Math.max(minEnd, Math.min(n.end, latestEnd));
    if (n.end > next.start) n.end = next.start;
  });

  const voices: Voice[] = [];
  const centered = (): number => rnd() + rnd() - 1; // triangular, -1..1
  sorted.forEach((n, i) => {
    const logHz = Math.log(midiToHz(n.midi));
    const prev = voices[voices.length - 1];
    let start = n.start;
    let glideFrom: number | null = null;
    let fresh = true;
    if (prev && plan[i - 1] === "slur") {
      if (start < prev.end) prev.end = Math.max(prev.start, start);
      glideFrom = prev.logHz;
      start = prev.end; // legato: no silence between
      fresh = false;
    } else if (prev && start < prev.end) {
      prev.end = Math.max(prev.start, start);
    }
    const dur = Math.max(0, n.end - start);
    const endsInSilence = plan[i] !== "slur";
    const bigFall = human > 0 && endsInSilence && rnd() < WHISTLE.fallProb;
    voices.push({
      start,
      end: Math.max(start, n.end),
      logHz,
      gain: Math.min(1, Math.max(0.05, n.gain * (1 + WHISTLE.gainSpread * centered()))),
      glideFrom,
      fresh,
      pitchOffCents: human * WHISTLE.intonationCents * centered(),
      slopeCents: human * WHISTLE.driftCentsPerSec * centered(),
      // Short notes are usually straight; longer ones sometimes get vibrato.
      vibScale: human === 0 || dur < 0.35 || rnd() > WHISTLE.vibratoShare ? 0 : 0.5 + 0.8 * rnd(),
      glideSec: n.glideSec !== undefined ? Math.min(WHISTLE.maxSweepSec, Math.max(0.06, n.glideSec)) : 0.04 + 0.07 * rnd(),
      // Scoop size is skewed: mostly small, sometimes a big slide from below.
      scoopCents:
        human > 0 && fresh && dur >= WHISTLE.minExpressiveNoteSec && rnd() < WHISTLE.scoopProb
          ? WHISTLE.scoopMinCents * Math.exp(Math.log(WHISTLE.scoopMaxCents / WHISTLE.scoopMinCents) * rnd() * rnd())
          : 0,
      scoopSec: WHISTLE.scoopSec * (0.7 + 0.8 * rnd()),
      fallCents: !endsInSilence || human === 0
        ? 0
        : bigFall
          ? WHISTLE.fallMinCents + (WHISTLE.fallMaxCents - WHISTLE.fallMinCents) * rnd()
          : WHISTLE.droopCents * (0.3 + 1.2 * rnd()),
      fallSec: WHISTLE.fallSec * (0.7 + 0.6 * rnd()),
      bend: n.bend ?? null,
      bendHopSec: n.bendHopSec ?? 0.02,
      breath: 0.8 + 0.7 * rnd(),
      decay: 0.2 * rnd(),
    });
  });
  return voices;
}

const smoothstep = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

export interface RenderOptions {
  /** false = clean tone: no random pitch/loudness character (used by tests). Default true. */
  humanize?: boolean;
}

export function renderWhistle(
  notes: Note[],
  durationSec: number,
  sr: number,
  onProgress?: (fraction: number) => void,
  opts: RenderOptions = {},
): Float32Array {
  const human = opts.humanize === false ? 0 : 1;
  const total = Math.max(1, Math.ceil((durationSec + WHISTLE.releaseSec * 3) * sr));
  const out = new Float32Array(total);
  const rnd = mulberry32(WHISTLE.seed);
  const voices = buildVoices(notes, rnd, human);
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
  let toneGainPrev = 0; // per-sample interpolation avoids block-rate amplitude steps (zipper noise)
  let drift = 0;
  let pressure = 0;
  let breathMod = 1;
  // Turbulent flutter (~3-25 Hz band-pass noise) on loudness and pitch, as measured on real whistles.
  const fastCoef = 1 - Math.exp(-2 * Math.PI * 25 * blockSec);
  const slowCoef = 1 - Math.exp(-2 * Math.PI * 3 * blockSec);
  // Pitch wobble is slower (3-12 Hz): measured 5-17 cents in the 4-8 Hz band.
  const pFastCoef = 1 - Math.exp(-2 * Math.PI * 12 * blockSec);
  const pNorm = Math.sqrt(3) / Math.sqrt(Math.max(1e-6, pFastCoef / (2 - pFastCoef) - slowCoef / (2 - slowCoef)));
  let aFast = 0, aSlow = 0, pFast = 0, pSlow = 0;
  // Normalise band-pass noise to unit RMS (white uniform noise has RMS 1/sqrt(3)).
  const bpNorm = Math.sqrt(3) / Math.sqrt(Math.max(1e-6, fastCoef / (2 - fastCoef) - slowCoef / (2 - slowCoef)));
  // Narrow band-pass (RBJ) state for airy component around the pitch.
  let z1 = 0;
  let z2 = 0;
  // Second identical stage: real breath noise hugs the pitch and falls off steeply (measured skirt).
  let z3 = 0;
  let z4 = 0;
  const Q = 8;
  // One-pole high-pass state for lip/teeth hiss.
  let hissLp = 0;
  const hissAlpha = 1 - Math.exp((-2 * Math.PI * 1000) / sr);

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
    const wa = rnd() * 2 - 1;
    aFast += (wa - aFast) * fastCoef;
    aSlow += (wa - aSlow) * slowCoef;
    const wp = rnd() * 2 - 1;
    pFast += (wp - pFast) * pFastCoef;
    pSlow += (wp - pSlow) * slowCoef;
    const flutterDb = human * WHISTLE.flutterDb * (aFast - aSlow) * bpNorm;
    const flutterCents = human * WHISTLE.flutterCents * (pFast - pSlow) * pNorm;

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
      if (v.fresh) shape = -v.scoopCents * (1 - smoothstep(tn / v.scoopSec));
      if (v.bend && v.bend.length > 0) {
        const pos = Math.min(v.bend.length - 1, tn / v.bendHopSec);
        const i0 = Math.floor(pos);
        const i1 = Math.min(v.bend.length - 1, i0 + 1);
        shape += human * WHISTLE.bendShare * (v.bend[i0]! + (v.bend[i1]! - v.bend[i0]!) * (pos - i0));
      }
    } else if (vi > 0) {
      const pv = voices[vi - 1]!;
      shape = -pv.fallCents * smoothstep((t - pv.end) / pv.fallSec);
      noteCents = voices[vi - 1]!.pitchOffCents;
    }
    const cents = vibCents + human * (wander + drift * 2 + WHISTLE.pressureCents * press) + flutterCents + noteCents + shape;
    const hz = Math.exp(logHz) * Math.pow(2, cents / 1200);
    const shimmer = (1 + 0.03 * vibRamp * vibSin) * Math.pow(10, flutterDb / 20);

    // --- breath components ---
    const w0 = (2 * Math.PI * Math.min(hz, sr * 0.45)) / sr;
    const alpha = Math.sin(w0) / (2 * Q);
    const a0 = 1 + alpha;
    const bb0 = alpha / a0;
    const a1 = (-2 * Math.cos(w0)) / a0;
    const a2 = (1 - alpha) / a0;
    // Tongue/breath puff at the start of a fresh note: a broadband burst that dies in ~100 ms.
    const puffScale = v ? Math.min(1, 0.3 + (0.7 * (v.end - v.start)) / WHISTLE.minExpressiveNoteSec) : 1;
    const chiff = active && v?.fresh ? Math.exp(-tn / 0.05) : 0;
    const airy = Math.min(1.6, Math.max(0.7, 1.7 - (hz - 450) / 1500)); // low notes breathier
    const vb = v ? v.breath : 1;
    const breathGain =
      amp * WHISTLE.breathLevel * airy * vb * (0.7 + 0.3 * breathMod) * (1 + 5 * chiff * puffScale) * 4 * (1 + 0.3 * press);
    const hissGain = amp * WHISTLE.hissLevel * vb * (1 + WHISTLE.onsetPuff * chiff * puffScale) * (1 + 0.3 * press);

    const toneGain = amp * shimmer;
    const i0 = b * BLOCK;
    const i1 = Math.min(total, i0 + BLOCK);
    for (let i = i0; i < i1; i++) {
      const frac = (i - i0 + 1) / BLOCK;
      const f = hzPrev + (hz - hzPrev) * frac;
      const tg = toneGainPrev + (toneGain - toneGainPrev) * frac;
      phase += (2 * Math.PI * f) / sr;
      if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
      const tone = Math.sin(phase) + WHISTLE.harmonic2 * Math.sin(2 * phase) + WHISTLE.harmonic3 * Math.sin(3 * phase);
      const nz = rnd() * 2 - 1;
      // Transposed direct form II band-pass (b1 = 0, b2 = -b0).
      const y = bb0 * nz + z1;
      z1 = z2 - a1 * y;
      z2 = -bb0 * nz - a2 * y;
      const y2 = bb0 * y + z3;
      z3 = z4 - a1 * y2;
      z4 = -bb0 * y - a2 * y2;
      hissLp += hissAlpha * (nz - hissLp);
      const hiss = nz - hissLp;
      out[i] = tg * tone + breathGain * y2 + hissGain * hiss;
    }
    hzPrev = hz;
    toneGainPrev = toneGain;
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
