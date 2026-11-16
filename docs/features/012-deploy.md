# 012 — Deploy: Cloudflare Pages + an Oracle ARM VM

## Goal

Friends play on a hosted site: the web app is served by Cloudflare Pages, and the game server and its Postgres database run on an Oracle Cloud "Always Free" Ampere (ARM) VM, behind HTTPS. A restart of the server or the VM loses nothing.

## Scope / non-scope

**Scope (the five steps; the runbook in `docs/DEPLOY.md` has the exact commands)**

1. **Provision the VM.** An Ampere A1 instance (arm64, Ubuntu 24.04) with a reserved public IP and SSH key access. Open TCP 80 and 443 in both the VCN security list and the VM's own iptables (Oracle's Ubuntu images block everything but SSH by default).
2. **Install the server stack.** Docker Engine and the Compose plugin; a stack folder (`~/settlers-online/deploy` in a clone, or `~/settlers`) holding `compose.yaml`, `Caddyfile` and `.env` (secrets, mode 600). Compose runs three services:
   - `db`: Postgres 16 with a named volume. The VM's disk persists, unlike free container hosts, so the database lives next to the server; Supabase is used for sign-in only.
   - `server`: our image, listening on 3000 inside the Compose network only.
   - `caddy`: the only public service (80/443). It gets a Let's Encrypt certificate for `API_DOMAIN` automatically and proxies HTTP and WebSocket traffic to the server.
3. **Build and run the server.** Either on the VM from a clone of the repo (`docker compose up -d --build` in `deploy/`; the repo is public, so it clones over HTTPS; a private repo would need a read-only deploy key), or `scripts/deploy-server.sh <ssh-host>`, which builds the image on the Mac (Apple Silicon is arm64, the same as the VM, so no cross-building), streams it to the VM with `docker save | ssh … docker load` (no registry or credentials), copies the Compose files, and restarts. Migrations run on server start, as today. The script ends by checking `/health` over HTTPS.
4. **Put the frontend on Cloudflare Pages.** `scripts/deploy-web.sh` builds the web app with the production `SERVER_URL`, `SUPABASE_URL` and `SUPABASE_ANON_KEY`, then uploads `apps/web/dist` with `wrangler pages deploy` (direct upload from the Mac; no Cloudflare build pipeline to configure tonight). The app uses hash routes, so no rewrite rules are needed.
5. **Connect it all and smoke-test.**
   - The server's `WEB_ORIGIN` is the Pages URL. It now accepts a comma-separated list, so a custom domain and `*.pages.dev` can both be allowed.
   - Supabase Auth: set the Site URL to the Pages URL and add it to the redirect URLs (email links and Discord return there).
   - Smoke test: sign in, create a lobby, play a few turns from two browsers, restart the server mid-game (`docker compose restart server`), and check the game resumes.

**`API_DOMAIN` (the server's HTTPS name).** Either a hostname you own, pointed at the VM's IP with an A record (on Cloudflare DNS, set it to DNS-only/grey so Caddy can get its certificate), or, with no domain, `<ip-with-dashes>.sslip.io` (a public DNS service that maps the name to that IP, so Let's Encrypt works without owning a domain).

**Non-scope**

- Building on Cloudflare's CI, image registries, CI/CD from GitHub, multiple server instances, monitoring beyond `/health` and `docker compose logs`, an admin page. Moving the existing hosted Supabase database's contents (it only holds test data).

## Rules

- Production never runs `AUTH_MODE=dev` (the server already refuses it with `NODE_ENV=production`).
- Secrets live only in the stack folder's `.env` on the VM and in the shell that runs `deploy-web.sh`. The web build only ever receives the three public values. Nothing secret is committed; `deploy/env.example` lists names only.
- Every action is still written to Postgres before it's broadcast, so a restart loses nothing (section 12).
- Nightly `pg_dump` backups to `~/settlers/backups` on the VM, keeping 14 days (cron line in the runbook).

## Engine changes

None.

## Server/UI changes

- `apps/server/build.mjs` (new): esbuild bundles the server and the workspace packages (which are TypeScript source) into one `dist/server.mjs` for Node 22. `pnpm --filter @settlers/server build` runs it. esbuild is already in the workspace (Vite and tsx use it), so this adds it as a server dev dependency at the same version; no new build-script approval is needed.
- `apps/server/src/db/migrate.ts`: the migrations folder can be set with `MIGRATIONS_DIR` (the bundled server lives somewhere else).
- `apps/server/src/config.ts`: `WEB_ORIGIN` accepts a comma-separated list.
- `Dockerfile` + `.dockerignore` (repo root): a multi-stage build (pnpm install, bundle) into a slim `node:22-alpine` runtime holding only `server.mjs` and `migrations/`. It runs as the `node` user, with a health check on `/health`.
- `deploy/compose.yaml`, `deploy/Caddyfile`, `deploy/env.example`.
- `scripts/deploy-server.sh`, `scripts/deploy-web.sh`.
- `docs/DEPLOY.md`: the runbook (first-time setup, redeploys, logs, backups and restore, rollback).
- DESIGN.md section 12 rewritten for this setup; `.env.example` and CLAUDE.md's environment table gain the production variables.

## Test plan

- Unit: `WEB_ORIGIN` list parsing; `MIGRATIONS_DIR` override.
- Build: `pnpm --filter @settlers/server build`, then run `node dist/server.mjs` against local Postgres and check `/health`, migrations and a dev-auth game from the web dev server.
- Image: `docker build` on the Mac (arm64); `docker compose up` locally with the deploy files (Caddy on `localhost`) and check `/health` plus a socket connection.
- Live (with you): the five steps above, ending with the smoke test.

## Open questions

- Resolved: `API_DOMAIN` is a subdomain of a domain on Cloudflare DNS (A record, DNS-only). `sslip.io` stays documented as the no-domain option.

## As built (first deploy, 2026-11-15)

- Server built on the VM from an HTTPS clone (option A). Option B (`scripts/deploy-server.sh`) is unchanged but hasn't been run against the VM yet.
- On the Ubuntu 24.04 image the iptables REJECT rule was line 5, not 6; the runbook now has you look up its number.
- Wrangler 4.162 hands `pages project create` to Workers, which refuses to run at a monorepo root. `--force` on that one command creates a classic Pages project; `pages deploy` then works unchanged.
- The public IP is still ephemeral; reserving it (and updating the A record) is a follow-up.
- Supabase's built-in email sender rate-limits sign-ups to a couple per hour, which friends hit straight away. Custom SMTP is now a required runbook step (5.3) and feedback #29; Discord sign-in is unaffected.
- The VM database started empty, so every player picks a username once.
- Smoke test passed: sign-in (Discord and email), lobby and invite, a multi-player game with chat and trades, and `docker compose restart server` mid-game with both browsers recovering. Playtest feedback is in `docs/FEEDBACK.md`.

## Status

Shipped
