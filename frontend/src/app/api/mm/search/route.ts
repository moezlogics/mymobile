import { NextResponse } from "next/server"
import { mmThumb, formatPrice, deviceFromPrice } from "@modules/mm/lib"

/**
 * GET /api/mm/search?q=galaxy&exclude=slug-a,slug-b
 * Same contract as the PHP ajax_device_search.php (header live search and
 * compare picker): [{ slug, name, brand, img, price, url }]
 */
const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:3102"
const PK = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

export async function GET(req: Request) {
  const u = new URL(req.url)
  const q = (u.searchParams.get("q") || "").trim()
  const exclude = new Set(
    (u.searchParams.get("exclude") || "").split(",").map((s) => s.trim()).filter(Boolean)
  )
  const headers = { "Cache-Control": "public, max-age=120" }
  if (q.length < 2) return NextResponse.json([], { headers })

  const qs = new URLSearchParams({
    q,
    limit: "24",
    fields: "handle,title,thumbnail,metadata",
  })
  let products: any[] = []
  try {
    const r = await fetch(`${BACKEND_URL}/store/products?${qs}`, {
      headers: PK ? { "x-publishable-api-key": PK } : {},
      next: { revalidate: 120 },
    })
    products = r.ok ? (await r.json()).products || [] : []
  } catch {}

  const ql = q.toLowerCase()
  const out = products
    .filter((p) => !exclude.has(p.handle))
    // PHP: ORDER BY (name LIKE 'q%') DESC, views DESC
    .sort((a, b) => {
      const sa = a.title.toLowerCase().startsWith(ql) ? 1 : 0
      const sb = b.title.toLowerCase().startsWith(ql) ? 1 : 0
      if (sa !== sb) return sb - sa
      return (Number(b.metadata?.views) || 0) - (Number(a.metadata?.views) || 0)
    })
    .slice(0, 12)
    .map((p) => ({
      slug: p.handle,
      name: p.title,
      brand: p.metadata?.brand || "",
      img: mmThumb(p.thumbnail, 120),
      price: formatPrice(deviceFromPrice(p)),
      url: `/products/${p.handle}/`,
    }))
  return NextResponse.json(out, { headers })
}
