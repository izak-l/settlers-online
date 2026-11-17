import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../art/icons";
import { setArtwork } from "../art/appearance";
import { useArtwork } from "../art/useArtwork";
import { TerrainFace } from "../art/TerrainFace";
import { TerrainDefs } from "../art/board";
import { ResourceCard } from "../cards/CardFace";

export function AppearanceControl() {
  const artwork = useArtwork();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const focusOutside = (event: FocusEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    box.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    window.addEventListener("pointerdown", outside);
    window.addEventListener("focusin", focusOutside);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("focusin", focusOutside);
    };
  }, [open]);

  return (
    <div
      className="appearance"
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
        className="appearance-trigger"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label="Appearance"
        title="Appearance"
        onClick={() => setOpen(!open)}
      >
        <Icon name="palette" size={20} />
        <span className="appearance-label">Appearance</span>
      </button>
      {open && (
        <div id={id} className="appearance-popover">
          <fieldset>
            <legend>Artwork</legend>
            <p className="muted">Tiles and resource cards</p>
            <div className="artwork-choices">
              {(["original", "realism"] as const).map((choice) => (
                <label className="artwork-choice" key={choice}>
                  <span className="artwork-sample" aria-hidden="true">
                    <svg viewBox="-55 -61 110 122" width="62" height="70">
                      <TerrainDefs />
                      <TerrainFace q={0} r={0} terrain="forest" artwork={choice} />
                    </svg>
                    <ResourceCard resource="wood" artwork={choice} />
                  </span>
                  <span>
                    <input
                      type="radio"
                      name={`${id}-artwork`}
                      value={choice}
                      checked={artwork === choice}
                      onChange={() => setArtwork(choice)}
                    />{" "}
                    {choice === "original" ? "Original" : "Realism"}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
