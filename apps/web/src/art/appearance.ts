/** Artwork is a local viewer preference, independent of game state and UI colors. */
export type Artwork = "original" | "realism";
export const ARTWORK_KEY = "settlers.artwork";
export const DEFAULT_ARTWORK: Artwork = "original";

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

export function loadArtwork(store: Storage | null = storage()): Artwork {
  try {
    return store?.getItem(ARTWORK_KEY) === "realism" ? "realism" : DEFAULT_ARTWORK;
  } catch {
    return DEFAULT_ARTWORK;
  }
}

export function saveArtwork(artwork: Artwork, store: Storage | null = storage()): void {
  try {
    store?.setItem(ARTWORK_KEY, artwork);
  } catch {
    // The selection still works for this page when storage is blocked.
  }
}

let current: Artwork | undefined;
const listeners = new Set<() => void>();

export const getArtwork = (): Artwork => (current ??= loadArtwork());

export function setArtwork(artwork: Artwork): void {
  current = artwork;
  saveArtwork(artwork);
  for (const listener of listeners) listener();
}

export function subscribeArtwork(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
