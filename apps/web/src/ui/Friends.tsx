import { useState } from "react";
import type { Friend, Presence } from "@settlers/protocol";
import { go } from "../app/route";
import { useSession } from "../app/session";
import { errorText } from "../game/seats";

export function presenceText(p: Presence): string {
  switch (p.state) {
    case "offline":
      return "Offline";
    case "online":
      return "Online";
    case "lobby":
      return "In a lobby";
    case "game":
      return p.playing ? "Playing" : "Watching a game";
  }
}

/** Join their lobby or watch their game, when that makes sense. */
function FriendAction({ friend }: { friend: Friend }) {
  const p = friend.presence;
  if (p.state === "lobby") return <button onClick={() => go(`/lobby/${p.lobbyId}`)}>Join</button>;
  if (p.state === "game" && p.playing)
    return <button onClick={() => go(`/game/${p.gameId}`)}>Watch</button>;
  return null;
}

export function Friends() {
  const { socket, friends } = useSession();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  if (!socket || !friends) return null;

  async function call(
    work: Promise<{ ok: boolean; code?: string; message?: string }>,
    success?: string,
  ) {
    const ack = await work;
    setMessage(
      ack.ok
        ? success
          ? { text: success, error: false }
          : null
        : { text: errorText(ack.code ?? "", ack.message ?? ""), error: true },
    );
    return ack.ok;
  }

  const sorted = [...friends.friends].sort(
    (a, b) => Number(a.presence.state === "offline") - Number(b.presence.state === "offline"),
  );

  return (
    <section className="card stack friends">
      <h3>Friends</h3>
      <form
        className="invite"
        onSubmit={(e) => {
          e.preventDefault();
          const username = name.trim();
          if (!username) return;
          void call(
            socket.emitWithAck("friends:request", { username }),
            `Request sent to ${username}.`,
          ).then((ok) => ok && setName(""));
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add by username"
          aria-label="Friend's username"
        />
        <button type="submit">Add</button>
      </form>
      {message && (
        <p className={message.error ? "error" : "notice"} role="status">
          {message.text}
        </p>
      )}

      {friends.incoming.length > 0 && (
        <ul className="people">
          {friends.incoming.map((u) => (
            <li key={u.userId}>
              <span className="name">
                {u.username} <span className="muted small">wants to be friends</span>
              </span>
              <span className="row">
                <button
                  className="primary"
                  onClick={() =>
                    void call(
                      socket.emitWithAck("friends:respond", { userId: u.userId, accept: true }),
                    )
                  }
                >
                  Accept
                </button>
                <button
                  onClick={() =>
                    void call(
                      socket.emitWithAck("friends:respond", { userId: u.userId, accept: false }),
                    )
                  }
                >
                  Decline
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {sorted.length === 0 ? (
        <p className="muted small">No friends yet. Add someone by their username.</p>
      ) : (
        <ul className="people">
          {sorted.map((f) => (
            <li key={f.userId}>
              <span className={`dot ${f.presence.state}`} aria-hidden />
              <span className="name">
                {f.username}
                <span className="meta">{presenceText(f.presence)}</span>
              </span>
              <span className="row">
                <FriendAction friend={f} />
                {removing === f.userId ? (
                  <>
                    <button
                      className="link small danger"
                      onClick={() => {
                        setRemoving(null);
                        void call(socket.emitWithAck("friends:remove", { userId: f.userId }));
                      }}
                    >
                      Remove {f.username}?
                    </button>
                    <button className="link small" onClick={() => setRemoving(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    className="link small"
                    aria-label={`Remove ${f.username}`}
                    onClick={() => setRemoving(f.userId)}
                  >
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {friends.outgoing.length > 0 && (
        <ul className="people">
          {friends.outgoing.map((u) => (
            <li key={u.userId}>
              <span className="name">
                {u.username} <span className="muted small">request sent</span>
              </span>
              <button
                className="link small"
                onClick={() =>
                  void call(socket.emitWithAck("friends:remove", { userId: u.userId }))
                }
              >
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
