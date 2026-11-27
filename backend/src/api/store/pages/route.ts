import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BLOG_MODULE } from "../../../modules/blog"

/** GET /store/pages — published CMS pages (handle/title/updated_at) for sitemap + footer. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const blog: any = req.scope.resolve(BLOG_MODULE)
  const pages = await blog.listCmsPages(
    { status: "published" },
    { select: ["id", "title", "handle", "updated_at", "metadata"], order: { title: "ASC" } }
  )
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300")
  res.json({ pages })
}
