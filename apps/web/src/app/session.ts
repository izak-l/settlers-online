import { create } from "zustand";
import type { Me } from "@settlers/protocol";
import { getDevUser, setDevUser, supabase } from "../net/auth";
import { openSocket, type AppSocket } from "../net/socket";
import { errorText } from "../game/seats";

export type Status = "loading" | "signedOut" | "connecting" | "online" | "offline" | "error";

interface Session {
  status: Status;
  me: Me | null;
  socket: AppSocket | null;
  error: string | null;
  /** Call once on startup. */
  start(): void;
  signInDev(name: string): void;
  signOut(): Promise<void>;
  /** Returns an error message, or null on success. */
  setUsername(username: string): Promise<string | null>;
}

const RETURN_TO = "settlers.returnTo";

/** Remember where to come back to across an OAuth redirect. */
export function rememberRoute(): void {
  try {
    sessionStorage.setItem(RETURN_TO, window.location.hash);
  } catch {
    /* ignore */
  }
}
function restoreRoute(): void {
  try {
    const hash = sessionStorage.getItem(RETURN_TO);
    sessionStorage.removeItem(RETURN_TO);
    if (hash && hash !== window.location.hash) window.location.hash = hash;
  } catch {
    /* ignore */
  }
}

export const useSession = create<Session>()((set, get) => {
  function connect() {
    if (get().socket) return;
    const socket = openSocket();
    set({ socket, status: "connecting", error: null });
    socket.on("welcome", (me) => {
      set({ me, status: "online", error: null });
      restoreRoute();
    });
    socket.on("disconnect", (reason) => {
      // The client reconnects by itself unless we closed it.
      if (reason !== "io client disconnect") set({ status: "offline" });
    });
    socket.on("connect_error", (err) => {
      if (err.message === "UNAUTHENTICATED") {
        socket.disconnect();
        set({ socket: null, me: null, status: "signedOut", error: "Please sign in again." });
      } else if (!socket.active) {
        // Server-side refusal (not a network blip): socket.io won't retry by itself.
        set({ status: "error", error: errorText(err.message, err.message) });
      } else {
        set({ status: "offline" });
      }
    });
  }

  function disconnect() {
    get().socket?.disconnect();
    set({ socket: null, me: null });
  }

  return {
    status: "loading",
    me: null,
    socket: null,
    error: null,

    start() {
      if (getDevUser()) connect();
      if (!supabase) {
        if (!getDevUser()) set({ status: "signedOut" });
        return;
      }
      // Fires immediately with the stored session (INITIAL_SESSION), then on every change.
      supabase.auth.onAuthStateChange((_event, session) => {
        if (getDevUser()) return;
        if (session) connect();
        else {
          disconnect();
          set({ status: "signedOut" });
        }
      });
    },

    signInDev(name) {
      setDevUser(name);
      disconnect();
      connect();
    },

    async signOut() {
      setDevUser(null);
      disconnect();
      await supabase?.auth.signOut();
      set({ status: "signedOut", error: null });
    },

    async setUsername(username) {
      const socket = get().socket;
      if (!socket) return "Not connected.";
      const ack = await socket.emitWithAck("profile:setUsername", { username });
      if (!ack.ok) return errorText(ack.code, ack.message);
      set({ me: ack.me });
      return null;
    },
  };
});
