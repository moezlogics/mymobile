import { getBaseURL } from "@lib/util/env"
import { getSiteSettings } from "@lib/data/site-settings"

/** /llms.txt — machine-readable site map for AI agents (PHP llms.php equivalent). */
export const revalidate = 3600

const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:3102"
const PK = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

export async function GET() {
  const base = getBaseURL().replace(/\/+$/, "")
  const s = await getSiteSettings()
  let count = 0
  try {
    const r = await fetch(`${BACKEND_URL}/store/products?limit=1&fields=id`, {
      headers: PK ? { "x-publishable-api-key": PK } : {},
      next: { revalidate: 3600 },
    })
    count = (await r.json()).count || 0
  } catch {}
  const name = s.site_name || "My Mobile"
  let legacy: Record<string, any> = {}
  try {
    legacy = JSON.parse(s.legacy_settings_json || "{}")
  } catch {}
  // PHP llms.php printed the full homepage_description (not the clipped meta).
  const about = String(legacy.homepage_description || s.seo_home_description || "").trim()

  const body = `# ${name}

> ${about}

${name} is a mobile phone specifications, price and shopping site (${count} devices). Visitors can browse phones by brand, filter by RAM, storage, battery, chipset and price, read the full specification sheet for any device, compare devices side by side, leave reviews and order online.

## Main pages

- [Home](${base}/): Latest devices, trending phones and brand index
- [Brands](${base}/brands/): Every manufacturer with device counts
- [Compare](${base}/compare/): Side-by-side comparison (?d=slug-a,slug-b)
- [Blog](${base}/blog/): News and guides
- [About](${base}/${s.about_page_slug || "about-us"}/): About this site
- [Contact](${base}/${s.contact_page_slug || "contact-us"}/): Contact form and details
- [Sitemap](${base}/sitemap.xml): Full URL list for discovery
- [This file](${base}/llms.txt): Machine-readable site map for agents

## URL structure

- Device page: ${base}/products/{device-slug}/
- Brand archive: ${base}/{brand-slug}/
- Device category: ${base}/category/{category-slug}/
- Comparison: ${base}/compare/?d={device-slug},{device-slug}
- Blog index: ${base}/blog/
- Blog post: ${base}/blog/{category-slug}/{post-slug}/

## JSON API (preferred for agents)

- Device JSON: ${base}/api/device/{device-slug}/ — full specs and score
- Device JSON (query): ${base}/api/device/?slug={device-slug}
- Comparison JSON: ${base}/api/compare/?d={device-slug},{device-slug}
`
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  })
}
