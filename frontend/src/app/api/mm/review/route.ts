import { NextRequest, NextResponse } from "next/server"

/**
 * POST /api/mm/review — the device page review form posts here (plain HTML
 * form, works without JS, like PHP submit_review.php) and is redirected back
 * to /products/{handle}/#review-{status}.
 *
 * POST /api/mm/review?helpful={id} — "Helpful" button (JSON {ok,count}).
 */
const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:3102"
const PK = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""
const headers = (req: NextRequest) => ({
  "Content-Type": "application/json",
  ...(PK ? { "x-publishable-api-key": PK } : {}),
  "x-forwarded-for": req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "",
})

export async function POST(req: NextRequest) {
  const helpful = req.nextUrl.searchParams.get("helpful")
  if (helpful) {
    try {
      const r = await fetch(`${BACKEND_URL}/store/mm-reviews/${encodeURIComponent(helpful)}/helpful`, {
        method: "POST",
        headers: headers(req),
      })
      return NextResponse.json(await r.json())
    } catch {
      return NextResponse.json({ ok: false })
    }
  }

  const form = await req.formData()
  const handle = String(form.get("handle") || "").replace(/[^a-z0-9-]/gi, "")
  const back = (status: string) =>
    NextResponse.redirect(new URL(handle ? `/products/${handle}/#review-${status}` : "/", req.url), 303)

  const body: Record<string, string> = {}
  for (const k of ["product_id", "parent_id", "name", "email", "rating", "title", "message", "website", "ts"]) {
    body[k] = String(form.get(k) || "")
  }
  if (body.parent_id === "0") body.parent_id = ""
  try {
    const r = await fetch(`${BACKEND_URL}/store/mm-reviews`, {
      method: "POST",
      headers: headers(req),
      body: JSON.stringify(body),
    })
    const { status } = await r.json()
    return back(status || "error")
  } catch {
    return back("error")
  }
}
