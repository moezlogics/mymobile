#!/usr/bin/env node
/**
 * Writes the live .env files for the three mymobile.pk sites into
 * deploy/live/{api,cdn,frontend}/.env (gitignored), re-using the secrets of
 * the local backend/frontend/cdn .env files (same DB password, JWT/cookie
 * secrets, CDN key, revalidate secret, publishable key).
 *
 *   node deploy/make-live-env.cjs
 *
 * Copy each file to the matching site root on the server as `.env`.
 */
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const { loadEnv } = require("../backend/db/env.cjs")

const ROOT = path.join(__dirname, "..")
const be = loadEnv(path.join(ROOT, "backend/.env"))
const fe = loadEnv(path.join(ROOT, "frontend/.env"))
const cd = loadEnv(path.join(ROOT, "cdn/.env"))

// ── live hosts / ports ────────────────────────────────────────────────
const API = "https://api.mymobile.pk"
const CDN = "https://cdnlive.mymobile.pk"
const SITE = "https://mymobile.pk"
const API_PORT = 3122
const CDN_PORT = 3123
const WEB_PORT = 3124
const CDN_UPLOADS = "/home/mymobile-cdnlive/htdocs/cdnlive.mymobile.pk/uploads"
const PG_PORT = 5432

const db = new URL(be.DATABASE_URL)
db.hostname = "127.0.0.1"
db.port = String(PG_PORT)
const DATABASE_URL = db.toString()

// First live admin login: kept in deploy/live/admin.env (gitignored, never
// committed). The first deploy creates the user, then removes these lines.
const admin = loadEnv(path.join(__dirname, "live", "admin.env"))
const prevApi = loadEnv(path.join(__dirname, "live", "api", ".env"))
// VAPID keys for web push: generated once, then kept stable across re-runs
// (changing them breaks every existing push subscription).
const vapid =
  prevApi.VAPID_PUBLIC_KEY && prevApi.VAPID_PRIVATE_KEY
    ? { publicKey: prevApi.VAPID_PUBLIC_KEY, privateKey: prevApi.VAPID_PRIVATE_KEY }
    : require(path.join(ROOT, "backend/node_modules/web-push")).generateVAPIDKeys()

const adminBlock =
  admin.MM_ADMIN_EMAIL && admin.MM_ADMIN_PASSWORD
    ? `# One-time: first deploy creates this admin (api.mymobile.pk/app), then deletes these 2 lines.
MM_ADMIN_EMAIL=${admin.MM_ADMIN_EMAIL}
MM_ADMIN_PASSWORD=${admin.MM_ADMIN_PASSWORD}
`
    : "# MM_ADMIN_EMAIL= / MM_ADMIN_PASSWORD= (one-time first admin)\n"

