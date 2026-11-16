# Deploy runbook

The web app is served by **Cloudflare Pages**. The game server, Postgres and Caddy (HTTPS) run
with Docker Compose on an **Oracle Cloud Ampere (ARM) VM**. Sign-in stays on **Supabase**. Why it
looks like this: `docs/features/012-deploy.md`.

```
browser ──https──▶ Cloudflare Pages (static app)
   │
   └──wss/https──▶ VM :443 Caddy ──▶ server:3000 ──▶ db:5432 (Postgres, volume)
```

You need: an Oracle Cloud account (Always Free), a Cloudflare account, the existing Supabase
project, Docker Desktop running on the Mac, and an SSH key (`~/.ssh/id_ed25519.pub`).

**Pick the server's HTTPS name (`API_DOMAIN`) first:**

- a hostname you own, e.g. `api.example.com`, with an A record to the VM's IP. On Cloudflare DNS,
  set it to **DNS only** (grey cloud) so Caddy can get its certificate; or
- no domain: `<ip-with-dashes>.sslip.io`, e.g. `140-238-1-2.sslip.io` for `140.238.1.2`. It
  resolves to that IP with nothing to set up.

---

## 1. Provision the VM

1. Oracle console → **Compute → Instances → Create instance**.
   - Image: **Canonical Ubuntu 24.04** (the aarch64 build is picked automatically for Ampere).
   - Shape: **VM.Standard.A1.Flex**, e.g. 2 OCPU / 12 GB (Always Free allows up to 4 / 24 in total).
   - Networking: a public subnet, **assign a public IPv4 address**.
   - SSH keys: paste your public key.
   - "Out of capacity" is common for A1; try another availability domain, or retry later.
2. Make the IP permanent with a reserved public IP: **instance → Attached VNICs → the VNIC → IPv4
   Addresses → ⋮ → Edit**, set "No public IP" and update, then edit again and pick "Reserved
   public IP → Create new". The address changes, so do this before the DNS record, or update the
   A record afterwards (the certificate is tied to the name, not the IP). An ephemeral IP is fine
   to start with: it survives stop/start and is lost only if unassigned or the instance is
   terminated.
3. Open the ports in Oracle's network: **instance → subnet → Security list → Add ingress rules**,
   source `0.0.0.0/0`: TCP **80**, TCP **443**, UDP **443** (HTTP/3, optional).
4. Open them on the VM too. Oracle's Ubuntu image rejects everything but SSH in iptables. The new
   rules must go above its `REJECT all … icmp-host-prohibited` rule, so find that rule's line
   number `<n>` first (it was 5 on the Ubuntu 24.04 image in November 2026). Chain names are
   case-sensitive: `INPUT`, not `input`.

   ```sh
   ssh ubuntu@<vm-ip>
   sudo iptables -L INPUT -n --line-numbers        # note the REJECT line's number <n>
   sudo iptables -I INPUT <n> -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT <n> -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo iptables -I INPUT <n> -m state --state NEW -p udp --dport 443 -j ACCEPT
   sudo iptables -L INPUT -n --line-numbers        # the ACCEPT rules now sit above REJECT
   sudo netfilter-persistent save
   sudo apt update && sudo apt -y upgrade
   ```

## 2. Install the server stack

On the VM:

```sh
curl -fsSL https://get.docker.com | sudo sh     # Docker Engine + the Compose plugin
sudo usermod -aG docker ubuntu                  # then log out and back in
docker compose version
mkdir -p ~/settlers/backups
```

If you use your own domain, add the A record for `API_DOMAIN` now (DNS only), so it resolves
before Caddy asks Let's Encrypt for a certificate.

## 3. Build and run the server

There are two ways to do this, using the same `deploy/compose.yaml`. **A** builds on the VM from
a clone of the repo: simplest when you're already SSH'd in. **B** builds on the Mac and ships the
image: no GitHub access needed on the VM.

### A. Build on the VM from a clone

The VM needs to read the repo, so push the branch you deploy from the Mac first. The repo is
public, so clone it over HTTPS:

```sh
sudo apt install -y git
git clone https://github.com/izak-l/settlers-online.git ~/settlers-online
```

(If the repo is ever made private, use a read-only deploy key instead: `ssh-keygen -t ed25519
-C settlers-vm -f ~/.ssh/github_deploy -N ""`, add the `.pub` under **repo → Settings → Deploy
keys** with write access off, add `Host github.com` / `IdentityFile ~/.ssh/github_deploy` /
`IdentitiesOnly yes` to `~/.ssh/config`, check with `ssh -T git@github.com`, and clone
`git@github.com:izak-l/settlers-online.git`.)

