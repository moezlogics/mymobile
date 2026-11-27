#!/usr/bin/env node
/**
 * SEO snapshot crawler — captures what search engines see on every URL.
 *
 *   node tools/seo-snapshot.mjs --base http://localhost/mymobile --out seo/baseline-php.json
 *   node tools/seo-snapshot.mjs --base http://localhost:3100 --urls seo/baseline-php.json --out seo/new-next.json
 *
 * --base   site origin (+ optional base path) to crawl
 * --urls   optional: reuse the URL list from an earlier snapshot (so the new
 *          site is checked against EXACTLY the legacy URL set). Default: the
 *          site's own /sitemap.xml
 * --extra  optional: newline-separated file of extra paths (legacy/redirect URLs)
 *
 * Per URL it records: final status, redirect target, title, meta description,
 * canonical, robots, h1, og:title/description/image/type, JSON-LD @types and
 * the number of <img>. All URLs are stored as PATHS (origin + base stripped)
 * so two snapshots from different hosts compare directly.
 */
import fs from "node:fs"
import path from "node:path"

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]?.startsWith("--") ? true : all[i + 1]])
    return acc
  }, [])
)
const BASE = String(args.base || "").replace(/\/+$/, "")
if (!BASE) {
  console.error("--base is required")
  process.exit(1)
}
const OUT = args.out || "seo/snapshot.json"
const CONCURRENCY = Number(args.concurrency || 4)
const basePath = new URL(BASE).pathname.replace(/\/+$/, "")

/** Absolute URL from any host → path relative to the site root. */
function toPath(u) {
  if (!u) return null
  try {
    const url = new URL(u, BASE + "/")
    let p = url.pathname
    if (basePath && p.startsWith(basePath)) p = p.slice(basePath.length) || "/"
    // Production hosts in legacy canonicals (https://mymobile.pk/…) → path
    return p + (url.search || "")
  } catch {
    return u
  }
}

const decode = (s) =>
  s
    ?.replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim() ?? null

function meta(html, attr, name) {
  const re = new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]*>`, "i")
  const tag = html.match(re)?.[0]
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "") : null
}

function extract(html) {
  const ldTypes = []
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1])
      const walk = (n) => {
        if (!n || typeof n !== "object") return
        if (Array.isArray(n)) return n.forEach(walk)
        if (n["@type"]) ldTypes.push(...[].concat(n["@type"]))
        // Only structural containers — not every nested value (offers,
        // authors, addresses … would flood the list with sub-types).
        for (const k of ["@graph", "mainEntity", "itemListElement", "hasPart"]) if (n[k]) walk(n[k])
      }
      walk(data)
    } catch {
      ldTypes.push("INVALID_JSON")
    }
  }
  const canonicalTag = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0]
  return {
    title: decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null),
    description: meta(html, "name", "description"),
    canonical: canonicalTag ? toPath(canonicalTag.match(/href=["']([^"']*)["']/i)?.[1]) : null,
    robots: meta(html, "name", "robots"),
    h1: decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ") ?? null),
    og_title: meta(html, "property", "og:title"),
    og_description: meta(html, "property", "og:description"),
    og_image: meta(html, "property", "og:image"),
    og_type: meta(html, "property", "og:type"),
    jsonld: [...new Set(ldTypes)].sort(),
    images: (html.match(/<img\b/gi) || []).length,
  }
}

async function fetchOne(p) {
  const url = BASE + p
  const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "seo-snapshot/1.0" } })
  const rec = { path: p, status: res.status }
  if (res.status >= 300 && res.status < 400) {
    rec.location = toPath(res.headers.get("location"))
    return rec
  }
  rec.x_robots = res.headers.get("x-robots-tag")
  const type = res.headers.get("content-type") || ""
  if (type.includes("html")) Object.assign(rec, extract(await res.text()))
  return rec
}

async function urlList() {
  let paths = []
  if (args.urls) {
    paths = JSON.parse(fs.readFileSync(args.urls, "utf8")).pages.map((r) => r.path)
  } else {
    const xml = await (await fetch(BASE + "/sitemap.xml")).text()
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]))
    // A sitemap index lists child sitemaps — expand one level.
    for (const loc of locs) {
      if (/\.xml(\?|$)/.test(loc) && xml.includes("<sitemapindex")) {
        const child = await (await fetch(loc)).text()
        paths.push(...[...child.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => toPath(decode(m[1]))))
      } else paths.push(toPath(loc))
    }
  }
  if (args.extra) {
    paths.push(
      ...fs
        .readFileSync(args.extra, "utf8")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("#"))
    )
  }
  return [...new Set(paths)]
}

const paths = await urlList()
console.log(`crawling ${paths.length} URLs from ${BASE} (concurrency ${CONCURRENCY})`)
const pages = new Array(paths.length)
let next = 0
let done = 0
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < paths.length) {
      const i = next++
      try {
        pages[i] = await fetchOne(paths[i])
      } catch (e) {
        pages[i] = { path: paths[i], status: 0, error: String(e?.message || e) }
      }
      if (++done % 50 === 0) console.log(`  ${done}/${paths.length}`)
    }
  })
)
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify({ base: BASE, crawled_at: new Date().toISOString(), pages }, null, 1))
const byStatus = pages.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {})
console.log("status counts:", byStatus, "→", OUT)
