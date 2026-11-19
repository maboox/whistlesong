import type { Note } from "../types";

/** Draw a minimal piano roll of the whistled notes. */
export function drawRoll(canvas: HTMLCanvasElement, notes: Note[], durationSec: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const css = getComputedStyle(document.documentElement);
  const noteColor = css.getPropertyValue("--roll-note").trim() || "#6d5efc";
  const gridColor = css.getPropertyValue("--roll-grid").trim() || "#ddd";
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  if (notes.length === 0 || durationSec <= 0) return;
  let lo = Infinity;
  let hi = -Infinity;
  for (const n of notes) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); }
  lo -= 2; hi += 2;
  const rowH = h / (hi - lo + 1);
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let m = Math.ceil(lo); m <= hi; m += 12) {
    const y = h - (m - lo + 0.5) * rowH;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.fillStyle = noteColor;
  for (const n of notes) {
    const x = (n.start / durationSec) * w;
    const nw = Math.max(2, ((n.end - n.start) / durationSec) * w);
    const y = h - (n.midi - lo + 1) * rowH;
    ctx.globalAlpha = 0.45 + 0.55 * n.gain;
    ctx.fillRect(x, y, nw, Math.max(2, rowH * 0.8));
  }
  ctx.globalAlpha = 1;
}
