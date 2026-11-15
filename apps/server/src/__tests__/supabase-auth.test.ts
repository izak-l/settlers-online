import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type KeyLike } from "jose";
import { supabaseAuthenticator } from "../auth";

/** A stand-in for a Supabase project: serves one ES256 public key at the real JWKS path. */
let server: Server;
let baseUrl: string;
let privateKey: KeyLike;
let otherKey: KeyLike;

beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair("ES256")).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "ES256", use: "sig" };
  server = createServer((req, res) => {
    if (req.url === "/auth/v1/.well-known/jwks.json") {
      res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ keys: [jwk] }));
    } else res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

function token(
  opts: { key?: KeyLike; iss?: string; aud?: string; exp?: string; sub?: string } = {},
) {
  const jwt = new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setIssuer(opts.iss ?? `${baseUrl}/auth/v1`)
    .setAudience(opts.aud ?? "authenticated")
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h");
  if (opts.sub !== "") jwt.setSubject(opts.sub ?? "3f1c-user-uuid");
  return jwt.sign(opts.key ?? privateKey);
}

describe("supabaseAuthenticator", () => {
  it("accepts a token signed by the project's key and returns the user id", async () => {
    const auth = supabaseAuthenticator({ url: baseUrl });
    expect(await auth.verify(await token())).toEqual({ userId: "3f1c-user-uuid" });
  });

  it("rejects a token signed by another key", async () => {
    const auth = supabaseAuthenticator({ url: baseUrl });
    expect(await auth.verify(await token({ key: otherKey }))).toBeNull();
  });

  it("rejects an expired token", async () => {
    const auth = supabaseAuthenticator({ url: baseUrl });
    expect(await auth.verify(await token({ exp: "-1m" }))).toBeNull();
  });

  it("rejects a token for another project or audience", async () => {
    const auth = supabaseAuthenticator({ url: baseUrl });
    expect(await auth.verify(await token({ iss: "https://other.supabase.co/auth/v1" }))).toBeNull();
    expect(await auth.verify(await token({ aud: "anon" }))).toBeNull();
  });

  it("rejects tokens without a subject, and garbage", async () => {
    const auth = supabaseAuthenticator({ url: baseUrl });
    expect(await auth.verify(await token({ sub: "" }))).toBeNull();
    expect(await auth.verify("dev:Ada")).toBeNull();
    expect(await auth.verify("")).toBeNull();
  });

  it("falls back to a shared HS256 secret for legacy projects", async () => {
    const secret = "legacy-shared-secret-at-least-32-bytes!!";
    const auth = supabaseAuthenticator({ url: baseUrl, jwtSecret: secret });
    const legacy = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(`${baseUrl}/auth/v1`)
      .setAudience("authenticated")
      .setSubject("legacy-user")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(secret));
    expect(await auth.verify(legacy)).toEqual({ userId: "legacy-user" });
  });
});
