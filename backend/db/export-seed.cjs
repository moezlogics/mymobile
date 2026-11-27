#!/usr/bin/env node
/**
 * LOCAL ONLY — snapshot the local mymobile.pk database into
 * db/seed/mymobilepkdb.sql.gz, which db/bootstrap.cjs restores on the live
 * server the first time the API starts against an empty database.
 *
 *   cd backend && node db/export-seed.cjs
 *
 * - plain SQL (portable across PostgreSQL versions), no owner / no grants
 * - every local CDN URL is replaced with the placeholder __MM_CDN_URL__,
 *   which bootstrap swaps for CDN_PUBLIC_URL from the server's .env
 *
 * Needs pg_dump: set PG_DUMP=/path/to/pg_dump if it is not on PATH.
 */
const fs = require("fs")
const path = require("path")
const zlib = require("zlib")
const { spawnSync } = require("child_process")
const { loadEnv } = require("./env.cjs")

const env = loadEnv(path.join(__dirname, "..", ".env"))
const DB = env.DATABASE_URL
if (!DB) throw new Error("DATABASE_URL missing in backend/.env")
const LOCAL_CDN = (env.CDN_PUBLIC_URL || "http://localhost:3101").replace(/\/+$/, "")

const candidates = [process.env.PG_DUMP, "D:/ecomm/_infra/pgsql/bin/pg_dump.exe", "pg_dump"].filter(Boolean)
const pgDump = candidates.find((c) => c === "pg_dump" || fs.existsSync(c))

const r = spawnSync(pgDump, ["--no-owner", "--no-privileges", "--encoding=UTF8", "--dbname", DB], {
  maxBuffer: 1024 * 1024 * 1024,
})
if (r.status !== 0) {
  process.stderr.write(r.stderr || "")
  throw new Error(`pg_dump failed (${r.status})`)
}

let sql = r.stdout.toString("utf8")
const hits = sql.split(LOCAL_CDN).length - 1
sql = sql.split(LOCAL_CDN).join("__MM_CDN_URL__")

const out = path.join(__dirname, "seed", "mymobilepkdb.sql.gz")
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, zlib.gzipSync(Buffer.from(sql, "utf8"), { level: 9 }))
console.log(`seed written: ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${hits} CDN URLs → __MM_CDN_URL__)`)
