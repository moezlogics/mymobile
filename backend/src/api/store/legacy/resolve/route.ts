import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BLOG_MODULE } from "../../../../modules/blog"

/**
 * GET /store/legacy/resolve?path=a/b
 *
 * One round-trip answer to "what does this mymobile.pk URL point at?" —
 * mirrors the PHP router.php decision order so the Next catch-all can render
 * or 301 exactly like the old site did:
 *
 *   1 segment  : cms page → brand → product (301 /products/x/) →
 *                blog category (301 /blog/category/x/) → blog post (301) →
 *                tag (301 /blog/tag/x/)
 *   2 segments : products/x → product · category/x → product category ·
 *                device/x | {brand}/x → product (301) · tag|author/x (301) ·
 *                {anything}/{post} → blog post (301)
 *
 * Response: { kind, handle?, redirect? } — `redirect` is a site path with a
 * trailing slash when the URL must 301.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const raw = String((req.query as any).path || "")
  const seg = raw
    .split("/")
    .map((s) => decodeURIComponent(s).trim().toLowerCase())
    .filter(Boolean)
  const pg: any = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const blog: any = req.scope.resolve(BLOG_MODULE)

  const one = async (sql: string, params: any[]) => (await pg.raw(sql, params)).rows[0] || null
  const product = (h: string) =>
    one(`select handle from product where handle = ? and deleted_at is null and status = 'published' limit 1`, [h])
  const brand = (h: string) =>
    one(`select handle from brand where handle = ? and deleted_at is null and is_active = true limit 1`, [h])
  const productCategory = (h: string) =>
    one(
      `select handle from product_category where handle = ? and deleted_at is null and is_active = true and is_internal = false limit 1`,
      [h]
    )
  const postUrl = async (h: string) => {
    const [p] = await blog.listBlogPosts({ handle: h, status: "published" }, { take: 1 })
    if (!p) return null
    const primary = (p.metadata as any)?.primary_category_handle
    return primary ? `/blog/${primary}/${p.handle}/` : `/blog/${p.handle}/`
  }

  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300")
  const send = (body: Record<string, any>) => res.json(body)

  // /single.php?id=N (pre-permalink post URLs) → legacy numeric post id.
  const legacyPostId = parseInt(String((req.query as any).post_id || ""), 10)
  if (Number.isFinite(legacyPostId) && legacyPostId > 0) {
    const row = await one(
      `select handle, metadata->>'primary_category_handle' as cat from blog_post
       where deleted_at is null and status = 'published' and (metadata->>'legacy_id')::int = ? limit 1`,
      [legacyPostId]
    )
    if (!row) return send({ kind: "none" })
    return send({ kind: "post", handle: row.handle, redirect: row.cat ? `/blog/${row.cat}/${row.handle}/` : `/blog/${row.handle}/` })
  }

  if (seg.length === 1) {
    const [s] = seg
    const [page] = await blog.listCmsPages({ handle: s, status: "published" }, { take: 1 })
    if (page) return send({ kind: "page", handle: s })
    if (await brand(s)) return send({ kind: "brand", handle: s })
    if (await product(s)) return send({ kind: "product", handle: s, redirect: `/products/${s}/` })
    const [bcat] = await blog.listBlogCategories({ handle: s }, { take: 1 })
    if (bcat) return send({ kind: "blog-category", handle: s, redirect: `/blog/category/${s}/` })
    const pu = await postUrl(s)
    if (pu) return send({ kind: "post", handle: s, redirect: pu })
    const [tag] = await blog.listBlogTags({ handle: s }, { take: 1 })
    if (tag) return send({ kind: "tag", handle: s, redirect: `/blog/tag/${s}/` })
    return send({ kind: "none" })
  }

  if (seg.length === 2) {
    const [a, b] = seg
    if (a === "products") {
      return send((await product(b)) ? { kind: "product", handle: b } : { kind: "none" })
    }
    if (a === "category") {
      return send((await productCategory(b)) ? { kind: "category", handle: b } : { kind: "none" })
    }
    if (a === "tag") return send({ kind: "tag", handle: b, redirect: `/blog/tag/${b}/` })
    if (a === "author") return send({ kind: "author", handle: b, redirect: `/blog/author/${b}/` })
    if ((a === "device" || (await brand(a))) && (await product(b))) {
      return send({ kind: "product", handle: b, redirect: `/products/${b}/` })
    }
    const pu = await postUrl(b)
    if (pu) return send({ kind: "post", handle: b, redirect: pu })
    return send({ kind: "none" })
  }

  return send({ kind: "none" })
}
