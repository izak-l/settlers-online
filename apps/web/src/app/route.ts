import { useSyncExternalStore } from "react";

export type Route =
  | { name: "home" }
  | { name: "lobby"; id: string }
  | { name: "game"; id: string }
  | { name: "sandbox" };

export function parseRoute(hash: string): Route {
  const [, kind, id] = hash.replace(/^#/, "").split("/");
  if (kind === "lobby" && id) return { name: "lobby", id };
  if (kind === "game" && id) return { name: "game", id };
  if (kind === "sandbox") return { name: "sandbox" };
  return { name: "home" };
}

export function go(path: string): void {
  window.location.hash = path;
}

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

/** Tiny hash router: invite links look like /#/lobby/<id>. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}
