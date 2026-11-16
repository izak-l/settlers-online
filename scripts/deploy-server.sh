#!/usr/bin/env bash
# Build the server image here (arm64, same as the Oracle Ampere VM), ship it over SSH, and
# restart the stack in ~/settlers on the VM. See docs/DEPLOY.md.
#
#   scripts/deploy-server.sh ubuntu@<vm-ip>
set -euo pipefail

TARGET=${1:?usage: scripts/deploy-server.sh user@host}
cd "$(dirname "$0")/.."

TAG=$(git rev-parse --short HEAD)
if [ -n "$(git status --porcelain)" ]; then TAG="$TAG-dirty"; fi

echo "==> Building settlers-server:$TAG (linux/arm64)"
docker build --platform linux/arm64 -t "settlers-server:$TAG" .

echo "==> Shipping the image to $TARGET"
docker save "settlers-server:$TAG" | gzip | ssh "$TARGET" 'gunzip | docker load'

echo "==> Copying the stack files"
ssh "$TARGET" 'mkdir -p ~/settlers'
scp deploy/compose.yaml deploy/Caddyfile deploy/env.example "$TARGET":settlers/

echo "==> Starting settlers-server:$TAG"
# shellcheck disable=SC2087 # $TAG is meant to expand here, locally.
ssh "$TARGET" bash -s <<REMOTE
set -euo pipefail
cd ~/settlers
if [ ! -f .env ]; then
  echo "~/settlers/.env is missing: cp env.example .env, fill it in, chmod 600 .env, then rerun." >&2
  exit 1
fi
docker tag "settlers-server:$TAG" settlers-server:latest
docker compose up -d --remove-orphans
docker image prune -f > /dev/null
REMOTE

DOMAIN=$(ssh "$TARGET" "grep -E '^API_DOMAIN=' ~/settlers/.env | cut -d= -f2-")
echo "==> Waiting for https://$DOMAIN/health"
for _ in $(seq 1 30); do
  if curl -fsS "https://$DOMAIN/health"; then
    echo
    echo "==> Deployed settlers-server:$TAG"
    exit 0
  fi
  sleep 3
done
echo "Health check failed. Look at: ssh $TARGET 'cd ~/settlers && docker compose logs --tail 100'" >&2
exit 1
