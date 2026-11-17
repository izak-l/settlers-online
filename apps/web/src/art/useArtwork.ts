import { useSyncExternalStore } from "react";
import { getArtwork, subscribeArtwork } from "./appearance";

export function useArtwork() {
  return useSyncExternalStore(subscribeArtwork, getArtwork);
}
