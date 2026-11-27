import { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import { resolveLegacyPath } from "@lib/data/legacy"
import CmsPageView, { cmsPageMetadata } from "@modules/cms/cms-page-view"

import { getCategoryByHandle } from "@lib/data/categories"
import { getRegion } from "@lib/data/regions"
import { getSiteSettings } from "@lib/data/site-settings"
import { listProducts } from "@lib/data/products"
import { getBrandByPath, getBrandForProduct } from "@lib/data/brands"
import { canonicalUrl } from "@lib/util/seo-url"
import { htmlToText } from "@lib/util/html-text"
import { buildCategoryChain } from "@lib/util/category-path"
import { getBrandPath } from "@lib/util/brand-path"
import { getImagesForVariant } from "@lib/util/product"


import MmDevicePage from "@modules/mm/templates/device"
import { MmBrandArchive, MmCategoryArchive } from "@modules/mm/templates/archive-pages"

// ISR: the shared page shell (product / category / brand) is rendered once
// per path and cached for 5 minutes; the backend revalidation subscriber
// purges tags on admin changes for near-instant freshness.
//
// The three previously-proven ISR blockers are all gone:
//  1. no cookies() anywhere in this render tree (layouts + SDK wrapper are
//     cookie-free; per-user UI hydrates client-side via UserDataProvider)
//  2. searchParams is NEVER awaited on the server — v_id gallery selection
//     and archive filters/sort/pagination are applied client-side
//  3. no `cache: "no-store"` fetch in this tree
export const revalidate = 300
type Props = {
  params: Promise<{ slug: string[]; countryCode: string }>
  // NOTE: searchParams intentionally NOT declared/read — awaiting it marks
  // the route dynamic and 500s ISR (proven via runtime logs).
}

/**
 * Bulletproof Next.js / SWC Compiler tree-shaking workaround.
 * In Next.js, when a page module has multiple split entry points (e.g. generateMetadata,
 * generateStaticParams, default export SlugPage), the compiler can tree-shake top-level
 * imports that are used only in one of the exports, leading to runtime "ReferenceError: X is not defined"
 * crashes. Exporting a constant referencing these imported utilities forces the compiler
 * to bundle and keep the references alive.
 */
export const _nextJsCompilerWorkaround = {
  buildCategoryChain,
  getImagesForVariant,
}

export async function generateStaticParams() {
  // Return empty array to prevent build failures when backend or publishable keys are missing/offline.
  // Routes will resolve dynamically at runtime.
  return []
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const { slug: segments, countryCode } = params
  if (!segments || segments.length === 0) notFound()

  // mymobile.pk URL contract — same decision order as the PHP router.php.
  // Redirects/404s are issued by the page component; metadata stays empty.
  const resolved = await resolveLegacyPath(segments)
  if (resolved.redirect || resolved.kind === "none" || !resolved.handle) return {}
  if (resolved.kind === "page") return cmsPageMetadata(resolved.handle)
  const lastSegment = resolved.handle

  // Filtered/sorted URLs (?spec_*, ?sortBy, ?page …) are noindexed via an
  // X-Robots-Tag header in middleware — query strings are invisible to an
  // ISR render, so robots handling cannot live here anymore.

  // 1. Try Product Match
  const product =
    resolved.kind === "product"
      ? await listProducts({
          countryCode,
          queryParams: { handle: lastSegment, limit: 1 },
        }).then(({ response }) => response.products[0]).catch(() => null)
      : null

  if (product) {
    // Independent lookups — run in parallel (they were sequential, adding
    // 2 extra serialized backend roundtrips to EVERY product page render).
    const [region, settings, productBrand] = await Promise.all([
      getRegion(countryCode),
      getSiteSettings(),
      getBrandForProduct(product.id).catch(() => null),
    ])
    if (!region) notFound()

    const description =
      product.description?.slice(0, 160) ||
      product.subtitle ||
      `Shop ${product.title} at ${settings.site_name || "our store"}.`

    const images = [
      product.thumbnail,
      ...(product.images?.map((i) => i.url) || []),
    ].filter((v): v is string => !!v)

    const seoTitle =
      (product.metadata as any)?.meta_title || (product.metadata as any)?.seo_title || product.title
    const seoDescription =
      (product.metadata as any)?.meta_description || (product.metadata as any)?.seo_description || description

    const { getProductPath } = await import("@lib/util/product")
    const canonical = canonicalUrl(getProductPath(product, productBrand))


    const firstVariant = product.variants?.[0]
    const price = firstVariant?.calculated_price?.calculated_amount
    const currency =
      firstVariant?.calculated_price?.currency_code || region.currency_code
    const gtinForOg =
      (product.metadata as any)?.gtin13 ||
      (product.metadata as any)?.gtin ||
      (firstVariant as any)?.barcode
    const brandForOg =
      (product.metadata as any)?.brand || product.collection?.title

    const ogProduct: Record<string, string> = {
      "og:type": "product",
      ...(price && {
        "product:price:amount": String(price),
        "product:price:currency": (currency || "PKR").toUpperCase(),
      }),
      "product:availability": (product.variants ?? []).some(
        (v: any) =>
          v.allow_backorder ||
          v.manage_inventory === false ||
          (typeof v.inventory_quantity === "number" && v.inventory_quantity > 0)
      )
        ? "in stock"
        : "out of stock",
      "product:condition": "new",
      "product:retailer_item_id": firstVariant?.sku || product.id,
      ...(gtinForOg && { "product:retailer_part_no": String(gtinForOg) }),
      ...(brandForOg && { "product:brand": String(brandForOg) }),
      ...(product.categories?.[0]?.name && {
        "product:category": product.categories[0].name,
      }),
      // Real system timestamps — ensures Google indexes the actual
      // creation/modification dates instead of spec metadata (launch_date).
      ...(product.created_at && {
        "article:published_time": new Date(product.created_at).toISOString(),
        "publish-date": new Date(product.created_at).toISOString(),
        "pubdate": new Date(product.created_at).toISOString(),
        "date": new Date(product.created_at).toISOString(),
      }),
      ...(product.updated_at && {
        "article:modified_time": new Date(product.updated_at).toISOString(),
        "last-modified": new Date(product.updated_at).toISOString(),
        "revised": new Date(product.updated_at).toISOString(),
        "og:updated_time": new Date(product.updated_at).toISOString(),
      }),
    }

    return {
      title: seoTitle,
      description: seoDescription,
      openGraph: {
        title: seoTitle,
        description: seoDescription,
        type: "website",
        url: canonical,
        images: images.slice(0, 4),
      },
      twitter: {
        card: "summary_large_image",
        title: seoTitle,
        description: seoDescription,
        images: images.slice(0, 1),
      },
      alternates: {
        canonical,
      },
      robots: {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
        },
      },
      other: ogProduct,
    }
  }

  // 2. Try Brand Match
  const brandData =
    resolved.kind === "brand" ? await getBrandByPath([lastSegment]).catch(() => null) : null
  if (brandData) {
    const { brand } = brandData
    const settings = await getSiteSettings()
    const siteName = settings.site_name || "Store"
    const title = brand.seo_title || brand.name
    const description =
      brand.seo_description ||
      htmlToText(brand.description, 160) ||
      `Browse all ${brand.name} products at ${siteName}.`
    const url = canonicalUrl(getBrandPath(brand, []))

    return {
      title: brand.seo_title || brand.name,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        url,
        siteName,
        ...(brand.logo_url ? { images: [{ url: brand.logo_url }] } : {}),
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        ...(brand.logo_url ? { images: [brand.logo_url] } : {}),
      },
      alternates: { canonical: url },
      robots: {
        index: true,
        follow: true,
        googleBot: { index: true, follow: true, "max-image-preview": "large" },
      },
    }
  }

  // 3. Try Category Match (/category/{handle}/)
  try {
    if (resolved.kind !== "category") notFound()
    const productCategory = await getCategoryByHandle([lastSegment])
    if (!productCategory) notFound()
    const meta = (productCategory as any).metadata || {}
    const title = meta.meta_title?.trim() || productCategory.name
    const description =
      meta.meta_description?.trim() ||
      productCategory.description ||
      `Shop ${productCategory.name}.`
    const canonical = canonicalUrl(`/category/${lastSegment}/`)
    const ogImage =
      (meta as any).og_image || (productCategory as any).metadata?.image || undefined

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: canonical,
        type: "website",
        ...(ogImage ? { images: [ogImage] } : {}),
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        ...(ogImage ? { images: [ogImage] } : {}),
      },
      alternates: {
        canonical,
      },
      robots: {
        index: true,
        follow: true,
        googleBot: { index: true, follow: true, "max-image-preview": "large" },
      },
    }
  } catch (error) {
    notFound()
  }
}

