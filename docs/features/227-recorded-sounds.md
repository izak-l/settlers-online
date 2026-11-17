# 227 — Recorded sound effects

## Goal

Replace the synthesized dice effect with the eight supplied exported MP3s and make
future sound replacements a matter of adding recordings and updating an explicit catalog.

## Scope / non-scope

- Work on `feature/recorded-sounds`, created from `main` at `a60bc6f` in a separate
  worktree to preserve uncommitted work on `lobby-modes`.
- Use the eight top-level exported MP3s in `assets/audio/dice-sfx/`; exclude `raw/`
  and the Audacity project files. Preserve source files and keep `assets/audio/`
  out of commits, as required by `CLAUDE.md`.
- Initially replace only `dice`. Other cues explicitly use their existing synthesized
  recipes until recordings are supplied for them.
- No automatic fallback from a recorded cue to a synthesized cue or another recording.
- No sound-pack selector, music, engine, server or protocol changes.

## Rules

- Each cue has one explicit source: a synthesized recipe or a nonempty list of recordings.
  A recording entry may include a gain adjustment for balancing against other effects.
- Prepare the eight exported dice recordings in `apps/web/public/sounds/dice/` with
  stable names, `roll-01.mp3` through `roll-08.mp3`. Remove leading silence using
  `scripts/prepare-sounds.py` and document the source-to-runtime mapping.
- Randomly select one dice variant per playback, excluding the immediately previous
  variant when more than one is available. Audio variation belongs only to the client
  and never consumes the engine's seeded randomness.
- Load and decode recordings ahead of playback and cache their buffers. A cue whose
  recording is not ready or fails to load stays silent; do not queue it for later.
  Report loading failures in developer diagnostics without interrupting gameplay.
- Validate catalog coverage and referenced runtime file existence so missing packaged
  files are caught during checks rather than hidden by substitute sounds.
- Preserve browser audio unlocking on the first pointer/key gesture, dropping earlier
  cues, shared mute/volume settings, cue priority, the two-cue limit, hidden-tab filtering,
  and suppression of initial snapshot/history sounds.
- Review the current 180 ms spacing between cues against the supplied 1.7–3.6 second
  dice recordings. Specify the intended overlap or delay for dice plus resource gain
  after listening; sound playback must never delay game input or authoritative state.
- Record sources and permissions in `apps/web/public/sounds/CREDITS.md`. The owner
  confirmed rights and authorized use of all eight recordings on 2026-11-16.
  Document that authorization without asserting CC0 or a separate redistribution license.

## Engine changes

None.

## Server/UI changes

- Add `audio/catalog.ts` with an exhaustive cue-to-source mapping.
- Add `audio/player.ts` for the shared audio context, loading/cache, variant selection,
  gain routing and scheduling. Keep synthesis recipes in `audio/synth.ts` and pass
  the context into them rather than creating separate playback systems.
- Change `audio/useSounds.ts` to call the shared player.
- Add runtime dice files and `CREDITS.md` under `apps/web/public/sounds/`.
- Add `docs/AUDIO.md` describing preparation, naming, registration, license records,
  volume balancing and how to replace a synthesized cue with recordings.
- Keep the existing sound controls and cue triggers. Splitting shared build/robber
  cues into distinct events is outside this initial change.
- Update `CLAUDE.md` Current focus when implementation begins and fold lasting
  playback behavior into `DESIGN.md` when shipped. Update spec 009's description
  of synthesis-only playback to reference this change.

## Test plan

- Catalog coverage, nonempty recording lists and runtime asset existence.
- Variant selection including no immediate repeats and a single-recording cue.
- Shared mute/volume, unlock requirements, cached loading, overlapping playback,
  and silent behavior for unavailable or failed recordings with no fallback.
- Preserve existing cue and settings tests.
- Listen to all eight clips and dice/resource-gain combinations in the sandbox;
  check loudness, onset, tails and rapid successive actions.
- Browser-check mute, volume, reload persistence, hidden tabs and first interaction.
- Run workspace typecheck/tests and production web build before committing.

## Open questions

None. Keep the existing 180 ms onset spacing for dice plus resource gain.

## Status

Shipped on `feature/recorded-sounds`; accepted after user listening review on 2026-11-16.
User authorized implementation on `feature/recorded-sounds` on 2026-11-16.
Uses all eight supplied recordings, with random selection excluding the last
played variant and no automatic fallback. Other cues have explicit synthesized sources.
No engine, server or protocol changes. User approved integration into local `main`
on 2026-11-16; no push or deployment is included.

Validation: workspace typecheck, lint and production web build pass. Full workspace
suite: 567 tests pass; one Postgres integration test is skipped because
`TEST_DATABASE_URL` is unset. Server tests require local socket access outside the
sandbox. Supplied source exports remain untouched. Listening feedback identified
0.9–2.7 seconds of accidental leading silence in those exports; runtime copies now
remove it using `scripts/prepare-sounds.py`. Later listening feedback identified hiss;
the preparation now learns each recording's noise profile from its matching raw take
and applies gentle 8 dB spectral reduction plus short edge fades. Source exports
and raw files remain untouched. Its `--check` verifies audible onsets within 40 ms.
After the audio cleanup, all 123 web tests, lint, the production web build and
runtime onset checks pass. The user listened and accepted the cleaned effects as
adequate for now, while noting that some artifacts remain. Keep the current cleanup
settings; further denoising or replacement recordings are deferred. Browser sound
quality was assessed by the user, not by automated Web Audio mocks.

Follow-up spec 228 registers the four later action WAVs, splits road/settlement
cues, removes movement audio, and adds a five-second personal turn-clock warning.
