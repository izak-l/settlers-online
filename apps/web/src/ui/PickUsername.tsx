import { useState } from "react";
import { useSession } from "../app/session";

export function PickUsername() {
  const setUsername = useSession((s) => s.setUsername);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(await setUsername(name.trim()));
  }

  return (
    <form className="start card stack" onSubmit={(e) => void submit(e)}>
      <h1>Pick a username</h1>
      <p className="muted">
        This is what your friends will see. 3–20 letters, digits or underscores.
      </p>
      <label className="field">
        <span>Username</span>
        <input
          autoFocus
          required
          pattern="[A-Za-z0-9_]{3,20}"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button type="submit" className="primary">
        Continue
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
