import { go } from "../app/route";
import { useSession } from "../app/session";

/** Lobby invites from friends, shown on every screen until joined or dismissed. */
export function Toasts() {
  const { invites, dismissInvite } = useSession();
  if (invites.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {invites.map((i) => (
        <div key={i.lobbyId} className="toast">
          <span>
            <strong>{i.from.username}</strong> invited you to a game.
          </span>
          <span className="row">
            <button
              className="primary"
              onClick={() => {
                dismissInvite(i.lobbyId);
                go(`/lobby/${i.lobbyId}`);
              }}
            >
              Join
            </button>
            <button className="link" onClick={() => dismissInvite(i.lobbyId)}>
              Dismiss
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
