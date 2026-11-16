import { useState } from "react";
import { TURN_SECONDS_CHOICES } from "@settlers/protocol";
import { go } from "../app/route";
import { useSession } from "../app/session";
import { errorText } from "../game/seats";
import { Friends } from "./Friends";
import { GameHistory } from "./GameHistory";

/** Accept a full invite link or just the lobby id. */
function lobbyIdFrom(input: string): string {
  const m = /lobby\/([A-Za-z0-9_-]+)/.exec(input);
  return (m ? m[1]! : input).trim();
}

export function Home() {
  const { socket, me } = useSession();
  const [seats, setSeats] = useState<3 | 4>(4);
  const [spectators, setSpectators] = useState(true);
  const [turnSeconds, setTurnSeconds] = useState<(typeof TURN_SECONDS_CHOICES)[number]>(0);
  const [invite, setInvite] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!socket) return;
    const ack = await socket.emitWithAck("lobby:create", {
      maxSeats: seats,
      allowSpectators: spectators,
      turnSeconds,
    });
    if (ack.ok) go(`/lobby/${ack.lobby.id}`);
    else setError(errorText(ack.code, ack.message));
  }

  return (
    <div className="home">
      <div className="card stack">
        <h1>Hi, {me?.username}</h1>
        <section className="stack">
          <h3>New game</h3>
          <fieldset className="count">
            <legend>Players</legend>
            {([3, 4] as const).map((n) => (
              <label key={n}>
                <input
                  type="radio"
                  name="seats"
                  checked={seats === n}
                  onChange={() => setSeats(n)}
                />
                {n}
              </label>
            ))}
          </fieldset>
          <label className="field">
            <span>Turn timer</span>
            <select
              value={turnSeconds}
              onChange={(e) =>
                setTurnSeconds(Number(e.target.value) as (typeof TURN_SECONDS_CHOICES)[number])
              }
            >
              {TURN_SECONDS_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "Off" : `${n} seconds per turn`}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={spectators}
              onChange={(e) => setSpectators(e.target.checked)}
            />
            Allow spectators
          </label>
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
