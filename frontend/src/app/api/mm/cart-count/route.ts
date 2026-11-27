import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/mm/cart-count — item count for the header cart badge. Read
 * client-side so the (ISR-cached, cookie-free) pages stay cacheable.
 */
const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:3102"
const PK = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

export async function GET(req: NextRequest) {
  const id = req.cookies.get("_medusa_cart_id")?.value
  const headers = { "Cache-Control": "private, no-store" }
  if (!id) return NextResponse.json({ count: 0 }, { headers })
  try {
    const r = await fetch(`${BACKEND_URL}/store/carts/${encodeURIComponent(id)}?fields=items.quantity`, {
      headers: PK ? { "x-publishable-api-key": PK } : {},
      cache: "no-store",
    })
    if (!r.ok) return NextResponse.json({ count: 0 }, { headers })
    const { cart } = await r.json()
    const count = (cart?.items || []).reduce((n: number, i: any) => n + (Number(i.quantity) || 0), 0)
    return NextResponse.json({ count }, { headers })
  } catch {
    return NextResponse.json({ count: 0 }, { headers })
  }
}
