# UX / UI principles (team: UX + UI)

## UX
- One screen, one job: **pick a song → wait → listen → download**. Three states only: pick, working, result.
- Mobile first (testing happens on phones): single column, 48 px tap targets, safe-area insets, native file picker (`audio/*`).
- Always show progress with human wording ("Listening for the melody…"), and a Cancel button.
- Errors are plain English, say what to do next, and use `role="alert"`.
- Trust: say clearly that nothing is uploaded.
- Result: player first, then piano-roll preview, then Download; original is one tap away for comparison.

## UI
- System font stack, one accent colour, cards, generous spacing; light and dark via `prefers-color-scheme`.
- Colours are CSS variables in `src/styles.css` (canvas reads them too).
- Accessibility: labelled controls, visible focus rings, `aria-live` for progress, reduced-motion respected, text contrast ≥ 4.5:1.
