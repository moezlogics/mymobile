import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BLOG_MODULE } from "../../../../../modules/blog"

/** GET /store/blog/categories/:handle?limit&offset — blog category + its published posts. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const blog: any = req.scope.resolve(BLOG_MODULE)
  const q = req.query as Record<string, any>
  const limit = Math.min(parseInt(q.limit || "12", 10), 50)
  const offset = parseInt(q.offset || "0", 10)

  const [category] = await blog.listBlogCategories({ handle: req.params.handle }, { take: 1 })
  if (!category) return res.status(404).json({ error: "Category not found" })

  const [posts, count] = await blog.listAndCountBlogPosts(
    { status: "published", categories: { id: category.id } },
    {
      take: limit,
      skip: offset,
      order: { published_at: "DESC" },
      relations: ["categories", "author", "tags"],
    }
  )
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=180")
  res.json({ category, posts, count, limit, offset })
}
