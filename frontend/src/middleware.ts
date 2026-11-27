  import { NextRequest, NextResponse } from "next/server"

  const BACKEND_URL = process.env.MEDUSA_BACKEND_URL
  const PUBLISHABLE_API_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  const DEFAULT_REGION = process.env.NEXT_PUBLIC_DEFAULT_REGION || "pk"

  /**
   * Middleware to always serve Pakistan (pk) region without showing
   * country code in the URL. All requests are internally rewritten
   * to /pk/... but the browser URL stays clean.
   *
   * Routes that live OUTSIDE the `[countryCode]` segment must skip the
   * rewrite — otherwise Next.js looks for them under
   * `app/[countryCode]/.../page.tsx` (where they don't exist) and 404s.
   * That includes:
   *   - /api/*           (route handlers + Meilisearch proxy)
   *   - /auth/*          (Google OAuth callback page)
   *   - /sitemap.xml     (root metadata route)
   *   - /robots.txt      (root metadata route)
   */
  const SKIP_PREFIXES = ["/api", "/auth", "/sitemap", "/sitemap.xml", "/robots"]

  export async function middleware(request: NextRequest) {
    const { pathname, search, origin } = request.nextUrl

    // Fix Next.js trailingSlash bug for dynamic sitemap chunks (e.g., /sitemap/1.xml)
    // Rewriting to the slashed version internally matches Next.js's trailingSlash router without causing infinite loops.
    if (pathname.startsWith("/sitemap/") && pathname.endsWith(".xml")) {
      return NextResponse.rewrite(new URL(`${pathname}/${search}`, origin))
    }

    // ── mymobile.pk legacy PHP endpoints that need a lookup ───────────────
    // /thumb.php?src=images/x.webp&w=200 → the original image (301)
    if (pathname === "/thumb.php") {
      const src = (request.nextUrl.searchParams.get("src") || "").replace(/^\/+/, "")
      if (/^(images|cache\/img)\/[\w.-]+$/i.test(src)) {
        return NextResponse.redirect(new URL(`/${src}`, origin), 301)
      }
      return NextResponse.redirect(new URL("/", origin), 301)
    }
    // Legacy *.php?param=slug entry points → clean canonical URL (no query).
    const SLUG = /^[a-z0-9][a-z0-9-]{0,200}$/i
    const qp = request.nextUrl.searchParams
    const phpMap: Record<string, [string, (s: string) => string][]> = {
      "/device.php": [["device_slug", (s) => `/products/${s}/`], ["slug", (s) => `/products/${s}/`]],
      "/category.php": [["category_slug", (s) => `/category/${s}/`]],
      "/brand.php": [["brand_slug", (s) => `/${s}/`]],
      "/page.php": [["slug", (s) => `/${s}/`]],
      "/archive.php": [
        ["category", (s) => `/blog/category/${s}/`],
        ["tag", (s) => `/blog/tag/${s}/`],
        ["author", (s) => `/blog/author/${s}/`],
      ],
    }
    if (phpMap[pathname]) {
      for (const [key, to] of phpMap[pathname]) {
        const v = (qp.get(key) || "").trim().toLowerCase()
        if (SLUG.test(v)) return NextResponse.redirect(new URL(to(v), origin), 301)
      }
      return NextResponse.redirect(new URL("/", origin), 301)
    }

    // /single.php?id=N → /blog/{cat}/{slug}/ (301), as PHP router did.
    if (pathname === "/single.php") {
      const id = request.nextUrl.searchParams.get("id") || ""
      const slug = request.nextUrl.searchParams.get("slug") || ""
      try {
        const qs = /^\d+$/.test(id) ? `post_id=${id}` : `path=${encodeURIComponent(slug)}`
        const r = await fetch(`${BACKEND_URL}/store/legacy/resolve?${qs}`, {
          headers: PUBLISHABLE_API_KEY ? { "x-publishable-api-key": PUBLISHABLE_API_KEY } : {},
        })
        const data = r.ok ? await r.json() : null
        if (data?.redirect) return NextResponse.redirect(new URL(data.redirect, origin), 301)
      } catch {}
      return NextResponse.redirect(new URL("/blog/", origin), 301)
    }

    // Skip static assets (anything with a file extension)
    if (pathname.includes(".")) {
      return NextResponse.next()
    }

    // Skip root-level routes that aren't inside `[countryCode]`
    if (SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return NextResponse.next()
    }

    // If the path already starts with /pk (internal rewrite loop guard), pass through
    if (pathname.startsWith(`/${DEFAULT_REGION}`)) {
      return NextResponse.next()
    }

    // ── mymobile.pk listings with query params (filters/sort/page/search) ──
    // The clean archive (/samsung/, /category/x/) is ISR-cached and cannot
    // see the query string, so requests that carry listing params go to a
    // dynamic route instead. URL in the browser is unchanged.
    const LISTING_KEY = /^(q|search|min_price|max_price|availability|sort|page|category|type|brand\[\]|spec\[[a-z0-9_]+\]\[\])$/i
    const hasListingParams = [...request.nextUrl.searchParams.keys()].some((k) => LISTING_KEY.test(k))
    const listingPath = /^\/(?:mobiles|category\/[a-z0-9-]+|[a-z0-9-]+)\/$/i.test(pathname)
    const NOT_LISTING = /^\/(blog|brands|compare|cart|checkout|account|order|store|collections|categories|refund-policy|auth|api)\//i
    if (hasListingParams && listingPath && !NOT_LISTING.test(pathname)) {
      const u = new URL(`/${DEFAULT_REGION}/mm-listing/`, origin)
      u.searchParams.set("__path", pathname)
      request.nextUrl.searchParams.forEach((v, k) => u.searchParams.append(k, v))
      const res = NextResponse.rewrite(u)
      res.headers.set("X-Robots-Tag", "noindex, follow")
      return res
    }

    // Rewrite internally to /pk/... — URL in browser stays the same.
    // Under trailingSlash: true, "/" rewrites to "/pk/" to keep trailing slash consistency.
    const rewriteUrl = new URL(
      `/${DEFAULT_REGION}${pathname}${search}`,
      origin
    )

    const response = NextResponse.rewrite(rewriteUrl)

    // ── CDN caching for anonymous catalog traffic ──────────────────────
    // Next marks every dynamic page `private, no-store`, so Cloudflare
    // (Cf-Cache-Status: DYNAMIC) re-renders on the server for EVERY first
    // visit — that's the slow "first response". For visitors with no
    // session and no cart (the vast majority of first-time mobile traffic)
    // the page is user-independent, so let the CDN hold it.
    const isUserBound =
      request.cookies.get("_medusa_jwt") || request.cookies.get("_medusa_cart_id")
    const isPrivatePath = ["/account", "/cart", "/checkout", "/order", "/compare"].some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    )
    const cacheableAnon =
      request.method === "GET" && !isUserBound && !isPrivatePath

    if (cacheableAnon) {
      // CRITICAL: do NOT set ANY cookie here. Cloudflare refuses to cache
      // a response that carries `Set-Cookie` (it returns Cf-Cache-Status:
      // BYPASS) — which is exactly why the HTML was never edge-cached and
      // every first response hit the origin. An anonymous visitor doesn't
      // need the per-user `_medusa_cache_id` (catalog data is global), so
      // we skip it here to keep the response cookie-free + CDN-cacheable.
      response.headers.set(
        "Cache-Control",
        "public, max-age=0, s-maxage=300, stale-while-revalidate=86400"
      )
    } else {
      // User-bound / private / non-GET request: set the per-user cache-id
      // for scoped fetch-cache tagging (these responses are never CDN-cached
      // anyway, so the Set-Cookie is harmless here).
      if (!request.cookies.get("_medusa_cache_id")) {
        response.cookies.set("_medusa_cache_id", crypto.randomUUID(), {
          maxAge: 60 * 60 * 24,
        })
      }
    }

    // Filtered/sorted archive URLs (?spec_*, ?sortBy, ?page …) must not be
  // indexed — ISR pages can't read searchParams server-side, so robots
  // handling lives here where the query string is always visible.
  const FILTER_KEYS = new Set(["sortBy", "page", "minPrice", "maxPrice", "inStock", "upcoming"])
  const hasFilterParams = [...request.nextUrl.searchParams.entries()].some(
    ([key, val]) => !!val && (key.startsWith("spec_") || FILTER_KEYS.has(key))
  )
  if (hasFilterParams) {
    response.headers.set("X-Robots-Tag", "noindex, follow")
  }

  return response
  }

  export const config = {
    matcher: [
      "/((?!api|auth|robots|_next/static|_next/image|favicon.ico|images|assets|png|svg|jpg|jpeg|gif|webp).*)",
    ],
  }
