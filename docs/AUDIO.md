# Updating sound effects

Sound effects are chosen in `apps/web/src/audio/cues.ts` and registered in
`apps/web/src/audio/catalog.ts`. Each cue explicitly uses either a recorded
sound or one of the recipes in `synth.ts`. The player never substitutes sources.

## Adding recordings

1. Keep editing projects and raw recordings in the local `assets/audio/` source
   folder, outside commits. Export each intended effect as a separate MP3, trim
   leading silence and unwanted tails, and balance perceived volume between clips.
2. Copy the selected exports into `apps/web/public/sounds/<effect>/` with stable
   names. Add source names, provenance and permission/license information to
   `apps/web/public/sounds/CREDITS.md`. Use original or CC0 files by default;
   the owner explicitly authorized the eight supplied dice recordings for this project.
3. Replace that cue's catalog entry, for example:

   ```ts
   build: {
     kind: "recording",
     files: ["sounds/build/build-01.mp3", "sounds/build/build-02.mp3"],
     gain: 0.8,
   },
   ```

   Paths are relative to Vite's public base URL. List files explicitly; adding a
   file to a folder alone does not register it. `gain` is an optional multiplier
   before the shared volume control (default 1). A single file is supported.
4. Run `pnpm typecheck`, `pnpm test`, `pnpm lint` and
   `pnpm --filter @settlers/web build`. Catalog tests verify that registered files
   exist and contain data. Listen to the clips in the sandbox before shipping.

For the same cue, selection is random across all variants except the previous
one played. This is local audio variation and does not affect game randomness.
Roads and settlements have separate `road` and `settlement` recordings. Building
or placing ships also uses `road`; moving an existing ship retains the synthesized
`build` cue, and city upgrades retain `city`. Successful
steals use `steal`; moving the robber or pirate has no sound.

Sandbox setup automatically changes seats after most roads/ships are placed. New
public placement events still play across those viewer changes. Hand deltas and
personal decision prompts are compared only within the same seat; private history
is excluded from the cross-seat event baseline. A new game still starts silently.

## Playback behavior and listening checks

The first pointer/key gesture creates the shared audio context and starts fetching
and decoding all registered recordings once. Before the context is running or a
selected recording is decoded, its cue is dropped rather than queued. A failed
recording logs a developer-console warning and stays unavailable until reload;
the player does not retry it or replace it with another recording or synthesis.

Mute and volume apply to ongoing and new sounds and remain stored per browser.
Existing hidden-tab and initial-history filtering is unchanged. Two cues from one
update start 180 ms apart, so the card-gain sound intentionally overlaps a dice
recording. Playback never delays game input or waits for a recording to finish.

From the sound worktree, run `pnpm dev`, open `http://localhost:5173`, and choose
the dev sandbox. Stop a dev server in another checkout first because ports are
shared. Worktree `.env` files are separate; the sandbox does not need production
credentials. Complete setup and roll across several turns. Check clip variety,
onset, loudness, dice plus gain, mute during a clip, the volume slider, persistence
after reload, and rapid actions. Use separate browser sessions for hidden-tab and
chat checks in online play.

## Preparing the supplied dice exports

The original Audacity exports contain 0.9–2.7 seconds of leading silence. Generate
runtime copies with `python3 scripts/prepare-sounds.py` (requires `ffmpeg`). In a
worktree without the local source folder, pass
`--source-dir /path/to/original-checkout/assets/audio/dice-sfx`.

The script uses the explicit eight-file mapping in `CREDITS.md`. It finds the
export's onset at -50 dBFS and removes leading silence, retaining 10 ms before it.
It samples 100 ms of room noise from the beginning of the matching `raw/` recording
(same filename without `-2`) to learn a spectral noise profile. The export's
leading digital zeros cannot supply that profile. FFmpeg's `afftdn` applies a
gentle 8 dB reduction with gain smoothing; the player does no live noise processing.
The script removes filtering latency, adds a 3 ms fade-in and 10 ms fade-out to
soften cut boundaries, and encodes MP3 once through a lossless WAV intermediate.
Rebuild from sources to avoid repeatedly encoding already-compressed runtime files.

Source files remain untouched. To check the runtime files
without the source exports, run `python3 scripts/prepare-sounds.py --check`.
It fails for a silent recording or an audible onset more than 40 ms into a clip.
Listen after regeneration for retained clicks and natural tails; onset checks
cannot detect watery or metallic artifacts from excessive denoising. Adjust
`NOISE_REDUCTION_DB` in the preparation script if listening calls for a gentler pass.
Audacity exports must begin at the intended clip start rather than preserve a
silent timeline offset; otherwise apply the same preparation before registration.

## Placement, swipe and clock exports

Prepare the supplied action WAVs with:

```sh
python3 scripts/prepare-sounds.py --actions --actions-source-dir /path/to/original-checkout/assets/audio
python3 scripts/prepare-sounds.py --actions --check
```

Files are explicitly listed in the script and mapped in `CREDITS.md`. Preparation
removes leading silence, leaves 10 ms before onset, applies -1 dB of headroom and
2 ms/5 ms edge fades, then encodes runtime MP3s. Original 24-bit WAVs stay untouched;
these recordings do not receive the dice noise-reduction treatment.

`card-received.wav` supplies the `gain` cue for increases in your resource hand
(production, trades, stealing or other resource awards). Existing cue priority and
hidden-tab filtering apply; this does not add extra per-card playback.

The clock recording starts when five seconds remain on **your** turn clock, even
in a hidden tab. The separate discard clock, other players and spectators do not
trigger it. If needed it loops to fill the warning window; it stops at expiry,
early turn end, clock pause/change or leaving the game. Late joins/resumes play
the corresponding remaining portion. Ordinary snapshots do not restart the sound;
deadline corrections of 100 ms or more reschedule it. Shared mute/volume apply to
ongoing ticking. Autoplay and unavailable-recording rules still apply.

Test the warning in an online game with a turn timer enabled (30 seconds is the
shortest option). Let your clock reach five seconds, then try ending the turn early
during the ticking. The dev sandbox does not supply a running clock.
