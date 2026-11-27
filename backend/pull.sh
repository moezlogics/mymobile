#!/bin/bash
# mymobile.pk API: pull latest code and deploy.
# Site root: /home/mymobile-api/htdocs/api.mymobile.pk
# First time: put this file + .env in the site root, then  ./pull.sh
set -e
APP_DIR="backend"
SITE_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SITE_DIR"

REPO_URL="https://github.com/moezlogics/mymobile.git"
BRANCH="main"

# First run: clone the repo into .deploy-source (only APP_DIR is checked out).
# Private repo: git asks for your GitHub username + personal access token
# (or uses the credential helper / SSH setup already on the server).
if [ ! -d .deploy-source/.git ]; then
  echo "=== First run: cloning $REPO_URL ($APP_DIR only) ==="
  rm -rf .deploy-source
  if ! { git clone --filter=blob:none --sparse --branch "$BRANCH" "$REPO_URL" .deploy-source \
         && git -C .deploy-source sparse-checkout set "$APP_DIR"; }; then
    echo "    sparse clone not supported, doing a normal clone"
    rm -rf .deploy-source
    git clone --branch "$BRANCH" "$REPO_URL" .deploy-source
  fi
fi

echo "=== Pulling $APP_DIR from GitHub ==="
if ! git -C .deploy-source pull origin "$BRANCH"; then
  echo "!!! git pull failed. Nothing was copied, the live site keeps running."
  exit 1
fi
[ -d ".deploy-source/$APP_DIR" ] || { echo "!!! .deploy-source/$APP_DIR not found"; exit 1; }

[ -f .env ] || { echo "!!! .env missing. Paste deploy/live/api/.env into $SITE_DIR/.env first."; exit 1; }

echo "=== Syncing .deploy-source/backend → site root ==="
# After the first deploy the DB bootstrap (db/) is never copied again.
SKIP_DB=()
[ -f .db-bootstrapped ] && SKIP_DB=(--exclude='db/')
rsync -a --delete "${SKIP_DB[@]}"   --exclude='.db-bootstrapped'   --exclude='.deploy-source/'   --exclude='.git/'   --exclude='.env'   --exclude='node_modules/'   --exclude='.medusa/'   --exclude='public/admin/'   --exclude='logs/'   .deploy-source/backend/ ./

chmod +x pull.sh deploy-backend.sh
./deploy-backend.sh
