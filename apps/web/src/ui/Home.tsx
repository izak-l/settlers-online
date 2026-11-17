import { useState } from "react";
import { GAME_TYPES, type GameType } from "@settlers/maps";
import { go } from "../app/route";
import { useSession } from "../app/session";
import { errorText } from "../game/seats";
import { Friends } from "./Friends";
import { GameHistory } from "./GameHistory";
import { GameTypePicker } from "./GamePicker";

/** Accept a full invite link or just the lobby id. */
function lobbyIdFrom(input: string): string {
  const m = /lobby\/([A-Za-z0-9_-]+)/.exec(input);
  return (m ? m[1]! : input).trim();
}

export function Home() {
  const { socket, me } = useSession();
  const [type, setType] = useState<GameType>(GAME_TYPES[0]!);
  const [invite, setInvite] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!socket) return;
    // Players, points, timer and spectators are lobby settings (spec 229).
    const ack = await socket.emitWithAck("lobby:create", { gameType: type.id });
    if (ack.ok) go(`/lobby/${ack.lobby.id}`);
    else setError(errorText(ack.code, ack.message));
  }

  return (
    <div className="home">
      <div className="card stack">
        <h1>Hi, {me?.username}</h1>
        <section className="stack">
          <h3>New game</h3>
          <GameTypePicker value={type.id} onChange={setType} />
          <p className="muted small">Pick the map, players and other settings in the lobby.</p>
          <button className="primary" onClick={() => void create()}>
            Create game and get invite link
          </button>
        </section>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            const id = lobbyIdFrom(invite);
            if (id) go(`/lobby/${id}`);
          }}
        >
          <h3>Join a friend</h3>
          <label className="field">
            <span>Invite link or code</span>
            <input
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder="Paste the link"
            />
          </label>
          <button type="submit">Join</button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <Friends />
      <GameHistory />
    </div>
  );
}
