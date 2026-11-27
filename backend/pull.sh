#!/bin/bash
# mymobile.pk API: pull latest code and deploy.
# Run from the site root: /home/mymobile-api/htdocs/api.mymobile.pk
#   bash pull.sh
set -e
SITE_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SITE_DIR"

echo "=== Pulling backend from GitHub ==="
if ! git -C .deploy-source pull origin main; then
  echo "!!! git pull failed. Nothing was copied, the live API keeps running."
  exit 1
fi

echo "=== Syncing .deploy-source/backend → site root ==="
# After the first deploy the DB bootstrap (db/) is never copied again.
SKIP_DB=()
[ -f .db-bootstrapped ] && SKIP_DB=(--exclude='db/')
rsync -a --delete "${SKIP_DB[@]}" \
  --exclude='.db-bootstrapped' \
  --exclude='.deploy-source/' \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='node_modules/' \
  --exclude='.medusa/' \
  --exclude='public/admin/' \
  --exclude='logs/' \
  .deploy-source/backend/ ./

bash ./deploy-backend.sh