const files = {
  api: `# mymobile.pk API (Medusa): /home/mymobile-api/htdocs/api.mymobile.pk/.env
NODE_ENV=production
PORT=${API_PORT}
HOST=127.0.0.1
MEDUSA_WORKER_MODE=shared

# Same role/password/database name as local. On first start db/bootstrap.cjs
# creates the database (if missing) and restores the full local copy.
DATABASE_URL=${DATABASE_URL}
# Needed ONLY if role "${decodeURIComponent(db.username)}" does not exist yet on the server.
# Fill the postgres superuser password, start once, then delete this line:
# PG_ADMIN_URL=postgres://postgres:CHANGE_ME@127.0.0.1:${PG_PORT}/postgres
# PSQL_BIN=/usr/bin/psql

${adminBlock}
# Redis (same server as zmobiles.pk, which uses db 1, so mymobile uses db 3).
# If this server has no Redis, put # in front of this line.
REDIS_URL=redis://127.0.0.1:6379/3

JWT_SECRET=${be.JWT_SECRET}
COOKIE_SECRET=${be.COOKIE_SECRET}
JWT_EXPIRES_IN=30d

STORE_CORS=${SITE},https://www.mymobile.pk
ADMIN_CORS=${API},${SITE}
AUTH_CORS=${SITE},https://www.mymobile.pk,${API}

MEDUSA_ADMIN_ONBOARDING_TYPE=nextjs
MEDUSA_FF_ADMIN_UI=true
MEDUSA_DISABLE_ADMIN=false
MEDUSA_BACKEND_URL=${API}
STOREFRONT_URL=${SITE}
REVALIDATE_SECRET=${be.REVALIDATE_SECRET}

CDN_PUBLIC_URL=${CDN}
CDN_API_KEY=${be.CDN_API_KEY}

AGENTIC_COMMERCE_SIGNATURE_KEY=${prevApi.AGENTIC_COMMERCE_SIGNATURE_KEY || crypto.randomBytes(32).toString("hex")}

# Web push notifications: new keys made for mymobile.pk (not zmobiles')
VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PRIVATE_KEY=${vapid.privateKey}
VAPID_SUBJECT=${SITE}

# Meilisearch not used by mymobile.pk (leave empty)
MEILISEARCH_HOST=
MEILISEARCH_API_KEY=

# ── Optional: same keys as zmobiles.pk, fill only if you want the feature ──
# Email (order / contact / password-reset mails). Gmail needs an App Password.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_FROM_NAME=My Mobile

# "Sign in with Google": needs its own OAuth client for mymobile.pk
# (Google Cloud Console → redirect URI ${SITE}/auth/google/callback)
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# GOOGLE_CALLBACK_URL=${SITE}/auth/google/callback

# Google Analytics server-side events
# GA_MEASUREMENT_ID=
# GA_API_SECRET=

# AI shopping assistant (chat widget is removed on mymobile.pk, not needed)
# OPENAI_API_KEY=
# OPENAI_MODEL=gpt-5-mini
`,
  cdn: `# mymobile.pk CDN: /home/mymobile-cdnlive/htdocs/cdnlive.mymobile.pk/.env
PORT=${CDN_PORT}
NODE_ENV=production
CORS_ORIGINS=${SITE},https://www.mymobile.pk,${API}
CDN_PUBLIC_URL=${CDN}
CDN_API_KEY=${cd.CDN_API_KEY || be.CDN_API_KEY}
UPLOAD_DIR=${CDN_UPLOADS}
MAX_FILE_SIZE_MB=20
WEBP_QUALITY=90
MAX_WIDTH=1920
THUMB_WIDTH=600
AUTO_ALT_ENABLED=false
AUTO_ALT_LANG=en
AUTO_ALT_MAX_CHARS=250
# Only used when AUTO_ALT_ENABLED=true
# OPENAI_API_KEY=
`,
  frontend: `# mymobile.pk storefront (Next.js): /home/mymobilepk/htdocs/mymobile.pk/.env
PORT=${WEB_PORT}
MEDUSA_BACKEND_URL=http://127.0.0.1:${API_PORT}
NEXT_PUBLIC_MEDUSA_BACKEND_URL=${API}
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${fe.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY}
NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID=${fe.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID}
NEXT_PUBLIC_BASE_URL=${SITE}
NEXT_PUBLIC_DEFAULT_REGION=pk
REVALIDATE_SECRET=${fe.REVALIDATE_SECRET || be.REVALIDATE_SECRET}
NEXT_PUBLIC_CDN_URL=${CDN}
CDN_PUBLIC_URL=${CDN}
CDN_INTERNAL_URL=http://127.0.0.1:${CDN_PORT}
NEXT_PUBLIC_MEILISEARCH_HOST=
NEXT_PUBLIC_MEILISEARCH_SEARCH_KEY=
NEXT_PUBLIC_MEILISEARCH_PRODUCT_INDEX_NAME=products
MEILISEARCH_INTERNAL_HOST=
MEILISEARCH_SEARCH_KEY=
# Optional (same as zmobiles.pk)
NEXT_PUBLIC_GA_MEASUREMENT_ID=
# NEXT_PUBLIC_GOOGLE_CALLBACK_URL=${SITE}/auth/google/callback
`,
}

for (const [name, body] of Object.entries(files)) {
  const out = path.join(__dirname, "live", name, ".env")
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, body)
  const missing = body.split("\n").filter((l) => !l.startsWith("#") && /=(undefined)?$/.test(l) && /SECRET|KEY|DATABASE/.test(l) && !/MEILI/.test(l))
  console.log(`wrote ${path.relative(ROOT, out)}${missing.length ? "  MISSING: " + missing.join(", ") : ""}`)
}
