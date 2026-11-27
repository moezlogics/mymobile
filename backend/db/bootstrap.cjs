#!/usr/bin/env node
/**
 * mymobile.pk: first-boot database bootstrap.
 *
 * Run ONCE by deploy-backend.sh on the first deploy. After it succeeds the
 * deploy script deletes the whole db/ folder from the server and writes
 * .db-bootstrapped, so it never runs again. It is still safe to re-run:
 *
 *   database already has the Medusa tables  → does nothing, exits 0
 *   database missing / empty                → creates it and restores
 *                                             db/seed/mymobilepkdb.sql.gz
 *                                             (full copy of the local DB)
 *   database has some other tables          → refuses to touch it, exits 1
 *
 * Uses only the backend .env:
 *   DATABASE_URL     postgres://USER:PASS@HOST:PORT/DBNAME   (required)
 *   CDN_PUBLIC_URL   replaces __MM_CDN_URL__ in the seed     (required)
 *   PG_ADMIN_URL     superuser URL. Needed only if the USER role or the
 *                    database does not exist yet and USER can't create it.
 *                    Can be removed from .env after the first boot.
 *   PSQL_BIN         path to psql if it is not on PATH
 *   MM_DB_BOOTSTRAP  "off" disables this script
 */
const fs = require("fs")
const os = require("os")
const path = require("path")
const zlib = require("zlib")
const { spawnSync } = require("child_process")
const { Client } = require("pg")
const { loadEnv } = require("./env.cjs")

const ROOT = path.join(__dirname, "..")
const SEED = path.join(__dirname, "seed", "mymobilepkdb.sql.gz")
const env = loadEnv(path.join(ROOT, ".env"))
const log = (...a) => console.log("[db-bootstrap]", ...a)

function withDb(url, db) {
  const u = new URL(url)
  u.pathname = "/" + encodeURIComponent(db)
  return u.toString()
}

async function query(url, sql, params) {
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 10000 })
  await c.connect()
  try {
    return typeof sql === "function" ? await sql(c) : await c.query(sql, params)
  } finally {
    await c.end().catch(() => {})
  }
}

async function probe(url) {
  try {
    const r = await query(
      url,
      `SELECT (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public') AS tables,
              to_regclass('public.product') IS NOT NULL AS has_product`
    )
    return { ok: true, tables: r.rows[0].tables, hasProduct: r.rows[0].has_product }
  } catch (e) {
    return { ok: false, code: e.code, message: e.message }
  }
}

function manualHelp(user, db) {
  return [
    "Create the role + database once, as root on the server:",
    `  sudo -u postgres psql -c "CREATE ROLE ${user} LOGIN PASSWORD '<password from DATABASE_URL>';" \\`,
    `                        -c "CREATE DATABASE ${db} OWNER ${user};"`,
    "or put PG_ADMIN_URL=postgres://postgres:<pass>@127.0.0.1:5432/postgres in .env and start again.",
  ].join("\n")
}

async function createAsAdmin(user, pass, db) {
  const admin = env.PG_ADMIN_URL
  if (!admin) throw new Error(`Role "${user}" or database "${db}" is missing and PG_ADMIN_URL is not set.\n${manualHelp(user, db)}`)
  await query(withDb(admin, "postgres"), async (c) => {
    const role = await c.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [user])
    if (!role.rowCount) {
      await c.query(`CREATE ROLE ${c.escapeIdentifier(user)} LOGIN PASSWORD ${c.escapeLiteral(pass)}`)
      log(`created role ${user}`)
    }
    const dbx = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [db])
    if (!dbx.rowCount) {
      await c.query(`CREATE DATABASE ${c.escapeIdentifier(db)} OWNER ${c.escapeIdentifier(user)} ENCODING 'UTF8' TEMPLATE template0`)
      log(`created database ${db} (owner ${user})`)
    }
  })
}

