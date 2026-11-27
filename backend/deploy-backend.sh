#!/bin/bash
# mymobile.pk API: build in a temp dir, prepare DB, swap, reload PM2.
# Called by pull.sh (cwd = site root).
set -e
APP_NAME="mymobile-api"
ACTIVE_DIR="$(pwd)"
BUILD_DIR="${ACTIVE_DIR}_build_temp"

if [ ! -f "$ACTIVE_DIR/.env" ]; then
  echo "!!! $ACTIVE_DIR/.env is missing. Copy deploy/live/api/.env there first."
  exit 1
fi

echo "[1/6] Copying source to $BUILD_DIR"
mkdir -p "$BUILD_DIR"
rsync -a --delete --exclude='.git' --exclude='.deploy-source' --exclude='.medusa' \
  --exclude='node_modules' --exclude='logs' "$ACTIVE_DIR/" "$BUILD_DIR/"
if [ -d "$ACTIVE_DIR/node_modules" ]; then
  rsync -a --delete "$ACTIVE_DIR/node_modules/" "$BUILD_DIR/node_modules/"
fi

cd "$BUILD_DIR"
echo "[2/6] npm install"
npm install --no-audit --no-fund

# Read one value from the site .env (quotes stripped).
env_get() {
  grep -E "^$1=" "$ACTIVE_DIR/.env" | tail -n 1 | cut -d= -f2- | tr -d '\r' | sed -E "s/^\"(.*)\"$/\1/; s/^'(.*)'$/\1/"
}

MARKER="$ACTIVE_DIR/.db-bootstrapped"
if [ ! -f "$MARKER" ] && [ -f db/bootstrap.cjs ]; then
  echo "[3/6] FIRST DEPLOY: create database + restore the local copy (one time only)"
  node db/bootstrap.cjs

  ADMIN_EMAIL="$(env_get MM_ADMIN_EMAIL)"
  ADMIN_PASS="$(env_get MM_ADMIN_PASSWORD)"
  if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASS" ]; then
    echo "      creating admin login $ADMIN_EMAIL"
    npx medusa user -e "$ADMIN_EMAIL" -p "$ADMIN_PASS" || echo "      WARN: admin not created (it may already exist)"
  fi

  # One-time job done: remove the bootstrap scripts + database copy from the
  # server, and the one-time secrets from .env. pull.sh skips db/ from now on.
  rm -rf "$ACTIVE_DIR/db" "$BUILD_DIR/db"
  sed -i -E '/^(MM_ADMIN_EMAIL|MM_ADMIN_PASSWORD|PG_ADMIN_URL)=/d' "$ACTIVE_DIR/.env" "$BUILD_DIR/.env"
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$MARKER"
  echo "      bootstrap finished, db/ removed, one-time .env lines removed"
else
  echo "[3/6] Database already bootstrapped ($(cat "$MARKER" 2>/dev/null || echo 'no db/ folder'))"
fi
npx medusa db:migrate

echo "[4/6] medusa build"
export NODE_OPTIONS="--max-old-space-size=1536"
npm run build

echo "[5/6] Swapping build into $ACTIVE_DIR"
cd "$ACTIVE_DIR"
mkdir -p logs .medusa
rsync -a --delete "$BUILD_DIR/node_modules/" "$ACTIVE_DIR/node_modules/"
[ -d .medusa/server ] && mv .medusa/server .medusa/server_old
mv "$BUILD_DIR/.medusa/server" .medusa/server
# Admin UI (served at /app): medusa start looks for ./public/admin
if [ -d .medusa/server/public/admin ]; then
  mkdir -p public
  rsync -a --delete .medusa/server/public/admin/ public/admin/
fi

echo "[6/6] PM2 reload"
pm2 startOrReload ecosystem.config.js --update-env
pm2 save >/dev/null 2>&1 || true

rm -rf .medusa/server_old "$BUILD_DIR"
echo "=== $APP_NAME deployed ==="
