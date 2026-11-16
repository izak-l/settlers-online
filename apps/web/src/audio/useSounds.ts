import { useEffect, useRef } from "react";
import type { ChatMessage } from "@settlers/protocol";
import type { GameClient, Snapshot } from "../game/LocalGame";
import { cuesFor, type CueInput } from "./cues";
import { play } from "./synth";

function cueInput(snap: Snapshot): CueInput {
  const top = snap.view.decisions.at(-1);
  return {
    seat: snap.seat,
    log: snap.log,
    top: top && {
      kind: top.kind,
      pendingFrom: top.pendingFrom,
      ...(top.data ? { data: top.data } : {}),
    },
    hand: snap.view.zones[`hand-${snap.seat}`]?.contents ?? {},
  };
}

const FRESH_CHAT_MS = 15_000;

const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

/** Play cues for each new snapshot, and a tick for other people's chat messages. */
export function useSounds(snap: Snapshot | null, client: GameClient, myUserId?: string): void {
  const prev = useRef<CueInput | null>(null);
  useEffect(() => {
    if (!snap) return;
    const next = cueInput(snap);
    // The dev sandbox switches seats in one tab; compare like with like.
    const before = prev.current?.seat === next.seat ? prev.current : null;
    prev.current = next;
    play(cuesFor(before, next, { hidden: hidden() }));
  }, [snap]);

  useEffect(() => {
    if (!client.chat) return;
    let lastId = 0;
    return client.chat.subscribe((messages: ChatMessage[]) => {
      // History arrives as a batch after joining; only recent messages from others make a sound.
      const recent = (m: ChatMessage) => Date.now() - Date.parse(m.at) < FRESH_CHAT_MS;
      const fresh = messages.filter((m) => m.id > lastId && m.userId !== myUserId && recent(m));
      if (fresh.length > 0) play(["chat"]);
      lastId = Math.max(lastId, messages.at(-1)?.id ?? 0);
    });
  }, [client, myUserId]);
}
