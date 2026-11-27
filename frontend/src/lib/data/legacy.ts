import "server-only"

const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:3102"
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""
const HEADERS: Record<string, string> = PUBLISHABLE_KEY ? { "x-publishable-api-key": PUBLISHABLE_KEY } : {}

export type LegacyResolution = {
  kind: "page" | "brand" | "product" | "category" | "blog-category" | "post" | "tag" | "author" | "none"
  handle?: string
  /** Site path (with trailing slash) the URL must permanently redirect to. */
  redirect?: string
}

/**
 * Ask the backend what a 1–2 segment URL means, using the same decision
 * order as the PHP router.php. See backend /store/legacy/resolve.
 */
export async function resolveLegacyPath(segments: string[]): Promise<LegacyResolution> {
  if (!segments?.length || segments.length > 2) return { kind: "none" }
  // IMPORTANT: a backend outage must NOT turn into a 404 — Google drops 404
  // URLs from the index, while a 5xx is treated as temporary. So network
  // errors / non-2xx responses THROW (→ error page with 500), and only an
  // explicit `{ kind: "none" }` from the backend produces notFound().
  const res = await fetch(
    `${BACKEND_URL}/store/legacy/resolve?path=${encodeURIComponent(segments.join("/"))}`,
    { headers: HEADERS, next: { revalidate: 300, tags: ["legacy-resolve"] }, cache: "force-cache" }
  )
  if (!res.ok) throw new Error(`legacy resolve failed: HTTP ${res.status}`)
  return (await res.json()) as LegacyResolution
}

export type CmsPage = {
  id: string
  title: string
  handle: string
  subtitle: string | null
  content: string | null
  seo_title: string | null
  seo_description: string | null
  metadata: Record<string, any> | null
  created_at: string
  updated_at: string
}

export async function getCmsPage(handle: string): Promise<CmsPage | null> {
  const res = await fetch(`${BACKEND_URL}/store/pages/${encodeURIComponent(handle)}`, {
    headers: HEADERS,
    next: { revalidate: 300, tags: ["cms-pages"] },
    cache: "force-cache",
  })
  if (res.status === 404) return null
  // Outage ≠ missing page (see resolveLegacyPath).
  if (!res.ok) throw new Error(`cms page fetch failed: HTTP ${res.status}`)
  return (await res.json()).page ?? null
}

export async function listCmsPages(): Promise<Pick<CmsPage, "id" | "title" | "handle" | "updated_at" | "metadata">[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/store/pages`, {
      headers: HEADERS,
      next: { revalidate: 300, tags: ["cms-pages"] },
      cache: "force-cache",
    })
    if (!res.ok) return []
    return (await res.json()).pages ?? []
  } catch {
    return []
  }
}
