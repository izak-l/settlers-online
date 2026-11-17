import { TURN_SECONDS_CHOICES, type LobbyState } from "@settlers/protocol";
import {
  LOBBY_LIMITS,
  atDefaults,
  clampTo,
  lobbyDefaults,
  seatChoices,
  settingsOf,
  timerText,
  withDefaults,
  type LobbySettingsValue,
} from "./lobbySettingsModel";

/** A − value + control for a number within `range`. */
function Stepper({
  label,
  value,
  range,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  range: { min: number; max: number };
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Fewer: ${label}`}
        disabled={disabled || value <= range.min}
        onClick={() => onChange(clampTo(range, value - 1))}
      >
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button
        type="button"
        aria-label={`More: ${label}`}
        disabled={disabled || value >= range.max}
        onClick={() => onChange(clampTo(range, value + 1))}
      >
        +
      </button>
    </div>
  );
}

/**
 * The lobby's settings (spec 229): players, points to win, discard limit, turn timer and
 * spectators. The host edits them (each change is sent whole); everyone else reads them.
 */
export function LobbySettings({
  lobby,
  editable,
  disabled,
  onChange,
}: {
  lobby: LobbyState;
  editable: boolean;
  disabled: boolean;
  onChange: (next: LobbySettingsValue) => void;
}) {
  const value = settingsOf(lobby);
  const defaults = lobbyDefaults(lobby);
  const seated = lobby.seats.filter((s) => s !== null).length;
  const set = (patch: Partial<LobbySettingsValue>) => onChange({ ...value, ...patch });

  if (!editable || !defaults) {
    return (
      <section className="stack tight lobby-settings" aria-label="Settings">
        <h3>Settings</h3>
        <dl className="settings-list">
          <dt>Players</dt>
          <dd>{value.maxSeats}</dd>
          <dt>Points to win</dt>
          <dd>{value.vpToWin}</dd>
          <dt>Discard limit</dt>
          <dd>{value.discardLimit} cards</dd>
          <dt>Turn timer</dt>
          <dd>{timerText(value.turnSeconds)}</dd>
          <dt>Spectators</dt>
          <dd>{value.allowSpectators ? "Allowed" : "Not allowed"}</dd>
        </dl>
      </section>
    );
  }

  return (
    <section className="stack lobby-settings" aria-label="Settings">
      <div className="settings-head">
        <h3>Settings</h3>
        <button
          type="button"
          className="link"
          disabled={disabled || atDefaults(value, defaults)}
          onClick={() => onChange(withDefaults(value, defaults))}
        >
          Map defaults
        </button>
      </div>
      <div className="settings-grid">
        <div className="setting">
          <span className="setting-label">Players</span>
          <div className="segmented seats-picker" role="radiogroup" aria-label="Players">
            {seatChoices(defaults.maxSeats, seated).map(({ n, disabled: tooFew }) => (
              <label
                key={n}
                className={value.maxSeats === n ? "seg active" : "seg"}
                title={tooFew ? `${seated} players are seated` : undefined}
              >
                <input
                  type="radio"
                  name="lobby-seats"
                  checked={value.maxSeats === n}
                  disabled={disabled || tooFew}
                  onChange={() => set({ maxSeats: n })}
                />
                {n}
              </label>
            ))}
          </div>
          <span className="muted small">Up to {defaults.maxSeats} on this map.</span>
        </div>
        <div className="setting">
          <span className="setting-label">Points to win</span>
          <Stepper
            label="Points to win"
            value={value.vpToWin}
            range={LOBBY_LIMITS.vpToWin}
            disabled={disabled}
            onChange={(vpToWin) => set({ vpToWin })}
          />
          <span className="muted small">Map default {defaults.vpToWin}.</span>
        </div>
        <div className="setting">
          <span className="setting-label">Discard limit</span>
          <Stepper
            label="Discard limit"
            value={value.discardLimit}
            range={LOBBY_LIMITS.discardLimit}
            disabled={disabled}
            onChange={(discardLimit) => set({ discardLimit })}
          />
          <span className="muted small">
            On a 7, anyone holding more than {value.discardLimit} cards discards half.
          </span>
        </div>
        <label className="setting">
          <span className="setting-label">Turn timer</span>
          <select
            value={value.turnSeconds}
            disabled={disabled}
            onChange={(e) =>
              set({ turnSeconds: Number(e.target.value) as LobbySettingsValue["turnSeconds"] })
            }
          >
            {TURN_SECONDS_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Off" : `${n} seconds per turn`}
              </option>
            ))}
          </select>
        </label>
        <label className="check setting-check">
          <input
            type="checkbox"
            checked={value.allowSpectators}
            disabled={disabled}
            onChange={(e) => set({ allowSpectators: e.target.checked })}
          />
          Allow spectators
        </label>
      </div>
    </section>
  );
}
