import { Metadata } from "next"
import Link from "next/link"
import { listBrands } from "@lib/data/brands"
import { getSiteSettings } from "@lib/data/site-settings"
import { canonicalUrl, ROBOTS_INDEX } from "@lib/util/seo-url"
import { formatPrice, mmThumb } from "@modules/mm/lib"
import { devicePrice, getAllDevices } from "@modules/mm/lib/devices"

export const revalidate = 300

/** brands.php — exact legacy title/description. */
export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings()
  const title = s.seo_brands_title?.trim() || "Mobile Brands in Pakistan"
  const description =
    s.seo_brands_description?.trim() ||
    "Browse every mobile phone brand — Samsung, Apple, Xiaomi, Infinix, Tecno and more — with the latest prices and full specifications."
  const url = canonicalUrl("/brands/")
  return {
    title,
    description,
    openGraph: { title, description, type: "website", url, siteName: s.site_name || undefined },
    twitter: { card: "summary_large_image", title, description },
    alternates: { canonical: url },
    robots: ROBOTS_INDEX,
  }
}

export default async function BrandsPage() {
  const [brands, all] = await Promise.all([listBrands(), getAllDevices()])
  const stats = new Map<string, { count: number; min: number | null }>()
  for (const d of all) {
    const h = d.metadata?.brand_handle
    if (!h) continue
    const e = stats.get(h) || { count: 0, min: null }
    e.count++
    const p = devicePrice(d)
    if (p > 0 && (e.min === null || p < e.min)) e.min = p
    stats.set(h, e)
  }
  // ORDER BY is_featured DESC, device_count DESC, name ASC
  const list = (brands as any[])
    .filter((b) => !b.parent_id)
    .map((b) => ({ ...b, count: stats.get(b.handle)?.count || 0, min: stats.get(b.handle)?.min ?? null }))
    .sort(
      (a, b) =>
        Number(!!b.metadata?.is_featured) - Number(!!a.metadata?.is_featured) || b.count - a.count || a.name.localeCompare(b.name)
    )
  const featured = list.filter((b) => b.metadata?.is_featured)

  return (
    <div className="sp-container">
      <nav className="sp-crumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link> <span>/</span> <span>Brands</span>
      </nav>

      <div className="sp-sec">
        <h2 style={{ fontSize: "1.35rem" }}>All Mobile Brands</h2>
      </div>

      {featured.length > 0 && (
        <>
          <div className="sp-sec">
            <h2>Featured Brands</h2>
          </div>
          <div className="brand-strip brand-strip-featured" style={{ marginBottom: 26 }}>
            {featured.map((b) => (
              <Link className="brand-tile" href={`/${b.handle}/`} key={b.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {b.logo_url && <img src={mmThumb(b.logo_url, 160)} alt={b.name} loading="lazy" width={74} height={26} />}
                <span>{b.name}</span>
                <small>
                  {b.count} phone{b.count === 1 ? "" : "s"}
                </small>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="sp-sec">
        <h2>Browse All Brands</h2>
      </div>
      <div className="brand-directory-grid">
        {list.map((b) => (
          <Link className="brand-directory-card" href={`/${b.handle}/`} key={b.id}>
            <span className="brand-directory-logo">
              {b.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mmThumb(b.logo_url, 160)} alt={`${b.name} phones`} loading="lazy" width={72} height={72} />
              ) : (
                <span className="brand-directory-fallback">{b.name.slice(0, 1)}</span>
              )}
            </span>
            <span className="brand-directory-copy">
              <span className="brand-directory-name">{b.name}</span>
              <span className="brand-directory-meta">
                {b.count} device{b.count === 1 ? "" : "s"}
                {b.min ? ` · from ${formatPrice(b.min)}` : ""}
              </span>
            </span>
          </Link>
        ))}
      </div>

      {list.length === 0 && (
        <div className="sp-empty">
          <h3>No brands yet</h3>
          <p>Add brands from the admin panel.</p>
        </div>
      )}
    </div>
  )
}