Then fill in `.env` and start the stack. The two `sed` lines write the known values, and the
password goes straight into the file without being shown:

```sh
cd ~/settlers-online/deploy
cp env.example .env && chmod 600 .env
sed -i "s|^API_DOMAIN=.*|API_DOMAIN=<API_DOMAIN>|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
nano .env                         # WEB_ORIGIN and SUPABASE_URL (below)
docker compose up -d --build      # builds the arm64 image here (a few minutes), starts db, server, caddy
docker compose logs -f server     # "migrated …" lines, then "Settlers server listening"
curl https://<API_DOMAIN>/health  # {"ok":true}; the first certificate can take a minute
```

`docker compose ps` should show `db` and `server` healthy, and `docker compose logs caddy` should
say "certificate obtained successfully". Caddy's "no account for configured email" lines on the
first start are info, not errors.

To update later: `cd ~/settlers-online && git pull && cd deploy && docker compose up -d --build`.

In this setup the stack lives in `~/settlers-online/deploy`, not `~/settlers`. Use that folder in
the commands below (logs, backups, restore).

### B. Build on the Mac and ship the image

From the repo on the Mac (Docker Desktop running):

```sh
scripts/deploy-server.sh ubuntu@<vm-ip>
```

The first run builds the image, loads it on the VM, copies `compose.yaml`, `Caddyfile` and
`env.example` to `~/settlers`, then stops because `.env` doesn't exist yet. On the VM:

```sh
cd ~/settlers
cp env.example .env && chmod 600 .env
nano .env
```

Then run `scripts/deploy-server.sh ubuntu@<vm-ip>` again. It starts the stack and ends by printing
`{"ok":true}` from `https://<API_DOMAIN>/health`.

### What goes in `.env`

- `API_DOMAIN`: from above.
- `POSTGRES_PASSWORD`: generate one with `openssl rand -hex 24`.
- `WEB_ORIGIN`: the Pages URL from step 4, e.g. `https://settlers-online.pages.dev`. Put the
  expected URL now; fix it after step 4 if the name was taken.
- `SUPABASE_URL`: the same value as in your local `.env`.

Migrations run automatically when the server starts.

## 4. Put the frontend on Cloudflare Pages

Once, on the Mac:

```sh
npx --yes wrangler@4 login
npx --yes wrangler@4 pages project create settlers-online --production-branch main --force
```

