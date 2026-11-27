import { NextRequest, NextResponse } from "next/server"

/**
 * POST /api/mm/comment — blog comment / reply form (single.php posted to
 * itself). Redirects back to the post with #comment-ok|dup|err.
 */
const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:3102"
const PK = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

export async function POST(req: NextRequest) {
  const f = await req.formData()
  const handle = String(f.get("handle") || "").replace(/[^a-z0-9-]/gi, "")
  const backRaw = String(f.get("back") || "/blog/")
  const back = /^\/blog\/[a-z0-9/-]*$/i.test(backRaw) ? backRaw : "/blog/"
  const go = (s: string) => NextResponse.redirect(new URL(`${back}#comment-${s}`, req.url), 303)
  if (!handle) return go("err")
  try {
    const r = await fetch(`${BACKEND_URL}/store/blog/posts/${encodeURIComponent(handle)}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(PK ? { "x-publishable-api-key": PK } : {}),
        "x-forwarded-for": req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "",
      },
      body: JSON.stringify({
        name: String(f.get("name") || ""),
        content: String(f.get("message") || ""),
        parent_id: String(f.get("parent_id") || "") || undefined,
        website: String(f.get("website") || ""),
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return go("err")
    return go(data.duplicate ? "dup" : "ok")
  } catch {
    return go("err")
  }
}