export default async function SlugPage(props: Props) {
  const params = await props.params
  const { slug: segments, countryCode } = params

  if (!segments || segments.length === 0) notFound()

  // mymobile.pk URL contract (PHP router.php order). Aliases such as
  // /device/x/, /{brand}/x/, /x/, /tag/x/ and legacy flat post URLs 301 to
  // their canonical URL; anything unknown is a real 404.
  const resolved = await resolveLegacyPath(segments)
  if (resolved.redirect) permanentRedirect(resolved.redirect)
  if (resolved.kind === "none" || !resolved.handle) notFound()
  if (resolved.kind === "page") return <CmsPageView handle={resolved.handle} />
  const lastSegment = resolved.handle

  // Only the lookup the resolver chose — no wasted backend round-trips.
  // No `.catch(() => null)` here: the resolver already confirmed the entity
  // exists, so a failed fetch is an outage (→ 500, retried by Google), never
  // a 404 that would de-index a ranking URL.
  const [pricedProduct, brandData, productCategory] = await Promise.all([
    resolved.kind === "product"
      ? listProducts({
          countryCode,
          queryParams: { handle: lastSegment, limit: 1 },
        }).then(({ response }) => response.products[0])
      : null,
    resolved.kind === "brand" ? getBrandByPath([lastSegment]) : null,
    resolved.kind === "category" ? getCategoryByHandle([lastSegment]) : null,
  ])
  const found = pricedProduct || brandData || productCategory
  if (!found) throw new Error(`resolved ${resolved.kind} "${lastSegment}" but lookup returned nothing`)

  if (pricedProduct) {
    // mymobile.pk device page — the PHP device.php design, ported 1:1.
    return <MmDevicePage product={pricedProduct} />
  }

  // 2. Brand archive — PHP brand.php / devices.php design
  if (brandData) {
    return <MmBrandArchive handle={lastSegment} />
  }

  // 3. Device category archive (/category/{handle}/)
  if (productCategory) {
    return <MmCategoryArchive handle={lastSegment} />
  }

  notFound()
}
