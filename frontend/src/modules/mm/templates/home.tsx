import Link from "next/link"
import { listBrands } from "@lib/data/brands"
import { listBlogPosts, postPath } from "@lib/data/blog"
import { canonicalUrl } from "@lib/util/seo-url"
import { getMmSettings, formatPrice, mmThumb, mmImage } from "@modules/mm/lib"
import {
  MmDevice,
  devicePrice,
  getAllDevices,
  getSpecTemplate,
  sortLatest,
  sortTrending,
  specFacet,
} from "@modules/mm/lib/devices"
import { getHomeSections, homeSectionDevices, homeSectionLink } from "@modules/mm/lib/home"
import DeviceCard from "@modules/mm/components/device-card"
import KnAd from "@modules/mm/components/kn-ad"
import LegacyScript from "@modules/mm/components/legacy-script"
import BrandNavButton from "@modules/mm/components/brand-nav-button"
import { BRAND_STRIP_JS, HOME_FILTERS_JS, HOME_INFINITE_JS, PAIRS_SHUFFLE_JS } from "@modules/mm/scripts/home"

/** RAM-based auto-categories duplicate the RAM facet — hidden like on PHP. */
const HIDDEN_CATS = new Set(["2-gb-ram", "3-gb-ram", "4-gb-ram", "6-gb-ram", "8-gb-ram", "12-gb-ram", "16-gb-ram"])
const HOME_SPEC_PRIORITY = ["ram", "storage", "refresh_rate", "battery", "camera_main_mp"]

const Chev = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
)

/** fetch_popular_compare_pairs() */
export function popularPairs(all: MmDevice[], limit = 12): [MmDevice, MmDevice][] {
  const pool = [...all]
    .filter((d) => devicePrice(d) > 0)
    .sort(
      (a, b) =>
        (Number(b.metadata?.views) || 0) - (Number(a.metadata?.views) || 0) ||
        (Number(b.metadata?.rating_count) || 0) - (Number(a.metadata?.rating_count) || 0) ||
        (Number(b.metadata?.legacy_id) || 0) - (Number(a.metadata?.legacy_id) || 0)
    )
    .slice(0, 36)
    .sort((a, b) => devicePrice(a) - devicePrice(b))
  const out: [MmDevice, MmDevice][] = []
  const seen = new Set<string>()
  const add = (a: MmDevice, b: MmDevice) => {
    if (out.length >= limit || a.handle === b.handle) return
    const key = [a.handle, b.handle].sort().join("|")
    if (seen.has(key)) return
    seen.add(key)
    out.push([a, b])
  }
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < Math.min(pool.length, i + 5); j++) {
      const p1 = Math.max(1, devicePrice(pool[i]))
      const p2 = Math.max(1, devicePrice(pool[j]))
      if (Math.abs(p1 - p2) / Math.max(p1, p2) <= 0.28) add(pool[i], pool[j])
    }
  }
  if (out.length < limit) for (let i = 0; i < pool.length - 1; i++) add(pool[i], pool[i + 1])
  return out
}

