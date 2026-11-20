# Whistle reference (measured from a real recording)

Source: an 8.6 s recording of the project owner whistling the same melody (not committed, it is personal data).
Tools: `tools/whistle_stats.py`, `tools/whistle_notes.py` (numpy). Re-run them on any new recording and update this table and `WHISTLE` in `src/config.ts` together.

| Property | Real whistle | Synth after tuning |
|---|---|---|
| Pitch range (voiced) | 785–1415 Hz, median 1028 Hz | 779–1414 Hz, median 1035 Hz |
| 2nd harmonic vs fundamental | −40 dB (median) | −40 dB |
| 3rd harmonic | −58 dB | −56 dB |
| Hiss 3–10 kHz | −52 dB | −53 dB |
| Noise around the pitch (800–1500 Hz band) | −33 dB | −35 dB |
| Regular vibrato | essentially none; irregular ~3 Hz wobble, ~±15 cents | only ~15 % of long notes, ±8 cents |
| Pitch drift while holding a note | median 66 cents/s, up to ~280 | up to ±200 cents/s per note |
| Within-note pitch scatter | std 4–17 cents (median ~9) | similar by construction |
| Onset | fast (≈20 ms to within 6 dB of peak); **no consistent scoop** | 25 ms attack, small random scoop |
| Note end | no consistent pitch sag | tiny sag (8 cents) |
| Gaps between notes | ~80–150 ms (tongue articulation) | comes from the analysed melody |

## Lessons
- Earlier versions guessed: too much broadband hiss, regular vibrato, big scoops, a hall reverb and too-high register all made it sound like an instrument. The real whistle is a very pure tone with a narrow breathy skirt, lazily drifting pitch and no regular vibrato.
- Melody extraction was run on the real whistle: it recovered the played notes (82→80, 86, 88–89, 85–86, 84…) matching the measured pitch track.
