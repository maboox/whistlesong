/** Test-signal generators. */
export function tone(
  sr: number,
  seconds: number,
  parts: Array<{ hz: number; start: number; end: number; amp: number; harmonics?: number[] }>,
): Float32Array {
  const x = new Float32Array(Math.floor(sr * seconds));
  for (const p of parts) {
    const h = p.harmonics ?? [1, 0.5, 0.33, 0.25];
    for (let i = Math.floor(p.start * sr); i < Math.min(x.length, Math.floor(p.end * sr)); i++) {
      const t = i / sr;
      const fade = Math.min(1, (t - p.start) / 0.01, (p.end - t) / 0.01);
      for (let k = 0; k < h.length; k++) x[i]! += p.amp * h[k]! * fade * Math.sin(2 * Math.PI * p.hz * (k + 1) * t);
    }
  }
  return x;
}
