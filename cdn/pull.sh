#!/bin/bash
# mymobile.pk CDN: pull latest code, build, reload PM2.
# Run from the site root: /home/mymobile-cdnlive/htdocs/cdnlive.mymobile.pk
#   bash pull.sh
set -e
SITE_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SITE_DIR"

echo "=== Pulling CDN from GitHub ==="
if ! git -C .deploy-source pull origin main; then
  echo "!!! git pull failed. Nothing was copied."
  exit 1
fi

echo "=== Syncing .deploy-source/cdn → site root ==="
rsync -a --delete \
  --exclude='.deploy-source/' \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='uploads/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='logs/' \
  .deploy-source/cdn/ ./

[ -f .env ] || { echo "!!! .env missing. Copy deploy/live/cdn/.env here first."; exit 1; }

echo "=== npm install + build ==="
npm install --no-audit --no-fund
npm run build
mkdir -p logs

pm2 startOrReload ecosystem.config.js --update-env
pm2 save >/dev/null 2>&1 || true
echo "=== CDN deployed ==="
