import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BLOG_MODULE } from "../../../../../../modules/blog"

/**
 * GET  /store/blog/posts/:handle/comments — approved comments (threaded via parent_id)
 * POST /store/blog/posts/:handle/comments — { name, email?, content, parent_id? } → pending
 */
async function findPost(blog: any, handle: string) {
  const [post] = await blog.listBlogPosts({ handle, status: "published" }, { take: 1, select: ["id"] })
  return post || null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const blog: any = req.scope.resolve(BLOG_MODULE)
  const post = await findPost(blog, req.params.handle)
  if (!post) return res.status(404).json({ error: "Post not found" })
  const comments = await blog.listBlogComments(
    { post_id: post.id, status: "approved" },
    {
      select: ["id", "parent_id", "name", "content", "is_admin", "created_at"],
      order: { created_at: "ASC" },
    }
  )
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120")
  res.json({ comments })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const blog: any = req.scope.resolve(BLOG_MODULE)
  const post = await findPost(blog, req.params.handle)
  if (!post) return res.status(404).json({ error: "Post not found" })

  const body = (req.body || {}) as Record<string, any>
  const name = String(body.name || "").trim().slice(0, 120)
  const content = String(body.content || "").trim().slice(0, 5000)
  const email = String(body.email || "").trim().slice(0, 190) || null
  if (name.length < 2 || content.length < 3) {
    return res.status(400).json({ error: "Name and comment are required." })
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email." })
  }
  // Honeypot — bots fill every field.
  if (body.website) return res.json({ ok: true, pending: true })

  let parent_id: string | null = null
  if (body.parent_id) {
    const [parent] = await blog.listBlogComments({ id: String(body.parent_id), post_id: post.id }, { take: 1 })
    parent_id = parent ? parent.id : null
  }

  const ip = String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim() || null

  // Same identical comment from the same IP in the last 30s → duplicate (PHP rule)
  const recent = await blog.listBlogComments(
    { post_id: post.id, ip_address: ip, content },
    { take: 1, order: { created_at: "DESC" } }
  )
  if (recent[0] && Date.now() - new Date(recent[0].created_at).getTime() < 30_000) {
    return res.json({ ok: false, duplicate: true })
  }

  // mymobile.pk published comments straight away (after moderation). Link-
  // stuffed comments are held for review instead of going live.
  const linkCount = (content.match(/https?:\/\//gi) || []).length
  const status = linkCount > 2 ? "pending" : "approved"

  await blog.createBlogComments({
    post_id: post.id,
    parent_id,
    name,
    email,
    content,
    status,
    ip_address: ip,
  })
  res.json({ ok: true, pending: status === "pending" })
}
