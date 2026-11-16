/**
 * Mute and volume, remembered per browser. Storage can be missing or throw (private windows,
 * blocked site data), so every access is guarded and the defaults always work.
 */
export interface SoundSettings {
  muted: boolean;
  /** 0–1 */
  volume: number;
}

export const KEY = "settlers.sound";
export const DEFAULTS: SoundSettings = { muted: false, volume: 0.6 };

interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(store: Storage | null = storage()): SoundSettings {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      muted: typeof v.muted === "boolean" ? v.muted : DEFAULTS.muted,
      volume:
        typeof v.volume === "number" && v.volume >= 0 && v.volume <= 1 ? v.volume : DEFAULTS.volume,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: SoundSettings, store: Storage | null = storage()): void {
  try {
    store?.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not remembered this time; the setting still applies until the page closes.
  }
}

let current: SoundSettings | null = null;
const listeners = new Set<(s: SoundSettings) => void>();

export function getSettings(): SoundSettings {
  return (current ??= loadSettings());
}

export function setSettings(s: SoundSettings): void {
  current = s;
  saveSettings(s);
  for (const l of listeners) l(s);
}

export function subscribeSettings(l: (s: SoundSettings) => void): () => void {
  listeners.add(l);
  return () => void listeners.delete(l);
}
