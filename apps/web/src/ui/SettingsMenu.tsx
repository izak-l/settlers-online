import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../art/icons";
import { ArtworkChoices } from "./AppearanceControl";
import { SoundSettings } from "./SoundToggle";

/**
 * The in-game menu (spec 231): a gear in the top-left corner of the map with the appearance,
 * the volume and a way out. Closes on Escape or a click outside.
 */
export function SettingsMenu({ onExit, exitLabel }: { onExit: () => void; exitLabel: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [open]);

  return (
    <div
      className="settings-menu"
      ref={box}
      data-board-ui
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="settings-trigger"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label="Settings"
        title="Settings"
        onClick={() => setOpen(!open)}
      >
        <Icon name="gear" size={22} />
      </button>
      {open && (
        <div id={id} className="settings-popover panel" role="dialog" aria-label="Settings">
          <ArtworkChoices />
          <SoundSettings />
          <button type="button" className="exit-game" onClick={onExit}>
            {exitLabel}
          </button>
        </div>
      )}
    </div>
  );
}
