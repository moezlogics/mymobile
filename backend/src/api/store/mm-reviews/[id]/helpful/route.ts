import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/** POST /store/mm-reviews/:id/helpful → { ok, count } (PHP review_helpful.php) */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const svc: any = req.scope.resolve("advanced_reviews")
  try {
    const r = await svc.retrieveAdvancedReview(req.params.id)
    if (!r || r.status !== "approved") return res.json({ ok: false })
    const count = (Number(r.metadata?.helpful) || 0) + 1
    await svc.updateAdvancedReviews({ id: r.id, metadata: { ...(r.metadata || {}), helpful: count } })
    res.json({ ok: true, count })
  } catch {
    res.json({ ok: false })
  }
}
