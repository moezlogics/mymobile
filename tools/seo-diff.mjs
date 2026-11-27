#!/usr/bin/env node
/**
 * Compare two SEO snapshots (tools/seo-snapshot.mjs) URL by URL.
 *
 *   node tools/seo-diff.mjs seo/baseline-php.json seo/new-next.json [--out seo/diff.md]
 *
 * Flags, per URL: status change, canonical change, title / description / h1
 * change, robots change, lost JSON-LD types. Exits 1 when any URL that was
 * 200 on the old site is not 200 on the new one (the migration blocker).
 */
import fs from "node:fs"

const [oldFile, newFile] = process.argv.slice(2).filter((a) => !a.startsWith("--"))
const outIdx = process.argv.indexOf("--out")
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : null
const A = JSON.parse(fs.readFileSync(oldFile, "utf8"))
const B = JSON.parse(fs.readFileSync(newFile, "utf8"))
const byPath = new Map(B.pages.map((p) => [p.path, p]))

const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim()
const robotsIndex = (r) => (/noindex/i.test(r || "") ? "noindex" : "index")

const rows = []
const counts = { urls: 0, status: 0, canonical: 0, title: 0, description: 0, h1: 0, robots: 0, jsonld: 0 }
for (const a of A.pages) {
  counts.urls++
  const b = byPath.get(a.path)
  const issues = []
  if (!b) issues.push(["missing", "not crawled"])
  else {
    if (a.status !== b.status) issues.push(["status", `${a.status} → ${b.status}${b.location ? " " + b.location : ""}`])
    if (b.status === 200) {
      if (a.canonical !== b.canonical) issues.push(["canonical", `${a.canonical} → ${b.canonical}`])
      if (norm(a.title) !== norm(b.title)) issues.push(["title", `"${a.title}" → "${b.title}"`])
      if (norm(a.description) !== norm(b.description))
        issues.push(["description", `"${norm(a.description).slice(0, 90)}" → "${norm(b.description).slice(0, 90)}"`])
      if (norm(a.h1) !== norm(b.h1)) issues.push(["h1", `"${a.h1}" → "${b.h1}"`])
      if (robotsIndex(a.robots || a.x_robots) !== robotsIndex(b.robots || b.x_robots))
        issues.push(["robots", `${a.robots || a.x_robots} → ${b.robots || b.x_robots}`])
      // schema.org subtypes satisfy their parent (ElectronicsStore is a
      // LocalBusiness, BlogPosting is an Article, Product page ≈ ItemPage).
      const EQUIV = {
        LocalBusiness: ["Store", "ElectronicsStore", "LocalBusiness"],
        Article: ["Article", "BlogPosting", "NewsArticle"],
        ItemPage: ["ItemPage", "Product"],
        WebPage: ["WebPage", "ItemPage", "CollectionPage", "ProfilePage", "AboutPage", "ContactPage"],
      }
      const has = (t) => (EQUIV[t] || [t]).some((x) => (b.jsonld || []).includes(x))
      const lost = (a.jsonld || []).filter((t) => !has(t))
      if (lost.length) issues.push(["jsonld", `lost ${lost.join(", ")}`])
    }
  }
  for (const [k] of issues) if (k in counts) counts[k]++
  if (issues.length) rows.push({ path: a.path, issues })
}

const blockers = rows.filter((r) => r.issues.some(([k, v]) => k === "missing" || (k === "status" && !v.startsWith("200 → 200"))))
let md = `# SEO diff\n\nold: ${A.base} (${A.crawled_at})\nnew: ${B.base} (${B.crawled_at})\n\n`
md += `| check | URLs differing |\n|---|---|\n` + Object.entries(counts).map(([k, v]) => `| ${k} | ${v} |`).join("\n") + "\n\n"
md += `## Status blockers (${blockers.length})\n\n` + (blockers.map((r) => `- \`${r.path}\` ${r.issues.map((i) => i.join(": ")).join("; ")}`).join("\n") || "none") + "\n\n"
md += `## All differences\n\n` + rows.map((r) => `- \`${r.path}\`\n` + r.issues.map(([k, v]) => `  - **${k}**: ${v}`).join("\n")).join("\n") + "\n"

if (OUT) fs.writeFileSync(OUT, md)
console.log(Object.entries(counts).map(([k, v]) => `${k}=${v}`).join("  "))
console.log(`status blockers: ${blockers.length}${OUT ? `  → ${OUT}` : ""}`)
process.exit(blockers.length ? 1 : 0)
