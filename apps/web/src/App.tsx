import { useEffect } from "react";
import { go, useRoute } from "./app/route";
import { useSession } from "./app/session";
import { DevSandbox } from "./ui/DevSandbox";
import { Home } from "./ui/Home";
import { LobbyScreen } from "./ui/LobbyScreen";
import { OnlineGame } from "./ui/OnlineGame";
import { PickUsername } from "./ui/PickUsername";
import { SignIn } from "./ui/SignIn";
import { SoundToggle } from "./ui/SoundToggle";
import { Toasts } from "./ui/Toasts";

const STATUS_TEXT = {
  connecting: "Connecting…",
  offline: "Connection lost. Reconnecting…",
} as const;

export function App() {
  const route = useRoute();
  const { status, me, error, start, signOut } = useSession();
  useEffect(() => start(), [start]);

  if (route.name === "sandbox" && import.meta.env.DEV) {
    return (
      <Shell badge="Dev sandbox">
        <DevSandbox />
      </Shell>
    );
  }

  let body: React.ReactNode;
  if (status === "loading") body = <p className="center muted">Loading…</p>;
  else if (status === "signedOut") body = <SignIn />;
  else if (status === "error") {
    body = (
      <div className="start card stack">
        <p className="error">{error ?? "Couldn't reach the game server."}</p>
        <button onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  } else if (!me)
    body = (
      <p className="center muted">
        {STATUS_TEXT[status as keyof typeof STATUS_TEXT] ?? "Connecting…"}
      </p>
    );
  else if (!me.username) body = <PickUsername />;
  else if (route.name === "lobby") body = <LobbyScreen id={route.id} />;
  else if (route.name === "game") body = <OnlineGame key={route.id} id={route.id} />;
  else body = <Home />;

  return (
    <Shell
      {...(status === "offline" ? { banner: STATUS_TEXT.offline } : {})}
      {...(me ? { user: me.username ?? "", onSignOut: () => void signOut() } : {})}
    >
      {body}
    </Shell>
  );
}

function Shell(props: {
  children: React.ReactNode;
  badge?: string;
  banner?: string;
  user?: string;
  onSignOut?: () => void;
}) {
  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => go("/")}>
          Settlers Online
        </button>
        {props.badge && <span className="badge">{props.badge}</span>}
        <SoundToggle />
        {props.user !== undefined && (
          <span className="user">
            {props.user}
            <button className="link" onClick={props.onSignOut}>
              Sign out
            </button>
          </span>
        )}
      </header>
      {props.banner && (
        <p className="banner" role="status">
          {props.banner}
        </p>
      )}
      {props.children}
      <Toasts />
    </div>
  );
}
