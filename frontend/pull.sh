#!/bin/bash
# mymobile.pk storefront (Next.js): pull latest code, build, reload PM2.
# Site root: /home/mymobilepk/htdocs/mymobile.pk
# First time: put this file + .env in the site root, then  ./pull.sh
set -e
APP_DIR="frontend"
SITE_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SITE_DIR"

# Safety: this folder still holds the PHP site. rsync --delete would wipe it
# (including images/ that the CDN copy needs). Refuse unless asked explicitly.
if [ -f index.php ] || [ -f router.php ]; then
  if [ "${REPLACE_PHP:-}" != "yes" ]; then
    echo "!!! The PHP site is still in $SITE_DIR."
    echo "    Back it up first, e.g.:  cp -a $SITE_DIR ${SITE_DIR}-php-backup"
    echo "    then run:                REPLACE_PHP=yes ./pull.sh"
    exit 1
  fi
fi

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

[ -f .env ] || { echo "!!! .env missing. Paste deploy/live/frontend/.env into $SITE_DIR/.env first."; exit 1; }

echo "=== Syncing .deploy-source/frontend → site root ==="
rsync -a --delete   --exclude='.deploy-source/'   --exclude='.git/'   --exclude='.env'   --exclude='node_modules/'   --exclude='.next/'   --exclude='logs/'   .deploy-source/frontend/ ./

chmod +x pull.sh deploy-storefront.sh
./deploy-storefront.sh
