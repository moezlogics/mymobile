import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * mymobile.pk guest reviews (PHP includes/reviews_block.php + submit_review.php).
 *
 * GET  /store/mm-reviews?product_id=…  → approved reviews (newest first, 50),
 *                                         approved replies, star distribution
 * POST /store/mm-reviews                → { product_id, parent_id?, name, email,
 *                                           rating, title, message, website, ts }
 *                                         returns { status: ok|pending|invalid|spam|ratelimit|error }
 *
 * Replies live in the parent review's metadata.replies (as migrated from
 * device_reviews.parent_id); they need approval like PHP did.
 */
const svc = (req: MedusaRequest): any => req.scope.resolve("advanced_reviews")

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productId = String((req.query as any).product_id || "")
  if (!productId) return res.status(400).json({ error: "product_id is required" })
  const reviews = await svc(req).listAdvancedReviews(
    { product_id: productId, status: "approved" },
    { order: { created_at: "DESC" }, take: 50 }
  )
  const pg: any = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const dist = (
    await pg.raw(
      `select rating, count(*)::int c from advanced_review
       where product_id = ? and status = 'approved' and deleted_at is null and rating > 0 group by rating`,
      [productId]
    )
  ).rows
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120")
  res.json({
    reviews: reviews.map((r: any) => ({
      id: r.id,
      name: r.guest_name || "Guest",
      rating: r.rating,
      title: r.metadata?.title || null,
      message: r.content,
      helpful: Number(r.metadata?.helpful) || 0,
      is_admin: !!r.metadata?.is_admin,
      created_at: r.created_at,
      replies: (r.metadata?.replies || [])
        .filter((x: any) => x.status === "approved")
        .map((x: any) => ({ name: x.name, message: x.message, is_admin: !!x.is_admin, created_at: x.created_at })),
    })),
    distribution: Object.fromEntries(dist.map((d: any) => [d.rating, d.c])),
  })
}

const recent = new Map<string, number[]>()

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const b = (req.body || {}) as Record<string, any>
  const productId = String(b.product_id || "")
  const parentId = String(b.parent_id || "")
  const name = String(b.name || "").trim().slice(0, 110)
  const email = String(b.email || "").trim().slice(0, 190)
  const title = String(b.title || "").trim().slice(0, 190)
  const message = String(b.message || "").trim().slice(0, 4000)
  const rating = Math.max(0, Math.min(5, parseInt(String(b.rating || "0"), 10) || 0))
  const ts = parseInt(String(b.ts || "0"), 10) || 0

  // Honeypot / too-fast submission → spam (same rules as submit_review.php)
  if (String(b.website || "").trim() !== "") return res.json({ status: "spam" })
  if (ts > 0 && Date.now() / 1000 - ts < 3) return res.json({ status: "spam" })
  if (!productId || name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 3) {
    return res.json({ status: "invalid" })
  }
  if (/(https?:\/\/[^\s]+.*){3,}/i.test(message)) return res.json({ status: "spam" })

  const ip = String(req.headers["cf-connecting-ip"] || req.ip || "")
  const now = Date.now()
  const hits = (recent.get(ip) || []).filter((t) => now - t < 3600_000)
  if (hits.length >= 8) return res.json({ status: "ratelimit" })
  hits.push(now)
  recent.set(ip, hits)

  const pg: any = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  let requireApproval = true
  try {
    const row = (await pg.raw(`select value from site_setting where key = 'legacy_settings_json' limit 1`)).rows[0]
    const legacy = row?.value ? JSON.parse(row.value) : {}
    requireApproval = !!Number(legacy.reviews_require_approval ?? 1)
  } catch {}
  const status = requireApproval ? "pending" : "approved"

  try {
    if (parentId) {
      const parent = await svc(req).retrieveAdvancedReview(parentId)
      if (!parent || parent.product_id !== productId) return res.json({ status: "invalid" })
      const replies = [...(parent.metadata?.replies || [])]
      replies.push({ name, email, message, is_admin: false, status, created_at: new Date().toISOString(), ip_address: ip })
      await svc(req).updateAdvancedReviews({ id: parentId, metadata: { ...(parent.metadata || {}), replies } })
    } else {
      await svc(req).createAdvancedReviews({
        product_id: productId,
        guest_name: name,
        guest_email: email,
        rating: rating || 5,
        content: message,
        photos: [],
        status,
        is_verified: false,
        metadata: { title: title || null, helpful: 0, ip_address: ip },
      })
    }
  } catch (e: any) {
    return res.json({ status: "error" })
  }
  res.json({ status: status === "approved" ? "ok" : "pending" })
}
