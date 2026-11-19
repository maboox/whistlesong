# Code standards (team: code quality)

- TypeScript `strict` + `noUncheckedIndexedAccess`; `npm run typecheck` must pass.
- Layout: `src/dsp/*` pure signal code (no DOM, unit-tested) · `src/audio/*` decode/encode · `src/worker/*` thread glue · `src/ui/*` + `src/main.ts` DOM only · `src/config.ts` every tunable number.
- `src/pipeline.ts` is DOM-free so the same code runs in the worker and in tests.
- No magic numbers outside `config.ts`; comment the *why*, not the *what*.
- Tests (`tests/`) for every DSP change; round-trip test (synth → analysis) guards the whole chain.
- Small commits, English messages. CI (`typecheck`, `test`, `build`) must be green before merge.
