import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BLOG_MODULE } from "../../../../modules/blog"

/** GET /store/pages/:handle — published CMS page (about-us, privacy-policy …). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const blog: any = req.scope.resolve(BLOG_MODULE)
  const [page] = await blog.listCmsPages(
    { handle: req.params.handle, status: "published" },
    { take: 1 }
  )
  if (!page) return res.status(404).json({ error: "Page not found" })
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300")
  res.json({ page })
}