`--force` is needed on this one command. Since Wrangler 4.162, `pages project create` hands off
to Workers, whose app detection refuses to run at a monorepo root ("detection logic has been run
in the root of a workspace"). `--force` creates a classic Pages project instead. Once the
project exists, `pages deploy` goes straight to Pages, so the deploy script needs no flag.

If the name is taken, pick another; the site is `https://<name>.pages.dev`. Then, every time:

```sh
SERVER_URL=https://<API_DOMAIN> scripts/deploy-web.sh settlers-online
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` come from your local `.env`. Only those two and
`SERVER_URL` are built into the page. Wrangler ends by printing a per-deployment URL
(`https://<hash>.<name>.pages.dev`); players use `https://<name>.pages.dev`, which is the only
one allowed by `WEB_ORIGIN` and the Supabase redirect list.

To use a custom domain, add it in **Pages → your project → Custom domains**, then add it to
`WEB_ORIGIN` (comma-separated).

## 5. Connect everything and smoke-test

The stack folder is `~/settlers-online/deploy` with option A, `~/settlers` with option B.

1. **Server origin:** on the VM, make sure `WEB_ORIGIN` in the stack folder's `.env` matches the
   Pages URL exactly (scheme, no trailing slash), then `docker compose up -d` there. Check from
   the Mac: `curl -sI -H 'Origin: https://<name>.pages.dev'
   'https://<API_DOMAIN>/socket.io/?EIO=4&transport=polling'` echoes that origin in
   `access-control-allow-origin`.
2. **Supabase:** dashboard → **Authentication → URL Configuration**:
   - Site URL: `https://<name>.pages.dev`
   - Redirect URLs: add `https://<name>.pages.dev/**` (and any custom domain). Keep
     `http://localhost:5173/**` for local dev.

   Discord sign-in needs no change; its callback is Supabase's own URL.
3. **Email (required for email sign-up):** Supabase's built-in sender allows only a couple of
   emails per hour for the whole project, and its limit can't be raised; friends signing up hit
   "email rate limit exceeded" at once. Set up custom SMTP: e.g. with Resend, add your domain
   (or a subdomain like `mail.<domain>`) and its DNS records in Cloudflare, create a sending-only
   API key, then **Authentication → Emails → SMTP Settings**: host `smtp.resend.com`, port
   `465`, user `resend`, the API key as password, a sender on that domain. Then raise
   **Authentication → Rate Limits → emails per hour**. Until then, Discord sign-in works.
4. **Smoke test:**
   - Open the site, sign in, pick a username. The VM's database starts empty, so everyone picks
     a username once, even if they had one in local dev.
   - Create a lobby; open the invite link in a second browser (or a friend's) and join.
   - Play a few turns, using chat and a trade.
   - Restart the server mid-game: on the VM, `docker compose restart server` in the stack
     folder. `docker compose ps server` shows "Up N seconds"; both browsers reconnect without a
     refresh and the game continues where it was.

---

## Day to day

| Task | Command |
| --- | --- |
| Deploy a server change | A: on the VM, `cd ~/settlers-online && git pull && cd deploy && docker compose up -d --build`. B: `scripts/deploy-server.sh ubuntu@<vm-ip>` |
| Deploy a web change | `SERVER_URL=https://<API_DOMAIN> scripts/deploy-web.sh <project>` |
| Server logs | `ssh ubuntu@<vm-ip> 'cd ~/settlers && docker compose logs -f --tail 200 server'` |
| Status | `ssh ubuntu@<vm-ip> 'cd ~/settlers && docker compose ps'` |
| Restart the server | `ssh ubuntu@<vm-ip> 'cd ~/settlers && docker compose restart server'` |
| Change server settings | edit `~/settlers/.env`, then `docker compose up -d` |

If a change touches both, deploy the server first: protocol changes are usually additive.

**Roll back the server.** Each deploy keeps its image, tagged with the git commit:

```sh
docker images settlers-server
docker tag settlers-server:<older-tag> settlers-server:latest && docker compose up -d
```

Migrations only go forward. If a bad release ran a migration, restore the backup from before it
(below) along with the older image.

**Roll back the web app:** Cloudflare dashboard → Pages → Deployments → an older deployment →
"Rollback to this deployment".

## Backups

A nightly dump, keeping 14 days. On the VM, run `crontab -e` and add:

```cron
15 4 * * * cd ~/settlers && docker compose exec -T db pg_dump -U settlers settlers | gzip > backups/settlers-$(date +\%F).sql.gz && find backups -name '*.sql.gz' -mtime +14 -delete
```

Copy one off the VM now and then:

```sh
scp ubuntu@<vm-ip>:settlers/backups/settlers-<date>.sql.gz .
```

**Restore** (this replaces the database):

```sh
cd ~/settlers
docker compose stop server
docker compose exec -T db psql -U settlers -d postgres -c "drop database settlers" -c "create database settlers owner settlers"
gunzip -c backups/settlers-<date>.sql.gz | docker compose exec -T db psql -U settlers settlers
docker compose start server
```

## Troubleshooting

- **The health check fails right after a deploy:** `docker compose logs server caddy`.
  - "No sign-in configured": `SUPABASE_URL` is missing.
  - Caddy "challenge failed": port 80 isn't reachable (steps 1.3 and 1.4) or DNS doesn't point at
    the VM yet.
- **The site loads but says it can't reach the server:**
  - `SERVER_URL` in the web build must be `https://<API_DOMAIN>`.
  - `WEB_ORIGIN` on the server must be the exact Pages origin. A CORS error in the browser console
    means it doesn't match.
- **Sign-in sends you back to localhost:** add the Pages URL to Supabase's Site URL and redirect
  URLs (step 5.2).
- **"email rate limit exceeded" on sign-up:** Supabase's built-in sender; set up custom SMTP
  (step 5.3).
- **Sign-up says "check your email" but nothing arrives:** if the address already has an
  account (for example one created by Discord sign-in with the same email), Supabase reports
  success and sends nothing, so it doesn't reveal which emails are registered. Sign in with
  that account's method instead. Otherwise check spam and the **Logs → Auth** page.
- **`wrangler pages project create` fails with "run in the root of a workspace":** add
  `--force` (step 4).
