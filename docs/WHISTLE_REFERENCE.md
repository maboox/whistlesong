# Whistle reference (measured from a real recording)

Source: an 8.6 s recording of the project owner whistling the same melody (not committed, it is personal data).
Tools: `tools/whistle_stats.py`, `tools/whistle_notes.py` (numpy). Re-run them on any new recording and update this table and `WHISTLE` in `src/config.ts` together.

| Property | Real whistle | Synth after tuning |
|---|---|---|
| Pitch range (voiced) | 785–1415 Hz, median 1028 Hz | 779–1414 Hz, median 1035 Hz |
| 2nd harmonic vs fundamental | −40 dB (median) | −40 dB |
| 3rd harmonic | −58 dB | −56 dB |
| Hiss 3–10 kHz | −52 dB (steady) plus a broadband puff at each note onset | low steady hiss + onset puff (`onsetPuff`) |
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

## Second reference: 84 s of web whistling clips (11 clips, several whistlers; 2026-11-21)
Measured with the same tools plus per-note onset statistics (18 steady notes).

| Property | Web clips | Applied |
|---|---|---|
| Register | medians 1150–1960 Hz depending on clip, up to ~3 kHz | not copied: we keep the owner's ~1 kHz register (user found higher = "too high") |
| Overtones | 2nd −23…−53 dB (median ~−40), 3rd ~−55 dB | unchanged (−40/−58) |
| Pitch time spent gliding (8–150 c per 10 ms) | 25–50 % in melodic clips, smooth arcs and swoops | legato glides now up to 120 ms gaps, 40–110 ms long; plus **expression transfer** (see below) |
| Onsets | 56 % of notes start flat > 40 c (median −70 c, quartile −165 c), recover in ~90 ms | scoop on ~50 % of notes, 40–190 c, 90 ms |
| In-note pitch scatter | median 12 c (p90 38) | similar |
| In-note drift | median 100 c/s | up to ±260 c/s |
| In-note loudness std | median 1.5 dB | `pressureAmp` 0.2 → ~1.5 dB |
| Broadband noise | 1.5–3 kHz −35…−44 dB, 3–6 kHz −40…−56 dB (varies by recording) | unchanged |
| Attack/release | 5/10 ms in the clips (trimmed/gated), 20/35 ms in the owner's recording | 20 ms / 60 ms |

### Expression transfer (new)
`segmentNotes` snaps to semitones but now also stores each note's `bend` (cents of the raw track around the snapped pitch, clamped ±120, 3-point median). `renderWhistle` replays 70 % of it, so portamento/vibrato/scoops sung or whistled in the source survive instead of being flattened into perfect steps. Instruments (piano) have flat bends, so they only get the synthetic human variation.

### Known limits found
- Melody finder searches 110–1760 Hz (fine for songs). Whistles above ~1.8 kHz as *input* are tracked an octave low.
- Not yet listened to by the developer: all judgements are measurements; the owner's ears decide.

## Third reference: a 98 s whistling cover of a pop song (2026-11-22) + re-check of all references
Tools: `tools/whistle_articulation.py` (note transitions, starts, ends), `tools/whistle_micro.py`
(complex demodulation of the fundamental: pitch/loudness fluctuation per frequency band),
`tools/whistle_skirt.py` (breath noise next to the pitch). Values are medians; the synth column is
the app rendering Twinkle Twinkle after this round.

| Property | Owner | Web clips | Cover | Synth now |
|---|---|---|---|---|
| Note changes with silence | 72 % | 64–83 % | 71–75 % | ~60 % |
| Tongued dips / slurs | 0 / 28 % | 0–4 / 17–32 % | 8–10 / 15–21 % | 0–12 / 31–42 %* |
| Silence length | 110 ms | 155–200 ms | 120–180 ms | 120–160 ms |
| Note end: pitch move, share falling >100 c, tail | −49 c, 20 %, 90 ms | −51…+13 c, 22–29 %, 60–125 ms | −37…+54 c, 5–29 %, 80–165 ms | −44…−113 c, 20–56 %, 60–70 ms |
| Note start offset | −20 c | −87…−350 c | −11…−53 c | −18…−113 c |
| Breath skirt 3–6 / 6–12 / 12–25 % from pitch | −29 / −32 / −40 dB | −15…−23 / −26…−32 / −32…−36 | −29…−32 / −34…−37 / −40…−44 | −26 / −31 / −36 |
| Loudness flutter 8–16 / 16–32 Hz | 0.6 / 0.2 dB | 0.3 / 0.2 | 0.5–0.8 / 0.4–0.5 | 0.3 / 0.3 |
| Pitch wobble 4–8 Hz | 5 c | 6–17 c | 5–7 c | 3 c |

\* plateau-based metric also counts repeated same-pitch notes and scoops; planned slur share is 20 %.

### Main lesson of this round
The biggest difference was **articulation**: real whistlers stop the air (or tongue) between most notes,
so a whistled melody is a chain of separate little notes with silences of ~0.1–0.2 s, each starting a bit
flat and often ending with a small fall. The previous synth slurred ~94 % of note changes into one
continuous line, which is what an instrument/theremin does. Also fixed: block-rate amplitude steps
(zipper noise), breath noise that was ~10 dB too wide around the pitch (now a 4th-order band-pass),
and fast turbulent loudness/pitch flutter that was missing.

### Data policy
Only the owner's own recording may ever be shipped as audio. Web clips and the cover are used for
measurements only (numbers in this file), never bundled.
