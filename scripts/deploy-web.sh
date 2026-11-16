#!/usr/bin/env bash
# Build the web app for production and upload it to Cloudflare Pages. See docs/DEPLOY.md.
#
#   SERVER_URL=https://<API_DOMAIN> scripts/deploy-web.sh [pages-project-name]
#
# SUPABASE_URL and SUPABASE_ANON_KEY come from the environment or the repo's .env (Vite reads
# it); only those two and SERVER_URL are built into the page (apps/web/vite.config.ts).
set -euo pipefail

PROJECT=${1:-settlers-online}
cd "$(dirname "$0")/.."

: "${SERVER_URL:?set SERVER_URL to the game server, e.g. https://api.example.com}"
case "$SERVER_URL" in
  https://*) ;;
  *) echo "SERVER_URL must start with https:// (the page is served over HTTPS)" >&2; exit 1 ;;
esac

echo "==> Building the web app against $SERVER_URL"
rm -rf apps/web/dist
SERVER_URL="$SERVER_URL" pnpm --filter @settlers/web build

if ! grep -rqF "$SERVER_URL" apps/web/dist/assets; then
  echo "The build doesn't contain SERVER_URL; refusing to deploy." >&2
  exit 1
fi

echo "==> Uploading apps/web/dist to Cloudflare Pages project '$PROJECT'"
npx --yes wrangler@4 pages deploy apps/web/dist --project-name "$PROJECT" --branch main
