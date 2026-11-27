import { NextResponse } from "next/server"
import { blogItemHtml, getAllPosts } from "@modules/mm/lib/blog"
const BLOG_PER_PAGE = 15 // blog.php / archive.php $limit

/**
 * GET /api/mm/blog?kind=all|category|tag|author&handle=x&page=N
 * Infinite-scroll batches for /blog/ and the blog archives (PHP ?load_more=1).
 */
export async function GET(req: Request) {
  const u = new URL(req.url)
  const kind = u.searchParams.get("kind") || "all"
  const handle = u.searchParams.get("handle") || ""
  const page = Math.max(1, Number(u.searchParams.get("page")) || 1)
  let list = await getAllPosts()
  if (kind === "category") list = list.filter((p) => p.categories?.some((c) => c.handle === handle))
  else if (kind === "tag") list = list.filter((p) => p.tags?.some((t) => t.handle === handle))
  else if (kind === "author") list = list.filter((p) => p.author?.handle === handle)
  const pages = Math.max(1, Math.ceil(list.length / BLOG_PER_PAGE))
  const html = list.slice((page - 1) * BLOG_PER_PAGE, page * BLOG_PER_PAGE).map(blogItemHtml).join("")
  const base = kind === "all" ? "/blog/" : `/blog/${kind}/${handle}/`
  return NextResponse.json(
    { html, next_url: page < pages ? `${base}?page=${page + 1}` : null },
    { headers: { "X-Robots-Tag": "noindex", "Cache-Control": "public, max-age=60" } }
  )
}