export default async function MmHome() {
  const [{ s, legacy }, all, brands, template, sections, postsRes] = await Promise.all([
    getMmSettings(),
    getAllDevices(),
    listBrands().catch(() => []),
    getSpecTemplate().catch(() => []),
    getHomeSections(),
    listBlogPosts({ limit: 4 }).catch(() => ({ posts: [], count: 0 })),
  ])

  // ── brand strip: brands with devices (or featured), featured → count → sort
  const counts = new Map<string, number>()
  for (const d of all) {
    const h = d.metadata?.brand_handle
    if (h) counts.set(h, (counts.get(h) || 0) + 1)
  }
  const stripBrands = (brands as any[])
    .filter((b) => b.is_active !== false && ((counts.get(b.handle) || 0) > 0 || b.metadata?.is_featured))
    .sort(
      (a, b) =>
        Number(!!b.metadata?.is_featured) - Number(!!a.metadata?.is_featured) ||
        (counts.get(b.handle) || 0) - (counts.get(a.handle) || 0) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0)
    )
    .slice(0, 18)

  // ── quick filters
  const catCounts = new Map<string, { name: string; slug: string; c: number }>()
  for (const d of all)
    for (const c of d.categories || []) {
      if (HIDDEN_CATS.has(c.handle) || c.handle === "mobile-phones") continue
      const e = catCounts.get(c.handle) || { name: c.name, slug: c.handle, c: 0 }
      e.c++
      catCounts.set(c.handle, e)
    }
  const catFacets = [...catCounts.values()].sort((a, b) => b.c - a.c || a.name.localeCompare(b.name)).slice(0, 8)
  const filterLabels: Record<string, string> = {}
  for (const g of template) for (const f of g.fields || []) if (f.is_filter) filterLabels[f.key] = f.label
  const specFacets: { key: string; label: string; values: { v: string; c: number }[] }[] = []
  for (const k of HOME_SPEC_PRIORITY) {
    if (!filterLabels[k]) continue
    const values = specFacet(all, k, 8)
    if (values.length >= 2) specFacets.push({ key: k, label: filterLabels[k], values })
    if (specFacets.length >= 3) break
  }

  const latest = sortLatest(all)
  const trending = sortTrending(all).slice(0, 10)
  const nowTs = Date.now()
  const upcoming = [...all]
    .filter((d) => {
      const a = d.metadata?.availability
      const r = d.metadata?.release_date ? Date.parse(d.metadata.release_date) : NaN
      return a === "coming_soon" || a === "rumored" || (Number.isFinite(r) && r > nowTs)
    })
    .sort((a, b) => (Date.parse(a.metadata?.release_date) || 0) - (Date.parse(b.metadata?.release_date) || 0))
    .slice(0, 5)
  const budget = [...all]
    .filter((d) => devicePrice(d) > 0 && devicePrice(d) <= 50000)
    .sort((a, b) => devicePrice(a) - devicePrice(b))
    .slice(0, 5)
  const pairs = popularPairs(all)
  const posts = postsRes.posts || []

  const homeContentTitle = String(legacy.homepage_content_title || "").trim()
  const homeContent = String(s.page_home_content || legacy.homepage_content || "").trim()

  const latestLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Latest Mobile Phones",
    itemListElement: latest.slice(0, 8).map((d, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: canonicalUrl(`/products/${d.handle}/`),
      name: d.title,
    })),
  }

  // PHP header.php "WebPage Schema — Homepage"
  const homeUrl = canonicalUrl("/")
  const webPageLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${homeUrl}#webpage`,
    url: homeUrl,
    name: s.seo_home_title?.trim() || s.site_name || "",
    description: s.seo_home_description?.trim() || "",
    isPartOf: { "@id": `${homeUrl}#website` },
    about: { "@id": `${homeUrl}#organization` },
    inLanguage: "en",
  }

  let eagerUsed = false
  const eagerFor = (d: MmDevice) => {
    if (eagerUsed || !d.thumbnail) return false
    eagerUsed = true
    return true
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(latestLd) }} />

      {/* BRAND CAROUSEL */}
      {stripBrands.length > 0 && (
        <section className="br-strip" aria-label="Browse by brand">
          <div className="sp-container br-strip-inner">
            <div className="br-nav br-nav-left" id="brNavLeft">
              <BrandNavButton dir={-1} label="Scroll brands left">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 6-6 6 6 6" />
                </svg>
              </BrandNavButton>
            </div>
            <div className="br-track" id="brTrack">
              {stripBrands.map((b: any, bi: number) => (
                <Link className="br-item" href={`/${b.handle}/`} key={b.id}>
                  <span className="br-ring">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mmThumb(b.logo_url, 160) || mmImage(null)}
                      alt={`${b.name} mobiles`}
                      width={78}
                      height={78}
                      {...(bi >= 7 ? { loading: "lazy" as const } : {})}
                      decoding="async"
                    />
                  </span>
                  <span className="br-name">{b.name}</span>
                </Link>
              ))}
            </div>
            <div className="br-nav br-nav-right" id="brNavRight">
              <BrandNavButton dir={1} label="Scroll brands right">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </BrandNavButton>
            </div>
          </div>
          <div className="sp-container br-viewall">
            <Link href="/brands/">View All Brands</Link>
          </div>
          <LegacyScript code={BRAND_STRIP_JS} />
        </section>
      )}

      {/* Ad: below the brands strip */}
      <div className="sp-container">
        <KnAd placement="home_top" />
      </div>

      <div className="sp-container">
        {(catFacets.length > 0 || specFacets.length > 0) && (
          <section className="hf" aria-label="Filter phones">
            <div className="hf-line" id="hfSpecs">
              <div className="hf-chips">
                {catFacets.length > 0 && (
                  <details className="hf-dd hf-dd-cats">
                    <summary>
                      <span className="hf-dd-lbl">Price Range</span>
                      <span className="hf-dd-chev">
                        <Chev />
                      </span>
                    </summary>
                    <div className="hf-dd-menu">
                      {catFacets.map((c) => (
                        <Link className="hf-opt hf-opt-link" href={`/category/${c.slug}/`} key={c.slug}>
                          <span className="hf-opt-txt">{c.name}</span>
                          <span className="hf-cnt">{c.c}</span>
                        </Link>
                      ))}
                    </div>
                  </details>
                )}
                {specFacets.map((facet) => (
                  <details className="hf-dd" data-key={facet.key} key={facet.key}>
                    <summary>
                      <span className="hf-dd-lbl">{facet.label}</span>
                      <span className="hf-dd-badge" hidden />
                      <span className="hf-dd-chev">
                        <Chev />
                      </span>
                    </summary>
                    <div className="hf-dd-menu">
                      {facet.values.map((v) => (
                        <label className="hf-opt" key={v.v}>
                          <input type="checkbox" value={v.v} />
                          <span className="hf-opt-txt">{v.v}</span>
                          <span className="hf-cnt">{v.c}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                ))}
                <button type="button" className="hf-clear" id="hfClear" hidden>
                  Clear
                </button>
              </div>
            </div>

            <div className="hf-results" id="hfResults" hidden>
              <div className="sp-sec hf-results-head">
                <h2>
                  Matching Phones <span className="hf-rcount" id="hfCount" />
                </h2>
              </div>
              <div className="hf-loading" id="hfLoading" hidden>
                <span className="spin" aria-hidden="true" />
              </div>
              <div className="dv-grid cols-5" id="hfGrid" aria-live="polite" />
              <div className="hf-empty" id="hfEmpty" hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <p>No phones match these filters. Try removing one.</p>
              </div>
            </div>
            <LegacyScript code={HOME_FILTERS_JS} />
          </section>
        )}

        {sections.length > 0 ? (
          sections.map((sec, si) => {
            const list = homeSectionDevices(all, sec, Number(sec.item_count) || 10)
            if (!list.length) return null
            const link = homeSectionLink(sec)
            const Head = (si === 0 ? "h1" : "h2") as "h1" | "h2"
            return (
              <section className="home-section" data-section-id={sec.id} key={sec.id}>
                <div className="sp-sec">
                  <Head>{sec.title}</Head>
                  {link && (
                    <Link className="more" href={link}>
                      View all
                    </Link>
                  )}
                </div>
                {sec.subtitle && <p className="home-section-sub">{sec.subtitle}</p>}
                <div className="dv-grid cols-5" id={`secGrid${sec.id}`}>
                  {list.map((d) => (
                    <DeviceCard d={d} key={d.id} eager={eagerFor(d)} />
                  ))}
                </div>
                {!!Number(sec.infinite) && (
                  <div className="home-more" data-sentinel={sec.id} data-offset={list.length}>
                    <span className="spin" aria-hidden="true" />
                  </div>
                )}
              </section>
            )
          })
        ) : (
          <>
            <div className="sp-sec">
              <h1>{homeContentTitle || "Latest Mobile Phones"}</h1>
            </div>
            {latest.length ? (
              <div className="dv-grid cols-5">
                {latest.slice(0, 10).map((d) => (
                  <DeviceCard d={d} key={d.id} eager={eagerFor(d)} />
                ))}
              </div>
            ) : (
              <div className="sp-empty">
                <h3>No devices published yet</h3>
                <p>Add your first device from the admin panel to see it here.</p>
              </div>
            )}
            {trending.length > 0 && (
              <>
                <div className="sp-sec">
                  <h2>Trending This Week</h2>
                </div>
                <div className="dv-grid cols-5">
                  {trending.map((d) => (
                    <DeviceCard d={d} key={d.id} />
                  ))}
                </div>
              </>
            )}
            {upcoming.length > 0 && (
              <>
                <div className="sp-sec">
                  <h2>Upcoming Phones</h2>
                </div>
                <div className="dv-grid cols-5">
                  {upcoming.map((d) => (
                    <DeviceCard d={d} key={d.id} />
                  ))}
                </div>
              </>
            )}
            {budget.length > 0 && (
              <>
                <div className="sp-sec">
                  <h2>Best Phones Under {formatPrice(50000)}</h2>
                </div>
                <div className="dv-grid cols-5">
                  {budget.map((d) => (
                    <DeviceCard d={d} key={d.id} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* POPULAR COMPARES */}
        {pairs.length > 0 && (
          <>
            <div className="sp-sec">
              <h2>Popular Compares</h2>
              <Link className="more" href="/compare/">
                Compare any phones &rarr;
              </Link>
            </div>
            <div className="cmp-suggest-grid" id="homeCmpSuggestGrid">
              {pairs.map(([a, b]) => (
                <Link className="cmp-suggest-card" href={`/compare/?d=${a.handle},${b.handle}`} key={`${a.handle}-${b.handle}`}>
                  {[a, b].map((x, i) => (
                    <PairSide key={x.handle} d={x} vs={i === 0} />
                  ))}
                </Link>
              ))}
            </div>
            <LegacyScript code={PAIRS_SHUFFLE_JS} />
          </>
        )}

        {/* BLOG */}
        {posts.length > 0 && (
          <>
            <div className="sp-sec">
              <h2>Latest News &amp; Reviews</h2>
            </div>
            <div className="post-grid">
              {posts.map((p) => {
                const cat = p.categories?.find((c) => c.handle === p.metadata?.primary_category_handle) || p.categories?.[0]
                const img = mmThumb(p.featured_image, 420)
                return (
                  <Link className="post-card" href={postPath(p)} key={p.id}>
                    <span className="post-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {img && <img src={img} alt={p.title} loading="lazy" width={320} height={180} />}
                    </span>
                    <span className="post-body">
                      {cat && <span className="post-cat">{cat.name}</span>}
                      <span className="post-title">{p.title}</span>
                      <span className="post-date">{fmtDate(p.published_at || p.created_at)}</span>
                    </span>
                  </Link>
                )
              })}
            </div>
          </>
        )}

        <LegacyScript code={HOME_INFINITE_JS} />

        {/* Ad: above the homepage content paragraph */}
        <KnAd placement="home_content" />

        {/* SEO CONTENT BLOCK */}
        {(homeContent || homeContentTitle) && (
          <section style={{ margin: "34px 0 10px", paddingTop: 22, borderTop: "1px solid var(--sp-line)" }}>
            {homeContentTitle && (
              <h2 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--sp-ink)", margin: "0 0 10px" }}>{homeContentTitle}</h2>
            )}
            <div className="dp-body" dangerouslySetInnerHTML={{ __html: homeContent }} />
          </section>
        )}
      </div>
    </>
  )
}

/** PHP date('d M Y') */
export function fmtDate(iso?: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleString("en-US", { month: "short" })} ${d.getFullYear()}`
}

export function PairSide({ d, vs }: { d: MmDevice; vs: boolean }) {
  const img = mmThumb(d.thumbnail, 180)
  const price = devicePrice(d) > 0 ? formatPrice(devicePrice(d)) : "—"
  return (
    <>
      <div className="cmp-suggest-device">
        <div className="cmp-suggest-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {img && <img src={img} alt={d.title} loading="lazy" />}
        </div>
        <span className="cmp-suggest-name">{d.title}</span>
        <span className="cmp-suggest-price">{price}</span>
      </div>
      {vs && <span className="cmp-suggest-vs">VS</span>}
    </>
  )
}
