const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:3092"
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

/**
 * Medusa V2 enforces an `x-publishable-api-key` header on every store
 * route — without it the backend returns 400. The blog endpoints are
 * exposed under `/store/blog/...` so they need the same key any other
 * storefront fetch uses.
 */
const STORE_HEADERS: Record<string, string> = PUBLISHABLE_KEY
  ? { "x-publishable-api-key": PUBLISHABLE_KEY }
  : {}

export type BlogPost = {
  id: string
  title: string
  handle: string
  excerpt: string | null
  content: string | null
  featured_image: string | null
  featured_image_alt: string | null
  status: "draft" | "published"
  published_at: string | null
  seo_title: string | null
  seo_description: string | null
  seo_keywords: string | null
  categories: BlogCategory[]
  tags?: BlogTag[]
  author?: BlogAuthor | null
  metadata?: Record<string, any> | null
  created_at: string
  updated_at: string
}

export type BlogCategory = {
  id: string
  name: string
  handle: string
  description: string | null
  seo_title?: string | null
  seo_description?: string | null
  metadata?: Record<string, any> | null
}

export type BlogTag = {
  id: string
  name: string
  handle: string
  description: string | null
  seo_title?: string | null
  seo_description?: string | null
}

/**
 * Canonical blog post path — mymobile.pk `get_post_link()`:
 *   /blog/{primary-category}/{slug}/   when the post has a primary category
 *   /blog/{slug}/                      otherwise
 */
export function postPath(post: Pick<BlogPost, "handle" | "metadata" | "categories">): string {
  const primary =
    (post.metadata as any)?.primary_category_handle || post.categories?.[0]?.handle || null
  return primary ? `/blog/${primary}/${post.handle}/` : `/blog/${post.handle}/`
}

export type BlogAuthor = {
  id: string
  name: string
  handle: string
  role: string | null
  bio: string | null
  avatar_url: string | null
  email: string | null
  expertise: string | null
  twitter_url: string | null
  linkedin_url: string | null
  facebook_url: string | null
  website_url: string | null
}

/**
 * Fetch published blog posts from the Medusa store API.
 * Supports pagination, search, and category filtering.
 */
export async function listBlogPosts(params?: {
  limit?: number
  offset?: number
  q?: string
  category?: string
}): Promise<{ posts: BlogPost[]; count: number }> {
  const searchParams = new URLSearchParams()
  if (params?.limit) searchParams.set("limit", String(params.limit))
  if (params?.offset) searchParams.set("offset", String(params.offset))
  if (params?.q) searchParams.set("q", params.q)
  if (params?.category) searchParams.set("category", params.category)

  const qs = searchParams.toString()
  const res = await fetch(
    `${BACKEND_URL}/store/blog/posts${qs ? `?${qs}` : ""}`,
    {
      headers: STORE_HEADERS,
      next: { revalidate: 60, tags: ["blog"] },
      cache: "force-cache",
    }
  )

  if (!res.ok) {
    console.error("[Blog] Failed to fetch posts:", res.status)
    return { posts: [], count: 0 }
  }

  return res.json()
}

/**
 * Fetch a single published blog post by handle.
 */
export async function getBlogPostByHandle(
  handle: string
): Promise<BlogPost | null> {
  const res = await fetch(
    `${BACKEND_URL}/store/blog/posts/${encodeURIComponent(handle)}`,
    {
      headers: STORE_HEADERS,
      next: { revalidate: 60, tags: ["blog"] },
      cache: "force-cache",
    }
  )

  // 404 = no such post; any other failure is an outage and must not become
  // a 404 (that would de-index a ranking article) — throw → 500 instead.
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`blog post fetch failed: HTTP ${res.status}`)

  const data = await res.json()
  return data.post || null
}

/**
 * Fetch a single author profile + their published posts (author archive).
 */
export async function getBlogAuthorByHandle(
  handle: string
): Promise<{ author: BlogAuthor; posts: BlogPost[] } | null> {
  const res = await fetch(
    `${BACKEND_URL}/store/blog/authors/${encodeURIComponent(handle)}`,
    {
      headers: STORE_HEADERS,
      next: { revalidate: 60, tags: ["blog"] },
      cache: "force-cache",
    }
  )

  if (res.status === 404) return null
  if (!res.ok) throw new Error(`blog author fetch failed: HTTP ${res.status}`)

  const data = await res.json()
  if (!data.author) return null
  return { author: data.author, posts: data.posts || [] }
}

/**
 * Fetch all blog categories for filter chips.
 */
export async function listBlogCategories(): Promise<BlogCategory[]> {
  const res = await fetch(`${BACKEND_URL}/store/blog/categories`, {
    headers: STORE_HEADERS,
    next: { revalidate: 300, tags: ["blog"] },
    cache: "force-cache",
  })

  if (!res.ok) return []

  const data = await res.json()
  return data.categories || []
}

type ArchivePage<K extends string, T> = { [key in K]: T } & { posts: BlogPost[]; count: number }

/** Blog category archive (/blog/category/{handle}/). */
export async function getBlogCategoryArchive(
  handle: string,
  params?: { limit?: number; offset?: number }
): Promise<ArchivePage<"category", BlogCategory> | null> {
  const qs = new URLSearchParams({ limit: String(params?.limit ?? 12), offset: String(params?.offset ?? 0) })
  const res = await fetch(`${BACKEND_URL}/store/blog/categories/${encodeURIComponent(handle)}?${qs}`, {
    headers: STORE_HEADERS,
    next: { revalidate: 60, tags: ["blog"] },
    cache: "force-cache",
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`blog archive fetch failed: HTTP ${res.status}`)
  return res.json()
}

/** Blog tag archive (/blog/tag/{handle}/). */
export async function getBlogTagArchive(
  handle: string,
  params?: { limit?: number; offset?: number }
): Promise<ArchivePage<"tag", BlogTag> | null> {
  const qs = new URLSearchParams({ limit: String(params?.limit ?? 12), offset: String(params?.offset ?? 0) })
  const res = await fetch(`${BACKEND_URL}/store/blog/tags/${encodeURIComponent(handle)}?${qs}`, {
    headers: STORE_HEADERS,
    next: { revalidate: 60, tags: ["blog"] },
    cache: "force-cache",
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`blog archive fetch failed: HTTP ${res.status}`)
  return res.json()
}

export type BlogComment = {
  id: string
  parent_id: string | null
  name: string
  content: string
  is_admin: boolean
  created_at: string
}

export async function listBlogComments(handle: string): Promise<BlogComment[]> {
  const res = await fetch(`${BACKEND_URL}/store/blog/posts/${encodeURIComponent(handle)}/comments`, {
    headers: STORE_HEADERS,
    next: { revalidate: 60, tags: ["blog-comments"] },
    cache: "force-cache",
  })
  if (!res.ok) return []
  return (await res.json()).comments || []
}
