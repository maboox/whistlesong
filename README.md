# WhistleSong

Turn any song into a whistled cover — entirely in your browser. Your music never leaves your device.

```bash
npm install
npm run dev        # http://localhost:5173 (also reachable from your phone on the same Wi-Fi)
npm test           # unit tests
npm run build      # production build in dist/
```

Deployed to GitHub Pages by `.github/workflows/ci-deploy.yml` (runs on `main`).
Project docs live in [`docs/`](docs/); working rules for Claude are in [`CLAUDE.md`](CLAUDE.md).

## How it works
1. Decode the file (Web Audio) → mono, 22.05 kHz.
2. Find the lead melody (harmonic-sum salience + Viterbi tracking) in a Web Worker.
3. Segment into notes, move them into a comfortable whistle register.
4. Synthesise a whistle (near-sine + breath noise + vibrato + glides) and encode a WAV.
