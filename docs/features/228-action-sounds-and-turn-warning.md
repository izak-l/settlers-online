# 228 — Placement, stealing and turn-warning recordings

## Goal

Use the four newly supplied WAVs for their intended actions and warn the player
when five seconds remain on their timed turn.

## Scope / non-scope

- Continue on `feature/recorded-sounds`; preserve source WAVs in the main checkout.
- User confirmed the mapping and behavior before implementation.
- Roads and settlements get separate recorded cues, including setup/free placements.
  Per the later user request, ship building/setup/free placement uses the road
  recording too. Moving an existing ship retains its recipe; city upgrades are unchanged.
- `swipe-sound.wav` plays for a successful steal. Robber and pirate movement are silent.
- Follow-up during testing: preserve flying cards during steals. Fix the unrelated
  board auto-fit zoom caused by changing overlay geometry (spec 223 follow-up).
- `end-turn-clock-tick.wav` starts five seconds before a turn deadline.
- Existing dice effects, other cues, controls and game rules stay as they are.
- Approved follow-up: `card-received.wav` replaces the resource-gain recipe through
  the existing `gain` cue, preserving its audience, priority and 180 ms spacing
  after dice. Add it to the action preparation list and runtime credits.
- Fix silent sandbox roads: keep new public event cues across automatic seat changes
  after setup placements, without comparing different players' hands or replaying
  private log history. Reset the baseline when switching game clients.

## Rules

- Prepare MP3 runtime copies from the four source WAVs, remove leading silence and
  retain natural tails. Avoid clipping and preserve originals; no added denoising.
- Tick only for the player whose turn clock is running, including when their tab is
  hidden. Use the server-derived deadline already shown by the UI. No warning for
  spectators, other players, untimed games, game over or the separate discard clock.
- Stop ticking at the deadline, on early turn end, a paused/replaced clock, seat/game
  change or leaving the game. If joining/resuming within the last five seconds, start
  at the corresponding point in the recording rather than playing a full late warning.
- Small deadline jitter from snapshots must not restart the warning. A substantial
  deadline correction reschedules it. Muting and volume use the shared player.
- Loop the tick recording if needed to cover the remaining warning window; never
  let it continue after the deadline. Do not substitute sounds on load failure.

## Engine changes

None.

## Server/UI changes

- Split road and settlement cues in `audio/cues.ts`, remove movement cue mappings,
  and register the four recordings in `audio/catalog.ts`.
- Add cancellable tick playback to `audio/player.ts` and a small deadline controller
  in `audio/turnWarning.ts`, connected to game snapshots by `audio/useSounds.ts`.
- Extend `scripts/prepare-sounds.py` for the action WAVs. Update runtime credits,
  `docs/AUDIO.md`, `DESIGN.md` and Current focus.

## Test plan

- Road/settlement/setup/free placements select their respective cues; movement is
  silent; stealing retains its existing visible/hidden-tab audience rules.
- Fake-clock checks: start at five seconds, no restart on normal snapshots, stop
  early, expiry, pause/resume, corrected deadlines, late join, and spectator filtering.
- Player checks: recorded warning offset, loop, scheduled stop, cancellation, volume,
  missing recordings and autoplay readiness.
- Runtime onset/peak checks, web tests, workspace typecheck/lint and production build.
- User listening review: placement/swipe balance and a timed online turn warning.
  The sandbox currently has no running turn clock.

## Open questions

None. Personal warning audience follows the existing hidden-tab policy.

## Status

Shipped. User authorized the mappings and five-second warning, reviewed the
follow-ups, and approved integration into local `main` on 2026-11-16.

Validation: all 134 web tests pass, including timer scheduling/cancellation,
snapshot filtering, recorded warning offset/loop/stop and mute handling. Workspace
typecheck, lint, production web build and action-recording onset checks pass.
Final pre-commit workspace run: 578 tests pass; one Postgres test is skipped
because `TEST_DATABASE_URL` is unset.
All five runtime action MP3s start within 11 ms and decode without clipping. Original
WAV files are untouched. No push or deployment is included.

Road follow-up: Chromium playback instrumentation confirms the road recording
starts for all eight setup roads, including six that switch sandbox seats, with no
browser errors. Regression tests cover all setup roads, ship placement mappings,
and differing private-log lengths/hand contents when seats change.
