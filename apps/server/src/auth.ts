export interface Identity {
  userId: string;
  /** Dev sign-in only: the username the token asked for. */
  devUsername?: string;
}

/** Turns a handshake token into an account, or null if it isn't valid. */
export interface Authenticator {
  verify(token: string): Promise<Identity | null>;
}

const DEV_TOKEN = /^dev:([A-Za-z0-9_]{3,20})$/;

/**
 * Dev sign-in: the token "dev:<username>" signs in as that username, no password.
 * Only enabled with AUTH_MODE=dev, which the config refuses in production.
 */
export const devAuthenticator: Authenticator = {
  async verify(token) {
    const m = DEV_TOKEN.exec(token);
    if (!m) return null;
    const username = m[1]!;
    return { userId: `dev:${username.toLowerCase()}`, devUsername: username };
  },
};

/** Try each authenticator in turn. */
export function anyOf(...auths: Authenticator[]): Authenticator {
  return {
    async verify(token) {
      for (const a of auths) {
        const id = await a.verify(token);
        if (id) return id;
      }
      return null;
    },
  };
}
