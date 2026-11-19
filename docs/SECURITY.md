# Security & privacy (team: security)

Threat model: a static site that processes **untrusted user files** locally. No backend, no accounts, no secrets.

## Rules
- **No network I/O with user data.** Nothing is uploaded; the page makes no `fetch`/XHR calls.
- **Strict CSP** (injected at build, see `vite.config.ts`): `default-src 'none'`, scripts/styles/worker only from `'self'` (+ `blob:` for workers/media), no inline script or style, no `eval`.
- **Untrusted strings** (file names) go in via `textContent` only — never `innerHTML`.
- **Input limits** (`src/config.ts`): file ≤ 60 MB, song ≤ 5 min. Checked before and after decoding.
- **Heavy work in a Web Worker**; Cancel terminates it. Stale results are dropped via a run id.
- **Object URLs are revoked** on reset/page hide (no leaked memory).
- **Dependencies**: dev-only (`vite`, `typescript`, `vitest`), exact versions pinned, lockfile committed, **zero runtime dependencies**. Use `npm ci` in CI.
- **CI permissions** are minimal: `contents: read`; only the deploy job gets `pages: write` / `id-token: write`.
- No cookies, no analytics, no third-party scripts/fonts. `referrer: no-referrer`.

## Before adding anything new
Any new dependency, network call, storage use, or relaxation of the CSP needs an entry in `DECISIONS.md` first.
