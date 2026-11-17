# Sound credits

## Dice recordings

The project owner supplied these eight exported MP3 recordings from
`assets/audio/dice-sfx/` and confirmed on 2026-11-16 that they hold the rights
and authorize their use in this project. This records that authorization;
it does not assert that the recordings are CC0 or grant a separate license
for reuse outside this project. Source exports are unchanged. Runtime copies have
leading silence removed, gentle spectral noise reduction using the matching raw
recordings' room noise, and short edge fades. They are re-encoded as MP3 by
`scripts/prepare-sounds.py`; original exports and raw recordings are untouched.

| Runtime file | Supplied export |
| --- | --- |
| `dice/roll-01.mp3` | `freesound_community-067760_2d6-rolling-dice-35982-2.mp3` |
| `dice/roll-02.mp3` | `freesound_community-068708_2d6-rolling-dice-35979-2.mp3` |
| `dice/roll-03.mp3` | `freesound_community-070921_2d6-rolling-dice-37050-2.mp3` |
| `dice/roll-04.mp3` | `freesound_community-071809_2d6-rolling-dice-35978-2.mp3` |
| `dice/roll-05.mp3` | `freesound_community-073088_2d6-rolling-dice-37051-2.mp3` |
| `dice/roll-06.mp3` | `freesound_community-074096_2d6-rolling-dice-35976-2.mp3` |
| `dice/roll-07.mp3` | `freesound_community-075220_2d6-rolling-dice-35981-2.mp3` |
| `dice/roll-08.mp3` | `freesound_community-076456_2d6-rolling-dice-35980-2.mp3` |

## Placement, swipe and clock recordings

The project owner supplied these WAVs and requested their use for these actions
on 2026-11-16. Source files in `assets/audio/` remain unchanged. Runtime copies
remove leading silence, lower gain by 1 dB for headroom, apply short edge fades,
and encode MP3 once; no noise reduction is applied to these recordings.

| Runtime file | Supplied source | Use |
| --- | --- | --- |
| `actions/road-placed.mp3` | `road-placed.wav` | Road and ship placement, including setup and free placements |
| `actions/settlement-placed.mp3` | `settlement-placed.wav` | Settlement placement, including setup |
| `actions/swipe-sound.mp3` | `swipe-sound.wav` | Successful stealing |
| `actions/end-turn-clock-tick.mp3` | `end-turn-clock-tick.wav` | Final five seconds of your timed turn |
| `actions/card-received.mp3` | `card-received.wav` | Resources received (existing `gain` cue) |

Other effects are synthesized by the project’s Web Audio recipes. Robber and
pirate movement have no sound.
