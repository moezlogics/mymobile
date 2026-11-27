import { NextResponse } from "next/server"
import { getBaseURL } from "@lib/util/env"

/**
 * /sitemap.xml — the same URL set the PHP sitemap.php published, in the
 * same order, with the Google image namespace (every device lists its
 * photos, every post its cover):
 *
 *   /  /brands/  /blog/  about  contact
 *   /{brand}/                 every active brand
 *   /products/{slug}/         every published device (+ image:image)
 *   /category/{slug}/         every device category
 *   /blog/{cat}/{post}/       every published post (+ image:image)
 *   /blog/category/{slug}/    blog categories with posts
 *   /blog/tag/{slug}/         tags with posts
 *   /blog/author/{slug}/      authors
 *   /{page}/                  CMS pages (privacy-policy, terms-conditions …)
 */
export const revalidate = 600

const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:3102"
const PK = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""
const HEADERS: Record<string, string> = PK ? { "x-publishable-api-key": PK } : {}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")

async function getJson(path: string): Promise<any> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, { headers: HEADERS, next: { revalidate: 600, tags: ["sitemap"] } })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

async function allProducts(): Promise<any[]> {
  const out: any[] = []
  for (let offset = 0; offset < 20000; offset += 100) {
    const data = await getJson(
      `/store/products?limit=100&offset=${offset}&fields=handle,title,updated_at,thumbnail,images.url,metadata,categories.handle&order=-created_at`
    )
    const batch = data?.products || []
    out.push(...batch)
    if (batch.length < 100) break
  }
  return out
}

async function allPosts(): Promise<any[]> {
  const out: any[] = []
  for (let offset = 0; offset < 10000; offset += 50) {
    const data = await getJson(`/store/blog/posts?limit=50&offset=${offset}`)
    const batch = data?.posts || []
    out.push(...batch)
    if (batch.length < 50) break
  }
  return out
}

type Entry = { loc: string; lastmod?: string | null; images?: { loc: string; title?: string }[] }

export async function GET() {
  const base = getBaseURL().replace(/\/+$/, "")
  const url = (p: string) => `${base}${p}`

  const [products, brandsRes, catsRes, posts, pagesRes, blogCatsRes] = await Promise.all([
    allProducts(),
    getJson(`/store/brands?limit=500`),
    getJson(`/store/product-categories?limit=500&fields=handle,updated_at,is_internal`),
    allPosts(),
    getJson(`/store/pages`),
    getJson(`/store/blog/categories`),
  ])
  const pages: any[] = pagesRes?.pages || []
  const kindPage = (k: string) => pages.find((p) => p.metadata?.kind === k)

  // Like PHP sitemap.php: only brands / categories that actually have devices.
  const usedBrands = new Set<string>(products.map((p: any) => p.metadata?.brand_handle).filter(Boolean))
  const usedProductCats = new Set<string>(
    products.flatMap((p: any) => (p.categories || []).map((c: any) => c.handle))
  )

  const entries: Entry[] = [{ loc: url("/") }, { loc: url("/brands/") }, { loc: url("/blog/") }]
  for (const k of ["about", "contact"]) {
    const p = kindPage(k)
    if (p) entries.push({ loc: url(`/${p.handle}/`), lastmod: p.updated_at })
  }
  for (const b of brandsRes?.brands || []) {
    if (b.is_active === false || b.parent_id || !usedBrands.has(b.handle)) continue
    entries.push({ loc: url(`/${b.handle}/`), lastmod: b.updated_at })
  }
  for (const p of products) {
    const imgs = [p.thumbnail, ...(p.images || []).map((i: any) => i.url)].filter(Boolean)
    entries.push({
      loc: url(`/products/${p.handle}/`),
      lastmod: p.updated_at,
      images: [...new Set<string>(imgs)].map((loc) => ({ loc, title: p.title })),
    })
  }
  for (const c of catsRes?.product_categories || []) {
    if (c.is_internal || !usedProductCats.has(c.handle)) continue
    entries.push({ loc: url(`/category/${c.handle}/`), lastmod: c.updated_at })
  }
  const usedCats = new Set<string>()
  const usedTags = new Set<string>()
  const authors = new Map<string, string>()
  for (const p of posts) {
    const primary = p.metadata?.primary_category_handle
    for (const c of p.categories || []) usedCats.add(c.handle)
    for (const t of p.tags || []) usedTags.add(t.handle)
    if (p.author?.handle) authors.set(p.author.handle, p.updated_at)
    entries.push({
      loc: url(primary ? `/blog/${primary}/${p.handle}/` : `/blog/${p.handle}/`),
      lastmod: p.updated_at,
      images: p.featured_image ? [{ loc: p.featured_image, title: p.title }] : [],
    })
  }
  for (const c of blogCatsRes?.categories || []) {
    if (usedCats.has(c.handle)) entries.push({ loc: url(`/blog/category/${c.handle}/`) })
  }
  for (const t of usedTags) entries.push({ loc: url(`/blog/tag/${t}/`) })
  for (const [a, lm] of authors) entries.push({ loc: url(`/blog/author/${a}/`), lastmod: lm })
  for (const p of pages) {
    if (p.metadata?.kind === "about" || p.metadata?.kind === "contact") continue
    entries.push({ loc: url(`/${p.handle}/`), lastmod: p.updated_at })
  }

  const seen = new Set<string>()
  const body = entries
    .filter((e) => (seen.has(e.loc) ? false : (seen.add(e.loc), true)))
    .map((e) => {
      const lm = e.lastmod ? `\n    <lastmod>${new Date(e.lastmod).toISOString()}</lastmod>` : ""
      const im = (e.images || [])
        .map(
          (i) =>
            `\n    <image:image>\n      <image:loc>${esc(i.loc)}</image:loc>${
              i.title ? `\n      <image:title>${esc(i.title)}</image:title>` : ""
            }\n    </image:image>`
        )
        .join("")
      return `  <url>\n    <loc>${esc(e.loc)}</loc>${lm}${im}\n  </url>`
    })
    .join("\n")

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${body}
</urlset>
`
  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=600, s-maxage=600" },
  })
}
