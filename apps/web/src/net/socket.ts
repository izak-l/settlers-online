import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@settlers/protocol";
import { currentToken } from "./auth";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** One socket per signed-in tab. The token is fetched fresh on every (re)connect. */
export function openSocket(): AppSocket {
  return io(__SERVER_URL__, {
    transports: ["websocket"],
    auth: (cb) => {
      void currentToken().then((token) => cb({ token }));
    },
  });
}
