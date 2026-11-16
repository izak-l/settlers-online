import { useEffect, useRef, useState } from "react";
import { Icon } from "../art/icons";
import { getSettings, setSettings, subscribeSettings } from "../audio/settings";

/** Top-bar sound control: the speaker mutes / unmutes; the arrow opens a volume slider. */
export function SoundToggle() {
  const [s, setS] = useState(getSettings);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => subscribeSettings(setS), []);

  // Close the popover on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const silent = s.muted || s.volume === 0;
  return (
    <div className="sound" ref={box}>
      <button
        className="icon-button"
        aria-pressed={s.muted}
        aria-label={s.muted ? "Unmute sounds" : "Mute sounds"}
        title={s.muted ? "Unmute sounds" : "Mute sounds"}
        onClick={() => setSettings({ ...s, muted: !s.muted })}
      >
        <Icon name={silent ? "speakerOff" : "speaker"} size={20} />
      </button>
      <button
        className="icon-button narrow"
        aria-expanded={open}
        aria-label="Sound volume"
        title="Sound volume"
        onClick={() => setOpen(!open)}
      >
        ▾
      </button>
      {open && (
        <div className="sound-popover" role="group" aria-label="Sound settings">
          <label className="field">
            <span>Volume {Math.round(s.volume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.volume}
              onChange={(e) => setSettings({ ...s, volume: Number(e.target.value), muted: false })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
