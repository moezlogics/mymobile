import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BLOG_MODULE } from "../../../../../modules/blog"

/** GET /store/blog/tags/:handle?limit&offset — tag + its published posts. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const blog: any = req.scope.resolve(BLOG_MODULE)
  const q = req.query as Record<string, any>
  const limit = Math.min(parseInt(q.limit || "12", 10), 50)
  const offset = parseInt(q.offset || "0", 10)

  const [tag] = await blog.listBlogTags({ handle: req.params.handle }, { take: 1 })
  if (!tag) return res.status(404).json({ error: "Tag not found" })

  const [posts, count] = await blog.listAndCountBlogPosts(
    { status: "published", tags: { id: tag.id } },
    {
      take: limit,
      skip: offset,
      order: { published_at: "DESC" },
      relations: ["categories", "author", "tags"],
    }
  )
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=180")
  res.json({ tag, posts, count, limit, offset })
}
