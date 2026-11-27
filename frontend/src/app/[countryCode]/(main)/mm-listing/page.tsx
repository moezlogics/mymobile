import { Metadata } from "next"
import { notFound } from "next/navigation"
import { resolveLegacyPath } from "@lib/data/legacy"
import { canonicalUrl } from "@lib/util/seo-url"
import { MmBrandArchive, MmCategoryArchive, MmSearchResults } from "@modules/mm/templates/archive-pages"
import { getBrandByPath } from "@lib/data/brands"
import { getCategoryByHandle } from "@lib/data/categories"
import { getSiteSettings } from "@lib/data/site-settings"

/**
 * Filtered / sorted / paginated / searched listing URLs
 * (e.g. /samsung/?spec[ram][]=8GB&sort=price_asc, /mobiles/?q=galaxy).
 *
 * The middleware rewrites ONLY requests that carry listing query params here
 * (as ?__path=/samsung/&…); the bare archive URL stays on the ISR-cached
 * catch-all. Like the PHP devices.php, these variants are noindex,follow and
 * canonicalise to the clean archive (search → home).
 */
export const dynamic = "force-dynamic"

type Props = { searchParams: Promise<Record<string, string | string[]>> }

const target = async (sp: Record<string, string | string[]>) => {
  const path = String(Array.isArray(sp.__path) ? sp.__path[0] : sp.__path || "/")
  const seg = path.split("/").filter(Boolean)
  const params: Record<string, string | string[]> = { ...sp }
  delete params.__path
  if (seg.length === 1 && seg[0] === "mobiles") return { kind: "search" as const, params, path: "/mobiles/" }
  if (seg.length === 2 && seg[0] === "category") return { kind: "category" as const, handle: seg[1], params, path }
  if (seg.length === 1) {
    const r = await resolveLegacyPath(seg)
    if (r.kind === "brand") return { kind: "brand" as const, handle: seg[0], params, path }
  }
  return null
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const t = await target(await props.searchParams)
  if (!t) return {}
  const s = await getSiteSettings()
  const robots = { index: false, follow: true }
  if (t.kind === "search") {
    const q = String(t.params.q || t.params.search || "").trim()
    return {
      title: q ? `Search: ${q} | ${s.site_name || ""}` : `All Mobile Phones — Prices & Full Specifications | ${s.site_name || ""}`,
      robots,
      alternates: { canonical: canonicalUrl("/") },
    }
  }
  if (t.kind === "brand") {
    const b: any = (await getBrandByPath([t.handle!]))?.brand
    return { title: b?.seo_title || b?.name, description: b?.seo_description || undefined, robots, alternates: { canonical: canonicalUrl(t.path) } }
  }
  const c: any = await getCategoryByHandle([t.handle!])
  return {
    title: c?.metadata?.meta_title || c?.name,
    description: c?.metadata?.meta_description || undefined,
    robots,
    alternates: { canonical: canonicalUrl(t.path) },
  }
}

export default async function MmListingPage(props: Props) {
  const t = await target(await props.searchParams)
  if (!t) notFound()
  if (t.kind === "search") return <MmSearchResults params={t.params} />
  if (t.kind === "brand") return <MmBrandArchive handle={t.handle!} params={t.params} />
  return <MmCategoryArchive handle={t.handle!} params={t.params} />
}
