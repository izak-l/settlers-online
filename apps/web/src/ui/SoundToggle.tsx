import { useEffect, useState } from "react";
import { Icon } from "../art/icons";
import { getSettings, setSettings, subscribeSettings } from "../audio/settings";

/** Mute and volume, shown in the game menu (spec 231). */
export function SoundSettings() {
  const [s, setS] = useState(getSettings);
  useEffect(() => subscribeSettings(setS), []);
  const silent = s.muted || s.volume === 0;
  return (
    <fieldset className="sound-settings">
      <legend>Volume</legend>
      <div className="sound-row">
        <button
          type="button"
          className="icon-button"
          aria-pressed={s.muted}
          aria-label={s.muted ? "Unmute sounds" : "Mute sounds"}
          title={s.muted ? "Unmute sounds" : "Mute sounds"}
          onClick={() => setSettings({ ...s, muted: !s.muted })}
        >
          <Icon name={silent ? "speakerOff" : "speaker"} size={20} />
        </button>
        <input
          type="range"
          aria-label="Sound volume"
          min={0}
          max={1}
          step={0.05}
          value={s.muted ? 0 : s.volume}
          onChange={(e) => setSettings({ ...s, volume: Number(e.target.value), muted: false })}
        />
        <span className="muted small">{s.muted ? "Muted" : `${Math.round(s.volume * 100)}%`}</span>
      </div>
    </fieldset>
  );
}
