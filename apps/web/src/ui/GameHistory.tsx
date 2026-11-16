import { useEffect, useState } from "react";
import type { GameSummary } from "@settlers/protocol";
import { go } from "../app/route";
import { useSession } from "../app/session";
import { SEAT_COLORS } from "../game/seats";

const dateText = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function GameRow({ game }: { game: GameSummary }) {
  const winner = game.players.find((p) => p.seat === game.winner);
  const finished = game.status === "finished";
  return (
    <li>
      <span className="name">
        <span className="row wrap small">
          {game.players.map((p, i) => (
            <span key={p.seat} className={p.seat === game.you ? "me" : ""}>
              <span className="swatch" style={{ background: SEAT_COLORS[i] }} /> {p.username}
              {game.scores && <span className="muted"> {game.scores[p.seat] ?? 0}</span>}
            </span>
          ))}
        </span>
        <span className="meta">
          {game.mapName} · {dateText(game.createdAt)} ·{" "}
          {finished
            ? game.winner === game.you
              ? "You won"
              : `${winner?.username ?? "?"} won`
            : "In progress"}
        </span>
      </span>
      <button className={finished ? "" : "primary"} onClick={() => go(`/game/${game.gameId}`)}>
        {finished ? "View" : "Rejoin"}
      </button>
    </li>
  );
}

export function GameHistory() {
  const socket = useSession((s) => s.socket);
  const [games, setGames] = useState<GameSummary[] | null>(null);

  useEffect(() => {
    if (!socket) return;
    let live = true;
    const load = async () => {
      const ack = await socket.emitWithAck("games:history", {});
      if (live && ack.ok) setGames(ack.games);
    };
    socket.on("connect", load);
    if (socket.connected) void load();
    return () => {
      live = false;
      socket.off("connect", load);
    };
  }, [socket]);

  if (!games) return null;
  return (
    <section className="card stack history">
      <h3>Your games</h3>
      {games.length === 0 ? (
        <p className="muted small">No games yet. Start one and send the link to your friends.</p>
      ) : (
        <ul className="people">
          {games.map((g) => (
            <GameRow key={g.gameId} game={g} />
          ))}
        </ul>
      )}
    </section>
  );
}
