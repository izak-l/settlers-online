#!/usr/bin/env python3
"""Prepare sound recordings without changing supplied exports; requires ffmpeg.

Run from any directory. --check verifies that runtime recordings have prompt onsets.
Use --actions to prepare/check the action WAVs instead of dice recordings.
"""

import argparse
import array
import math
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = [
    "freesound_community-067760_2d6-rolling-dice-35982-2.mp3",
    "freesound_community-068708_2d6-rolling-dice-35979-2.mp3",
    "freesound_community-070921_2d6-rolling-dice-37050-2.mp3",
    "freesound_community-071809_2d6-rolling-dice-35978-2.mp3",
    "freesound_community-073088_2d6-rolling-dice-37051-2.mp3",
    "freesound_community-074096_2d6-rolling-dice-35976-2.mp3",
    "freesound_community-075220_2d6-rolling-dice-35981-2.mp3",
    "freesound_community-076456_2d6-rolling-dice-35980-2.mp3",
]
RATE = 48000
THRESHOLD = 10 ** (-50 / 20)
PREROLL = 0.01
NOISE_SAMPLE_SECONDS = 0.1
NOISE_REDUCTION_DB = 8
ACTION_EXPORTS = [
    "road-placed.wav", "settlement-placed.wav", "swipe-sound.wav",
    "end-turn-clock-tick.wav", "card-received.wav",
]


def prepare_actions(source_dir, check):
    destination = ROOT / "apps/web/public/sounds/actions"
    if not check:
        destination.mkdir(parents=True, exist_ok=True)
    for name in ACTION_EXPORTS:
        output = destination / name.replace(".wav", ".mp3")
        if not check:
            source = source_dir / name
            start = max(0, onset(source) - PREROLL)
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-i", str(source),
                 "-af", (f"atrim=start={start:.6f},asetpts=PTS-STARTPTS,"
                         "volume=-1dB,afade=t=in:d=0.002,areverse,"
                         "afade=t=in:d=0.005,areverse"),
                 "-map_metadata", "-1", "-c:a", "libmp3lame", "-q:a", "2", str(output)],
                check=True,
            )
        delay = onset(output)
        if delay > 0.04:
            raise ValueError(f"{output}: audible onset delayed by {delay:.3f}s")
        print(f"{output.name}: audible onset {delay * 1000:.1f}ms (OK)")


def onset(path):
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le",
         "-ac", "1", "-ar", str(RATE), "-"],
        check=True, capture_output=True,
    )
    samples = array.array("f", result.stdout)
    if sys.byteorder != "little":
        samples.byteswap()
    for i, sample in enumerate(samples):
        if math.isfinite(sample) and abs(sample) >= THRESHOLD:
            return i / RATE
    raise ValueError(f"No audible signal in {path}")


def denoise(source, raw, output):
    """Learn the hiss from the raw recording, then process the selected export.

    The export's leading silence is digital zero, not a usable noise profile.
    Prepend 100 ms of room noise from the matching raw take, learn its spectrum,
    then discard that prefix. Use a lossless intermediate to encode MP3 only once.
    """
    filters = (
        f"[1:a]atrim=start=0:end={NOISE_SAMPLE_SECONDS},asetpts=PTS-STARTPTS,"
        "aformat=sample_rates=48000:channel_layouts=stereo[profile];"
        f"[0:a]atrim=start={max(0, onset(source) - PREROLL):.6f},"
        "asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo[clip];"
        "[profile][clip]concat=n=2:v=0:a=1,"
        "asendcmd=c='0.0 afftdn sn start;0.08 afftdn sn stop',"
        f"afftdn=nr={NOISE_REDUCTION_DB}:nf=-42:gs=5,"
        f"atrim=start={NOISE_SAMPLE_SECONDS},asetpts=PTS-STARTPTS[out]"
    )
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(source), "-i", str(raw),
         "-filter_complex", filters, "-map", "[out]", "-c:a", "pcm_f32le", str(output)],
        check=True,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--source-dir", type=Path, default=ROOT / "assets/audio/dice-sfx")
    parser.add_argument("--actions", action="store_true", help="Prepare/check the action WAVs instead of dice")
    parser.add_argument("--actions-source-dir", type=Path, default=ROOT / "assets/audio")
    args = parser.parse_args()
    if args.actions:
        prepare_actions(args.actions_source_dir, args.check)
        return
    destination = ROOT / "apps/web/public/sounds/dice"
    if not args.check:
        destination.mkdir(parents=True, exist_ok=True)
    for index, name in enumerate(EXPORTS, 1):
        output = destination / f"roll-{index:02}.mp3"
        if not args.check:
            source = args.source_dir / name
            raw = args.source_dir / "raw" / name.replace("-2.mp3", ".mp3")
            with tempfile.TemporaryDirectory(prefix="settlers-sound-") as temporary:
                cleaned = Path(temporary) / "cleaned.wav"
                denoise(source, raw, cleaned)
                # Remove any filtering latency along with remaining leading silence.
                start = max(0, onset(cleaned) - PREROLL)
                subprocess.run(
                    ["ffmpeg", "-v", "error", "-y", "-i", str(cleaned),
                     "-af", (f"atrim=start={start:.6f},asetpts=PTS-STARTPTS,"
                             "afade=t=in:d=0.003,areverse,"
                             "afade=t=in:d=0.01,areverse"),
                     "-map_metadata", "-1", "-codec:a", "libmp3lame", "-q:a", "2",
                     str(output)],
                    check=True,
                )
            print(f"{output.name}: {NOISE_REDUCTION_DB} dB profiled noise reduction")
        delay = onset(output)
        if delay > 0.04:
            raise ValueError(f"{output}: audible onset delayed by {delay:.3f}s")
        print(f"{output.name}: audible onset {delay * 1000:.1f}ms (OK)")


if __name__ == "__main__":
    main()
