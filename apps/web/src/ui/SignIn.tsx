import { useState } from "react";
import { devAuthEnabled, supabase } from "../net/auth";
import { rememberRoute, useSession } from "../app/session";

export function SignIn() {
  const { signInDev, error: sessionError } = useSession();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [devName, setDevName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(sessionError);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const res =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin },
          });
    setBusy(false);
    if (res.error) setError(res.error.message);
    else if (mode === "signup" && !res.data.session)
      setMessage("Check your email to confirm your account, then sign in.");
  }

  async function discord() {
    if (!supabase) return;
    rememberRoute();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (err) setError(err.message);
  }

  return (
    <div className="start card">
      <h1>Settlers Online</h1>
      {supabase ? (
        <>
          <button className="discord" onClick={() => void discord()}>
            Continue with Discord
          </button>
          <div className="divider">
            <span>or with email</span>
          </div>
          <form className="stack" onSubmit={(e) => void submit(e)}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button type="submit" className="primary" disabled={busy}>
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
          <button className="link" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
        </>
      ) : (
        <p className="muted">Sign-in isn't configured: set SUPABASE_URL and SUPABASE_ANON_KEY.</p>
      )}
      {message && <p className="notice">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {devAuthEnabled && (
        <form
          className="stack dev-signin"
          onSubmit={(e) => {
            e.preventDefault();
            if (devName.trim()) signInDev(devName.trim());
          }}
        >
          <h3>Dev sign-in (this tab only)</h3>
          <label className="field">
            <span>Username</span>
            <input
              value={devName}
              pattern="[A-Za-z0-9_]{3,20}"
              placeholder="Ada"
              onChange={(e) => setDevName(e.target.value)}
            />
          </label>
          <button type="submit">Sign in as {devName.trim() || "…"}</button>
        </form>
      )}
    </div>
  );
}
