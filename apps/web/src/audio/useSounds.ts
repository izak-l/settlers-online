import { useEffect, useRef } from "react";
import type { ChatMessage } from "@settlers/protocol";
import type { GameClient, Snapshot } from "../game/LocalGame";
import { cuesFor, type CueInput } from "./cues";
import { play } from "./player";
import { TurnWarning, warningClock } from "./turnWarning";

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
  const prev = useRef<{ client: GameClient; input: CueInput } | null>(null);
  useEffect(() => {
    const warning = new TurnWarning();
    const unsubscribe = client.subscribe((next) => warning.update(warningClock(next)));
    return () => {
      unsubscribe();
      warning.dispose();
    };
  }, [client]);
  useEffect(() => {
    if (!snap) return;
    const next = cueInput(snap);
    // A new game has no history baseline; switching sandbox seats still has public events.
    const before = prev.current?.client === client ? prev.current.input : null;
    prev.current = { client, input: next };
    play(cuesFor(before, next, { hidden: hidden() }));
  }, [snap, client]);

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
