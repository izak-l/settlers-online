import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

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

/**
 * Supabase sign-in: verify the access token the browser got from Supabase Auth.
 * Projects with signing keys publish their public keys at /auth/v1/.well-known/jwks.json;
 * legacy projects sign with a shared secret (SUPABASE_JWT_SECRET), tried as a fallback.
 */
export function supabaseAuthenticator(opts: { url: string; jwtSecret?: string }): Authenticator {
  const issuer = `${opts.url.replace(/\/$/, "")}/auth/v1`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const secret = opts.jwtSecret ? new TextEncoder().encode(opts.jwtSecret) : null;
  const checks = { issuer, audience: "authenticated" };

  const toIdentity = (payload: JWTPayload): Identity | null =>
    typeof payload.sub === "string" && payload.sub.length > 0 ? { userId: payload.sub } : null;

  return {
    async verify(token) {
      if (!token.includes(".")) return null; // not a JWT; don't bother fetching keys
      try {
        return toIdentity((await jwtVerify(token, jwks, checks)).payload);
      } catch {
        if (!secret) return null;
      }
      try {
        return toIdentity(
          (await jwtVerify(token, secret, { ...checks, algorithms: ["HS256"] })).payload,
        );
      } catch {
        return null;
      }
    },
  };
}