async function createDatabase(url, user, pass, db) {
  // First try with the app's own role (works when it has CREATEDB).
  try {
    await query(withDb(url, "postgres"), (c) =>
      c.query(`CREATE DATABASE ${c.escapeIdentifier(db)} ENCODING 'UTF8' TEMPLATE template0`)
    )
    log(`created database ${db}`)
  } catch (e) {
    await createAsAdmin(user, pass, db)
  }
}

function restore(url) {
  if (!fs.existsSync(SEED)) throw new Error(`seed file missing: ${SEED}`)
  const cdn = String(env.CDN_PUBLIC_URL || "").replace(/\/+$/, "")
  if (!/^https?:\/\//.test(cdn)) throw new Error("CDN_PUBLIC_URL must be set (e.g. https://cdnlive.mymobile.pk) before restoring")

  const sql = zlib.gunzipSync(fs.readFileSync(SEED)).toString("utf8").split("__MM_CDN_URL__").join(cdn)
  const tmp = path.join(os.tmpdir(), `mymobile-seed-${process.pid}.sql`)
  fs.writeFileSync(tmp, sql)
  log(`restoring seed (${(sql.length / 1048576).toFixed(1)} MB, CDN → ${cdn}) …`)
  try {
    const psql = env.PSQL_BIN || "psql"
    const r = spawnSync(psql, ["-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-d", url, "-f", tmp], {
      stdio: ["ignore", "ignore", "inherit"], // only errors
    })
    if (r.error && r.error.code === "ENOENT") throw new Error(`psql not found ("${psql}"). Install postgresql-client or set PSQL_BIN in .env`)
    if (r.status !== 0) throw new Error(`psql restore failed (exit ${r.status}). Nothing was committed (single transaction).`)
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}

async function afterRestore(url) {
  await query(url, async (c) => {
    // The local test admin must never exist on live.
    await c.query(`WITH p AS (DELETE FROM provider_identity WHERE entity_id = 'admin@mymobile.local' RETURNING auth_identity_id)
                   DELETE FROM auth_identity WHERE id IN (SELECT auth_identity_id FROM p)`)
    await c.query(`DELETE FROM "user" WHERE email = 'admin@mymobile.local'`)
    const n = await c.query(
      `SELECT (SELECT count(*) FROM product WHERE deleted_at IS NULL) AS products,
              (SELECT count(*) FROM brand) AS brands,
              (SELECT count(*) FROM blog_post) AS posts`
    )
    log(`restore OK: ${JSON.stringify(n.rows[0])}`)
  })
}

async function main() {
  if (String(env.MM_DB_BOOTSTRAP || "").toLowerCase() === "off") return log("disabled (MM_DB_BOOTSTRAP=off)")
  const url = env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")
  const u = new URL(url)
  const user = decodeURIComponent(u.username)
  const pass = decodeURIComponent(u.password)
  const db = decodeURIComponent(u.pathname.replace(/^\//, ""))

  let s = await probe(url)
  if (!s.ok) {
    if (s.code === "3D000") {
      log(`database ${db} does not exist, creating …`)
      await createDatabase(url, user, pass, db)
    } else if (s.code === "28P01" || s.code === "28000") {
      log(`cannot log in as ${user} (${s.code}), trying PG_ADMIN_URL …`)
      await createAsAdmin(user, pass, db)
    } else {
      throw new Error(`cannot reach PostgreSQL: ${s.code || ""} ${s.message}`)
    }
    s = await probe(url)
    if (!s.ok) throw new Error(`still cannot connect after create: ${s.code} ${s.message}\n${manualHelp(user, db)}`)
  }

  if (s.hasProduct) return log(`database ${db} ready (${s.tables} tables), nothing to do`)
  if (s.tables > 0) {
    throw new Error(`database ${db} has ${s.tables} tables but no "product" table. Not restoring over unknown data. ` +
      `Empty it or point DATABASE_URL at a new database.`)
  }

  restore(url)
  await afterRestore(url)
}

main().catch((e) => {
  console.error("[db-bootstrap] FAILED:", e.message)
  process.exit(1)
})
