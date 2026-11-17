import { useEffect, useState } from "react";
import { go } from "../app/route";
import { useSession } from "../app/session";
import { errorText } from "../game/seats";
import { SocketGame } from "../game/SocketGame";
import { GameView } from "./GameView";

export function OnlineGame({ id }: { id: string }) {
  const socket = useSession((s) => s.socket);
  const [client, setClient] = useState<SocketGame | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create the client inside the effect (not useMemo) so its cleanup always pairs with its creation;
  // StrictMode runs effects twice in development.
  useEffect(() => {
    if (!socket) return;
    const c = new SocketGame(socket, id, (e) => setError(errorText(e.code, e.message)));
    setClient(c);
    return () => {
      c.dispose();
      setClient(null);
    };
  }, [socket, id]);

  if (error) {
    return (
      <div className="start card stack">
        <p className="error">{error}</p>
        <button onClick={() => go("/")}>Back home</button>
      </div>
    );
  }
  return client ? <GameView client={client} onExit={() => go("/")} /> : null;
}
