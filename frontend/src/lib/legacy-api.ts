import "server-only"

/**
 * Shared helpers for the legacy public JSON API (/api/device, /api/compare)
 * that mymobile.pk exposed from api_device.php / api_compare.php. The
 * marketplace (/marketplace, classifieds) and external widgets consume it,
 * so the response shape is kept identical.
 */
const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:3102"
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""
const SITE = (process.env.NEXT_PUBLIC_BASE_URL || "https://mymobile.pk").replace(/\/+$/, "")

export const API_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=600",
  "Access-Control-Allow-Origin": "*",
  "X-Robots-Tag": "noindex",
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/i

const splitLines = (s: any): string[] =>
  String(s ?? "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)

export async function fetchDevices(slugs: string[]): Promise<any[]> {
  if (!slugs.length) return []
  const qs = new URLSearchParams()
  slugs.forEach((s) => qs.append("handle[]", s))
  qs.set("limit", String(slugs.length))
  qs.set("fields", "id,title,handle,thumbnail,metadata,created_at")
  const res = await fetch(`${BACKEND_URL}/store/products?${qs}`, {
    headers: PUBLISHABLE_KEY ? { "x-publishable-api-key": PUBLISHABLE_KEY } : {},
    next: { revalidate: 600, tags: ["products"] },
  })
  if (!res.ok) return []
  const { products } = await res.json()
  // keep request order
  return slugs.map((s) => products.find((p: any) => p.handle === s)).filter(Boolean)
}

export function toLegacyDevice(p: any) {
  const m = p.metadata || {}
  const rc = Number(m.rating_count) || 0
  return {
    id: m.legacy_id ?? p.id,
    name: p.title,
    slug: p.handle,
    url: `${SITE}/products/${p.handle}/`,
    brand: m.brand ?? null,
    brand_slug: m.brand_handle ?? null,
    model_no: m.model_no ?? null,
    availability: m.availability ?? null,
    release_date: m.release_date ?? null,
    price: m.price ?? null,
    price_from: m.price_from ?? m.price ?? null,
    currency: "PKR",
    image: p.thumbnail ?? null,
    rating: rc ? Math.round(((Number(m.rating_sum) || 0) / rc) * 10) / 10 : null,
    specs: m.specs ?? {},
    pros: splitLines(m.pros),
    cons: splitLines(m.cons),
  }
}
