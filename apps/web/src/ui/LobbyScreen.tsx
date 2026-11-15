import { useEffect, useState } from "react";
import type { LobbyState } from "@settlers/protocol";
import { go } from "../app/route";
import { useSession } from "../app/session";
import { SEAT_COLORS, errorText } from "../game/seats";

export function LobbyScreen({ id }: { id: string }) {
  const { socket, me } = useSession();
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!socket) return;
    const onLobby = (l: LobbyState) => l.id === id && setLobby(l);
    const join = async () => {
      const ack = await socket.emitWithAck("lobby:join", { lobbyId: id });
      if (ack.ok) setLobby(ack.lobby);
      else setError(errorText(ack.code, ack.message));
    };
    socket.on("lobby", onLobby);
    socket.on("connect", join); // rejoin after a reconnect
    if (socket.connected) void join();
    return () => {
      socket.off("lobby", onLobby);
      socket.off("connect", join);
    };
  }, [socket, id]);

  // Once the host starts, everyone in the lobby moves to the game.
  useEffect(() => {
    if (lobby?.status === "started" && lobby.gameId) go(`/game/${lobby.gameId}`);
  }, [lobby?.status, lobby?.gameId]);

  if (error) {
    return (
      <div className="start card stack">
        <p className="error">{error}</p>
        <button onClick={() => go("/")}>Back home</button>
      </div>
    );
  }
  if (!lobby || !socket || !me) return <p className="center muted">Joining lobby…</p>;

  const mySeat = lobby.seats.findIndex((s) => s?.userId === me.id);
  const isHost = lobby.hostId === me.id;
  const allReady = lobby.seats.every((s) => s?.ready);
  const link = `${window.location.origin}${window.location.pathname}#/lobby/${lobby.id}`;

  async function call(promise: Promise<{ ok: boolean; code?: string; message?: string }>) {
    const ack = await promise;
    setError(null);
    if (!ack.ok) setError(errorText(ack.code ?? "", ack.message ?? ""));
  }

  return (
    <div className="start card stack lobby">
      <h1>Lobby</h1>
      <div className="invite">
        <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.target.select()} />
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(link).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <p className="muted">
        Send this link to your friends.{" "}
        {lobby.allowSpectators ? "Anyone with it can watch once the game starts." : ""}
      </p>

      <ol className="seats">
        {lobby.seats.map((s, i) => (
          <li key={i}>
            <span className="swatch" style={{ background: SEAT_COLORS[i] }} />
            {s ? (
              <>
                <span className="name">
                  {s.username}
                  {s.userId === lobby.hostId && <span className="muted"> (host)</span>}
                  {!s.connected && <span className="offline-tag">offline</span>}
                </span>
                <span className={s.ready ? "ready yes" : "ready"}>
                  {s.ready ? "Ready" : "Not ready"}
                </span>
              </>
            ) : (
              <>
                <span className="name muted">Empty seat</span>
                <button
                  onClick={() =>
                    void call(socket.emitWithAck("lobby:seat", { lobbyId: id, seat: i }))
                  }
                >
                  {mySeat >= 0 ? "Move here" : "Sit here"}
                </button>
              </>
            )}
          </li>
        ))}
      </ol>

      {mySeat >= 0 && (
        <div className="row">
          <button
            className={lobby.seats[mySeat]?.ready ? "" : "primary"}
            onClick={() =>
              void call(
                socket.emitWithAck("lobby:ready", {
                  lobbyId: id,
                  ready: !lobby.seats[mySeat]?.ready,
                }),
              )
            }
          >
            {lobby.seats[mySeat]?.ready ? "Not ready" : "I'm ready"}
          </button>
          <button
            className="link"
            onClick={() => void call(socket.emitWithAck("lobby:seat", { lobbyId: id, seat: null }))}
          >
            Leave seat
          </button>
        </div>
      )}
      {isHost && (
        <button
          className="primary"
          disabled={!allReady}
          onClick={() => void call(socket.emitWithAck("lobby:start", { lobbyId: id }))}
        >
          {allReady ? "Start game" : "Waiting for every seat to be filled and ready"}
        </button>
      )}
    </div>
  );
}
