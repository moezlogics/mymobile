import { NextRequest, NextResponse } from "next/server"

/** POST /api/mm/contact — contact-us form (PHP contact.php posted to itself). */
const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:3102"
const PK = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

export async function POST(req: NextRequest) {
  const f = await req.formData()
  const backRaw = String(f.get("back") || "/contact-us/")
  const back = /^\/[a-z0-9-]+\/$/i.test(backRaw) ? backRaw : "/contact-us/"
  const go = (s: string) => NextResponse.redirect(new URL(`${back}#contact-${s}`, req.url), 303)
  if (String(f.get("website") || "").trim()) return go("ok") // honeypot: pretend success
  const body = {
    name: String(f.get("name") || "").trim(),
    email: String(f.get("email") || "").trim(),
    subject: String(f.get("subject") || "").trim(),
    message: String(f.get("message") || "").trim(),
  }
  if (!body.name || !body.email || !body.subject || !body.message) return go("err")
  try {
    const r = await fetch(`${BACKEND_URL}/store/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(PK ? { "x-publishable-api-key": PK } : {}) },
      body: JSON.stringify(body),
    })
    return go(r.ok ? "ok" : r.status === 429 ? "spam" : "err")
  } catch {
    return go("err")
  }
}
