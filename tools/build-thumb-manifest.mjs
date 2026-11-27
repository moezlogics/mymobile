#!/usr/bin/env node
/**
 * Lists which legacy images have prebuilt -w200 / -w400 WebP siblings
 * (the PHP media library generated them on upload). The storefront uses the
 * smallest sibling for cards — same bytes the PHP site served — and falls
 * back to the original when none exists.
 *
 *   node tools/build-thumb-manifest.mjs [uploadsDir] [outFile]
 */
import fs from "node:fs"
import path from "node:path"
const dir = process.argv[2] || "cdn/uploads/images"
const out = process.argv[3] || "frontend/src/modules/mm/lib/thumb-manifest.json"
const files = new Set(fs.readdirSync(dir))
const manifest = {}
for (const f of files) {
  const m = f.match(/^(.*)-w(200|400)\.webp$/)
  if (!m) continue
  const base = [...files].find((x) => x.startsWith(m[1] + ".") && !/-w\d+\.webp$/.test(x))
  if (!base) continue
  ;(manifest[base] ||= []).push(Number(m[2]))
}
for (const k of Object.keys(manifest)) manifest[k].sort((a, b) => a - b)
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(manifest))
console.log(Object.keys(manifest).length, "images with siblings →", out)
