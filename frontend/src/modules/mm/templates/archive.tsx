import Link from "next/link"
import { canonicalUrl } from "@lib/util/seo-url"
import { getMmSettings } from "@modules/mm/lib"
import { Listing, SORTS } from "@modules/mm/lib/listing"
import DeviceCard from "@modules/mm/components/device-card"
import KnAd from "@modules/mm/components/kn-ad"
import LegacyScript from "@modules/mm/components/legacy-script"
import OnClick from "@modules/mm/components/on-click"
import { LISTING_JS } from "@modules/mm/scripts/listing"

const Icon = ({ n }: { n: "chev" | "x" | "filter" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {n === "chev" && <path d="m6 9 6 6 6-6" />}
    {n === "x" && <path d="M18 6 6 18M6 6l12 12" />}
    {n === "filter" && <path d="M3 6h18M7 12h10M10 18h4" />}
  </svg>
)

/**
 * devices.php — brand / category archive and search results, ported 1:1:
 * breadcrumb, H1, ad, filter sidebar (drawer on mobile), toolbar + sort,
 * active chips, 24-card grid with infinite scroll (+ noscript pager),
 * archive copy below the grid, CollectionPage/ItemList JSON-LD.
 */
export default async function MmArchive({
  listing: L,
  heading,
  crumb,
  forcedBrand,
  intro,
  canonicalPath,
  schemaName,
}: {
  listing: Listing
  heading: string
  crumb?: string | null
  forcedBrand?: boolean
  intro?: string | null
  canonicalPath?: string
  schemaName?: string
}) {
  const { legacy } = await getMmSettings()
  const activeCount = L.chips.length
  const hidden = Object.entries(L.current).filter(([k]) => k !== "sort" && k !== "page")

  const collectionLd = canonicalPath
    ? {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: schemaName || heading,
        url: canonicalUrl(canonicalPath),
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: L.total,
          itemListElement: L.devices.map((d, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: canonicalUrl(`/products/${d.handle}/`),
            name: d.title,
          })),
        },
      }
    : null
  const breadcrumbLd = canonicalPath
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: canonicalUrl("/") },
          { "@type": "ListItem", position: 2, name: crumb || "Mobiles", item: canonicalUrl(canonicalPath) },
        ],
      }
    : null

  return (
    <div className="sp-container">
      {collectionLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }} />}
      {breadcrumbLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />}

      <nav className="dp-crumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <Icon n="chev" />
        <span className="cur">{crumb || "Mobiles"}</span>
      </nav>

      <div className="sp-sec">
        <h1>{heading}</h1>
      </div>

      <KnAd placement="archive_top" />

      <div className="sp-layout">
        <OnClick as="div" className="flt-backdrop" id="fltBackdrop" code="toggleFilters(false)" />

        <aside className="sp-filters" id="spFilters" aria-label="Filters">
          <div className="flt-head">
            <h3>Filters{activeCount ? ` (${activeCount})` : ""}</h3>
            <OnClick code="toggleFilters(false)" aria-label="Close filters">
              <Icon n="x" />
            </OnClick>
          </div>

          <form method="GET" id="filterForm" className="flt-scroll">
            {L.q && <input type="hidden" name="q" value={L.q} />}
            {L.typeParam && <input type="hidden" name="type" value={L.typeParam} />}
            {L.sort !== "latest" && <input type="hidden" name="sort" value={L.sort} />}

            <div className="flt-title">Refine results</div>

            <details className="flt-group" open>
              <summary>
                <span>Price ({legacy.currency_code || "PKR"})</span>
                <span className="chev">
                  <Icon n="chev" />
                </span>
              </summary>
              <div className="flt-price">
                <input type="number" name="min_price" placeholder="Min" inputMode="numeric" defaultValue={L.minPrice ?? ""} />
                <span>&ndash;</span>
                <input type="number" name="max_price" placeholder="Max" inputMode="numeric" defaultValue={L.maxPrice ?? ""} />
              </div>
            </details>

            {!forcedBrand && L.brandFacets.length > 0 && (
              <details className="flt-group" open={L.brandSlugs.length > 0}>
                <summary>
                  <span>
                    Brand {L.brandSlugs.length > 0 && <span className="picked">{L.brandSlugs.length}</span>}
                  </span>
                  <span className="chev">
                    <Icon n="chev" />
                  </span>
                </summary>
                <div className="flt-body">
                  {L.brandFacets.map((b) => (
                    <label key={b.slug}>
                      <input type="checkbox" name="brand[]" value={b.slug} defaultChecked={L.brandSlugs.includes(b.slug)} />
                      <span>{b.name}</span>
                      <span className="cnt">{b.c}</span>
                    </label>
                  ))}
                </div>
              </details>
            )}

            {L.categoryFacets.length > 0 && (
              <details className="flt-group" open={L.categorySlug !== ""}>
                <summary>
                  <span>Category</span>
                  <span className="chev">
                    <Icon n="chev" />
                  </span>
                </summary>
                <div className="flt-body">
                  <label>
                    <input type="radio" name="category" value="" defaultChecked={L.categorySlug === ""} />
                    <span>All categories</span>
                  </label>
                  {L.categoryFacets.map((c) => (
                    <label key={c.slug}>
                      <input type="radio" name="category" value={c.slug} defaultChecked={L.categorySlug === c.slug} />
                      <span>{c.name}</span>
                      <span className="cnt">{c.c}</span>
                    </label>
                  ))}
                </div>
              </details>
            )}

            <details className="flt-group" open={!!L.availability}>
              <summary>
                <span>Availability</span>
                <span className="chev">
                  <Icon n="chev" />
                </span>
              </summary>
              <div className="flt-body">
                <label>
                  <input type="radio" name="availability" value="" defaultChecked={L.availability === ""} />
                  <span>Any</span>
                </label>
                {(
                  [
                    ["available", "Available now"],
                    ["coming_soon", "Coming soon"],
                    ["rumored", "Rumored"],
                    ["discontinued", "Discontinued"],
                  ] as const
                ).map(([k, lbl]) => (
                  <label key={k}>
                    <input type="radio" name="availability" value={k} defaultChecked={L.availability === k} />
                    <span>{lbl}</span>
                  </label>
                ))}
              </div>
            </details>

            {L.specFacets.map(({ field, values }) => {
              const selected = L.specFilters[field.key] || []
              return (
                <details className="flt-group" open={selected.length > 0} key={field.key}>
                  <summary>
                    <span>
                      {field.label} {selected.length > 0 && <span className="picked">{selected.length}</span>}
                    </span>
                    <span className="chev">
                      <Icon n="chev" />
                    </span>
                  </summary>
                  <div className="flt-body">
                    {values.map((v) => (
                      <label key={v.v}>
                        <input type="checkbox" name={`spec[${field.key}][]`} value={v.v} defaultChecked={selected.includes(v.v)} />
                        <span>{v.v}</span>
                        <span className="cnt">{v.c}</span>
                      </label>
                    ))}
                  </div>
                </details>
              )
            })}
          </form>

          <div className="flt-foot">
            <a className="reset" href={L.clearUrl}>
              Reset
            </a>
            <button type="submit" form="filterForm" className="apply">
              Show {L.total.toLocaleString("en-US")} results
            </button>
          </div>
        </aside>

        {/* RESULTS */}
        <div>
          <div className="listing-tools-card">
            <div className="sp-toolbar">
              <OnClick className="flt-toggle" code="toggleFilters(true)">
                <Icon n="filter" />
                <span>Filters</span>
                {activeCount > 0 && <span className="n">{activeCount}</span>}
              </OnClick>
              <span className="count">
                <strong>{L.total.toLocaleString("en-US")}</strong> device{L.total === 1 ? "" : "s"}
              </span>
              <span className="spacer" />
              <form method="GET" className="sp-sort">
                {hidden.flatMap(([k, v]) =>
                  (Array.isArray(v) ? v : [v]).map((x: any, i: number) => <input type="hidden" name={k} value={String(x)} key={`${k}-${i}`} />)
                )}
                <select name="sort" defaultValue={L.sort} aria-label="Sort devices">
                  {SORTS.map(([k, lbl]) => (
                    <option value={k} key={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
                <Icon n="chev" />
              </form>
            </div>

            {L.chips.length > 0 && (
              <div className="flt-active">
                {L.chips.map((c, i) => (
                  <a href={c.url} key={i}>
                    {c.label}
                    <Icon n="x" />
                  </a>
                ))}
                {activeCount > 1 && (
                  <a className="clear" href={L.clearUrl}>
                    Clear all
                  </a>
                )}
              </div>
            )}
          </div>

          {L.devices.length ? (
            <>
              <div className="dv-grid" id="listingGrid">
                {L.devices.map((d, i) => (
                  <DeviceCard d={d} key={d.id} eager={i === 0} />
                ))}
              </div>
              {L.pages > 1 && (
                <>
                  {L.page < L.pages && (
                    <div className="home-more" id="listingLoadMore" data-next-url={L.pageUrl(L.page + 1)} data-loading-text="Loading more devices...">
                      <span className="spin" />
                    </div>
                  )}
                  <noscript>
                    <nav className="sp-pager" aria-label="Pagination">
                      {L.page > 1 && (
                        <a href={L.pageUrl(L.page - 1)} rel="prev">
                          Prev
                        </a>
                      )}
                      {Array.from({ length: L.pages }, (_, i) => i + 1)
                        .filter((p) => p === 1 || p === L.pages || Math.abs(p - L.page) <= 2)
                        .map((p) =>
                          p === L.page ? (
                            <span className="on" key={p}>
                              {p}
                            </span>
                          ) : (
                            <a href={L.pageUrl(p)} key={p}>
                              {p}
                            </a>
                          )
                        )}
                      {L.page < L.pages && (
                        <a href={L.pageUrl(L.page + 1)} rel="next">
                          Next
                        </a>
                      )}
                    </nav>
                  </noscript>
                </>
              )}
            </>
          ) : (
            <div className="sp-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 46, height: 46, color: "#cbd5e1" }} aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <h3>No devices match these filters</h3>
              <p>Try widening the price range or removing a filter.</p>
              <a className="sp-btn sp-btn-outline" style={{ marginTop: 14 }} href={L.clearUrl}>
                Reset filters
              </a>
            </div>
          )}

          {intro && (
            <section className="listing-copy">
              <div className="dp-body" dangerouslySetInnerHTML={{ __html: intro }} />
            </section>
          )}
        </div>
      </div>
      <LegacyScript code={LISTING_JS} />
    </div>
  )
}
