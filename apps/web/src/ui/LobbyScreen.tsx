import { useEffect, useState } from "react";
import { findGameType } from "@settlers/maps";
import type { LobbyState } from "@settlers/protocol";
import { go } from "../app/route";
import { useSession } from "../app/session";
import { SEAT_COLORS, errorText } from "../game/seats";
import { GameSummary, GameTypePicker, MapChooser, type GameChoice } from "./GamePicker";
import { LobbySettings } from "./LobbySettings";
import { settingsOf, settingsSummary } from "./lobbySettingsModel";

type Ack = { ok: boolean; code?: string; message?: string };

/**
 * The game this lobby will play (spec 023): everyone sees the summary; the host picks the game
 * type, then a map or scenario, and the settings, while the lobby is open.
 */
function LobbyGame({
  lobby,
  isHost,
  call,
}: {
  lobby: LobbyState;
  isHost: boolean;
  call: (promise: Promise<Ack>) => Promise<void>;
}) {
  const { socket } = useSession();
  const [busy, setBusy] = useState(false);
  const type = findGameType(lobby.gameType);
  if (!socket || !type) return null;
  const choice: GameChoice = lobby.map.scenario
    ? { scenario: lobby.map.scenario.id, setup: lobby.map.scenario.setup }
    : { builtin: lobby.map.id };
  const editable = isHost && lobby.status === "open";
  const seated = lobby.seats.filter((s) => s !== null).length;
  const send = (promise: Promise<Ack>) => {
    setBusy(true);
    void call(promise).finally(() => setBusy(false));
  };

  return (
    <section className="card stack lobby-game">
      <h2>Game</h2>
      <GameSummary type={type} choice={choice} facts={settingsSummary(settingsOf(lobby))} />
      <LobbySettings
        lobby={lobby}
        editable={editable}
        disabled={busy}
        onChange={(settings) =>
          send(socket.emitWithAck("lobby:settings", { lobbyId: lobby.id, ...settings }))
        }
      />
      {editable && (
        <>
          <GameTypePicker
            value={type.id}
            seated={seated}
            disabled={busy}
            onChange={(t) =>
              t.id !== type.id &&
              send(socket.emitWithAck("lobby:type", { lobbyId: lobby.id, gameType: t.id }))
            }
          />
          <MapChooser
            key={type.id}
            type={type}
            choice={choice}
            disabled={busy}
            onChoose={(map) => send(socket.emitWithAck("lobby:map", { lobbyId: lobby.id, map }))}
          />
        </>
      )}
      {editable && (
        <p className="muted small">
          Changing the game, map or settings asks everyone to ready up again. A new map brings back
          its default players, points and discard limit.
        </p>
      )}
    </section>
  );
}

/** Online friends who aren't seated here yet, each with an Invite button. */
function InviteFriends({ lobby }: { lobby: LobbyState }) {
  const { socket, friends } = useSession();
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  if (!socket || !friends || lobby.status !== "open") return null;
  const seated = new Set(lobby.seats.flatMap((s) => (s ? [s.userId] : [])));
  const online = friends.friends.filter(
    (f) => f.presence.state !== "offline" && !seated.has(f.userId),
  );
  if (online.length === 0 && friends.friends.length === 0) return null;

  async function invite(userId: string) {
    const ack = await socket!.emitWithAck("lobby:invite", { lobbyId: lobby.id, userId });
    if (ack.ok) setSent((s) => new Set(s).add(userId));
    setError(ack.ok ? null : errorText(ack.code, ack.message));
  }

  return (
    <section className="card stack">
      <h2>Invite friends</h2>
      {online.length === 0 ? (
        <p className="muted small">None of your friends are online.</p>
      ) : (
        <ul className="people">
          {online.map((f) => (
            <li key={f.userId}>
              <span className="dot online" aria-hidden />
              <span className="name">{f.username}</span>
              <button disabled={sent.has(f.userId)} onClick={() => void invite(f.userId)}>
                {sent.has(f.userId) ? "Invited" : "Invite"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

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
      if (socket.connected) void socket.emitWithAck("lobby:leave", { lobbyId: id });
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

  async function call(promise: Promise<Ack>) {
    const ack = await promise;
    setError(null);
    if (!ack.ok) setError(errorText(ack.code ?? "", ack.message ?? ""));
  }

  return (
    <div className="lobby-page">
      <header className="card stack lobby-head">
        <h1>Lobby</h1>
        <div className="invite">
          <input
            readOnly
            value={link}
            aria-label="Invite link"
            onFocus={(e) => e.target.select()}
          />
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <p className="muted small">
          Send this link to your friends.{" "}
          {lobby.allowSpectators ? "Anyone with it can watch once the game starts." : ""}
          {lobby.turnSeconds > 0 &&
            ` Turn timer: ${lobby.turnSeconds} seconds per turn, 30 seconds to discard; when time runs out, a default move is made.`}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </header>

      <div className="lobby-grid">
        <LobbyGame lobby={lobby} isHost={isHost} call={call} />

        <div className="stack lobby-side">
          <section className="card stack">
            <h2>Players</h2>
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
                  onClick={() =>
                    void call(socket.emitWithAck("lobby:seat", { lobbyId: id, seat: null }))
                  }
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
          </section>
          <InviteFriends lobby={lobby} />
        </div>
      </div>
    </div>
  );
}
