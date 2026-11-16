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
2. Make the IP permanent: **Networking → IP management → Reserved public IPs**. Reserve one and
   attach it to the instance's VNIC (or convert the ephemeral one), so it never changes.
3. Open the ports in Oracle's network: **instance → subnet → Security list → Add ingress rules**,
   source `0.0.0.0/0`: TCP **80**, TCP **443**, UDP **443** (HTTP/3, optional).
4. Open them on the VM too. Oracle's Ubuntu image rejects everything but SSH in iptables:

   ```sh
   ssh ubuntu@<vm-ip>
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 443 -j ACCEPT
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

## 3. Build and ship the server

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

Fill in:

- `API_DOMAIN`, from above.
- `POSTGRES_PASSWORD`: generate one with `openssl rand -hex 24`.
- `WEB_ORIGIN`: the Pages URL from step 4, e.g. `https://settlers-online.pages.dev`. Put the
  expected URL now; fix it after step 4 if the name was taken.
- `SUPABASE_URL`: the same value as in your local `.env`.

Run `scripts/deploy-server.sh ubuntu@<vm-ip>` again. It starts the stack (migrations run
automatically when the server starts) and ends by printing `{"ok":true}` from
`https://<API_DOMAIN>/health`. The first certificate can take up to a minute.

## 4. Put the frontend on Cloudflare Pages

Once, on the Mac:

```sh
npx --yes wrangler@4 login
npx --yes wrangler@4 pages project create settlers-online --production-branch main
```

If the name is taken, pick another; the site is `https://<name>.pages.dev`. Then, every time:

```sh
SERVER_URL=https://<API_DOMAIN> scripts/deploy-web.sh settlers-online
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` come from your local `.env`. Only those two and
`SERVER_URL` are built into the page.

To use a custom domain, add it in **Pages → your project → Custom domains**, then add it to
`WEB_ORIGIN` (comma-separated).

## 5. Connect everything and smoke-test

1. **Server origin:** on the VM, make sure `WEB_ORIGIN` in `~/settlers/.env` matches the Pages
   URL exactly (scheme, no trailing slash), then `cd ~/settlers && docker compose up -d`.
2. **Supabase:** dashboard → **Authentication → URL Configuration**:
   - Site URL: `https://<name>.pages.dev`
   - Redirect URLs: add `https://<name>.pages.dev/**` (and any custom domain).

   Discord sign-in needs no change; its callback is Supabase's own URL. Before inviting many
   friends, set up custom SMTP (Supabase's built-in email sender is rate-limited).
3. **Smoke test:**
   - Open the site, sign in, pick a username.
   - Create a lobby; open the invite link in a second browser (or a friend's) and join.
   - Play a few turns, using chat and a trade.
   - Restart the server mid-game: `ssh ubuntu@<vm-ip> 'cd ~/settlers && docker compose restart server'`.
     Both browsers should reconnect and the game should continue where it was.

---

## Day to day

| Task | Command |
| --- | --- |
| Deploy a server change | `scripts/deploy-server.sh ubuntu@<vm-ip>` |
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
