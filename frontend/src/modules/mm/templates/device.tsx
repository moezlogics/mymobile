import Link from "next/link"
import { canonicalUrl } from "@lib/util/seo-url"
import { getMmSettings, deviceFromPrice, formatPrice, mmThumb } from "@modules/mm/lib"
import { MmDevice, getAllDevices, getSpecTemplate } from "@modules/mm/lib/devices"
import {
  availabilityLabel,
  buildSpecGroups,
  deviceFeaturedSpecs,
  fmtShortDate,
  relatedRailKeyForGroup,
  specGroupIconSvg,
  specPanelIconSvg,
  starFills,
} from "@modules/mm/lib/specs"
import { relatedByBrand, relatedByPrice, relatedBySpecs } from "@modules/mm/lib/related"
import DeviceCard from "@modules/mm/components/device-card"
import KnAd from "@modules/mm/components/kn-ad"
import LegacyScript from "@modules/mm/components/legacy-script"
import OnClick from "@modules/mm/components/on-click"
import MmBuyBox, { BuyVariant } from "@modules/mm/components/buy-box"
import {
  BUY_USED_JS,
  DEVICE_GALLERY_JS,
  REVIEWS_JS,
  REVIEW_FLASH_JS,
  REVIEW_LOCK_JS,
} from "@modules/mm/scripts/device"

const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:3102"
const PK = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

type Review = {
  id: string
  name: string
  rating: number
  title: string | null
  message: string
  helpful: number
  is_admin: boolean
  created_at: string
  replies: { name: string; message: string; is_admin: boolean; created_at: string }[]
}

async function getReviews(productId: string): Promise<{ reviews: Review[]; distribution: Record<string, number> }> {
  try {
    const r = await fetch(`${BACKEND_URL}/store/mm-reviews?product_id=${encodeURIComponent(productId)}`, {
      headers: PK ? { "x-publishable-api-key": PK } : {},
      next: { revalidate: 120, tags: ["reviews", `reviews-${productId}`] },
    })
    if (!r.ok) return { reviews: [], distribution: {} }
    return await r.json()
  } catch {
    return { reviews: [], distribution: {} }
  }
}

const Chevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 6 6 6-6 6" />
  </svg>
)

const Stars = ({ rating, size }: { rating: number; size: string }) => (
  <>
    {starFills(rating).map((f, i) => (
      <span key={i} className={`dv-star dv-star-${f}`} style={{ width: size, height: size }} aria-hidden="true" />
    ))}
  </>
)

const Svg = ({ html }: { html: string }) => <span style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: html }} />

/**
 * device.php — ported 1:1 (gallery, featured specs, price/variants, spec
 * score, tabs, full spec sheet with related rails, pros & cons, description,
 * reviews, lightbox). `product` is the region-priced Medusa product (for the
 * cart); everything shown comes from the migrated legacy fields.
 */
export default async function MmDevicePage({ product }: { product: any }) {
  const [{ legacy }, all, template] = await Promise.all([getMmSettings(), getAllDevices(), getSpecTemplate()])
  const dev: MmDevice = all.find((d) => d.id === product.id) || ({ ...product, categories: product.categories || [] } as MmDevice)
  // Raw metadata from the catalog fetch — listProducts() rewrites
  // metadata.brand to the brand *handle*, which must not reach the page.
  const m: Record<string, any> = { ...(product.metadata || {}), ...(dev.metadata || {}) }
  const { reviews, distribution } = await getReviews(product.id)

  const specs: Record<string, any> = m.specs || {}
  const groups = buildSpecGroups(specs, template)
  const featured = deviceFeaturedSpecs(specs)
  const legacyVariants: { label: string; price: number | null }[] = (m.variants_legacy || []).filter((v: any) => v?.label)
  const fromPrice = deviceFromPrice(product)
  const avail = availabilityLabel(m.availability)
  const ai = m.ai_score_json && m.ai_score_json.overall ? m.ai_score_json : null
  const pros: string[] = ai?.pros?.length ? ai.pros : String(m.pros || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  const cons: string[] = ai?.cons?.length ? ai.cons : String(m.cons || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  const brandName: string = m.brand || ""
  const brandHandle: string = m.brand_handle || ""
  const ratingCount = Number(m.rating_count) || 0
  const ratingAvg = ratingCount ? Math.round(((Number(m.rating_sum) || 0) / ratingCount) * 10) / 10 : 0

  const imagesFull: string[] = [...new Set<string>([product.thumbnail, ...(product.images || []).map((i: any) => i.url)].filter(Boolean))]
  const images = imagesFull.map((u) => mmThumb(u, 520))
  const imageAlts: Record<string, string> = m.image_alts || {}
  const mainImg = images[0] || ""

  const release = m.release_date ? Date.parse(m.release_date) : NaN
  const isUpcoming = m.availability === "coming_soon" || m.availability === "rumored" || (Number.isFinite(release) && release > Date.now())
  const publishedTs = Date.parse(product.created_at) || Date.now()
  const updatedTs = Date.parse(product.updated_at) || publishedTs

  // Related rails (3 each), injected between key spec tables
  const relPrice = Number(fromPrice ?? m.price ?? 0) || 0
  const relSpecs = relatedBySpecs(all, dev, relPrice)
  const relPriceList = relatedByPrice(all, dev, relPrice)
  const relBrand = relatedByBrand(all, dev, relPrice)
  const sameBrandCount = relBrand.filter((d) => d.metadata?.brand_handle && d.metadata.brand_handle === brandHandle).length
  const rails: Record<string, { title: string; devices: MmDevice[] }> = {
    specs: { title: "Phones with Similar Specs", devices: relSpecs },
    price: { title: "Similar Price Phones", devices: relPriceList },
    brand: { title: sameBrandCount > 0 && brandName ? `More from ${brandName}` : "More Phones to Explore", devices: relBrand },
  }
  const fallbackOrder = ["specs", "price", "brand"]

  // Spec sheet: tables broken by related rails exactly like the PHP loop
  type Block = { kind: "table"; groups: typeof groups } | { kind: "rail"; key: string }
  const blocks: Block[] = []
  const placed = new Set<string>()
  let open: typeof groups = []
  groups.forEach((g, gi) => {
    open.push(g)
    const railKey = relatedRailKeyForGroup(g.name)
    let shouldBreak = !!railKey
    if (gi === groups.length - 1 && fallbackOrder.some((k) => !placed.has(k) && rails[k].devices.length)) shouldBreak = true
    if (shouldBreak) {
      blocks.push({ kind: "table", groups: open })
      open = []
      const pushRail = (k: string) => {
        if (placed.has(k) || !rails[k].devices.length) return
        placed.add(k)
        blocks.push({ kind: "rail", key: k })
      }
      if (railKey) pushRail(railKey)
      if (gi === groups.length - 1) fallbackOrder.forEach(pushRail)
    }
  })
  if (open.length) blocks.push({ kind: "table", groups: open })

  // Cart variants: legacy labels (+ prices) mapped onto Medusa variants
  const mVariants: any[] = product.variants || []
  const buyVariants: BuyVariant[] = (legacyVariants.length ? legacyVariants : [{ label: "Standard", price: Number(m.price) || null }]).map(
    (lv) => {
      const mv = mVariants.find((v) => v.title === lv.label) || (mVariants.length === 1 ? mVariants[0] : null)
      return { id: mv?.id || null, label: lv.label, price: lv.price ?? (Number(m.price) || null) }
    }
  )
  const purchasable = m.availability === "available" && fromPrice !== null

  const dist: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  for (const [k, v] of Object.entries(distribution || {})) dist[Number(k)] = Number(v)
  const distMax = Math.max(1, ...Object.values(dist))
  const hasDescription = !!String(product.description || "").replace(/<[^>]*>/g, "").trim()
  const lbData = imagesFull.map((u, i) => ({
    src: u,
    alt: imageAlts[u] || `${product.title}${i ? ` — photo ${i + 1}` : ""}`,
    cap: "",
  }))

  const url = canonicalUrl(`/products/${product.handle}/`)
  const itemPageLd = {
    "@context": "https://schema.org",
    "@type": "ItemPage",
    "@id": `${url}#webpage`,
    url,
    name: product.title,
    datePublished: new Date(publishedTs).toISOString(),
    dateModified: new Date(updatedTs).toISOString(),
    inLanguage: "en",
    isPartOf: { "@id": `${canonicalUrl("/")}#website` },
    ...(imagesFull[0] ? { primaryImageOfPage: imagesFull[0] } : {}),
  }
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: canonicalUrl("/") },
      ...(brandName ? [{ "@type": "ListItem", position: 2, name: brandName, item: canonicalUrl(`/${brandHandle}/`) }] : []),
      { "@type": "ListItem", position: brandName ? 3 : 2, name: product.title, item: url },
    ],
  }
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    url,
    image: imagesFull.slice(0, 6),
    ...(brandName ? { brand: { "@type": "Brand", name: brandName } } : {}),
    ...(m.model_no ? { mpn: m.model_no } : {}),
    sku: mVariants[0]?.sku || product.handle,
    description: String(m.meta_description || m.short_desc || "").slice(0, 300) || undefined,
    ...(ratingCount ? { aggregateRating: { "@type": "AggregateRating", ratingValue: ratingAvg, reviewCount: ratingCount } } : {}),
    ...(fromPrice
      ? {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "PKR",
            lowPrice: Math.min(...buyVariants.map((v) => v.price || Infinity).filter(Number.isFinite)) || fromPrice,
            highPrice: Math.max(...buyVariants.map((v) => v.price || 0)) || fromPrice,
            offerCount: buyVariants.length,
            availability: purchasable ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
            url,
          },
        }
      : {}),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemPageLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }} />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.DP_IMAGES=${JSON.stringify(lbData)};window.MM_DEVICE_KEY=${JSON.stringify(product.handle)};window.MM_CLASSIFIEDS_URL=${JSON.stringify(process.env.NEXT_PUBLIC_CLASSIFIEDS_URL || "/marketplace")};`,
        }}
      />

      <div className="sp-container">
        <nav className="dp-crumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          {brandName && (
            <>
              <Chevron />
              <Link href={`/${brandHandle}/`}>{brandName}</Link>
            </>
          )}
          <Chevron />
          <span className="cur">{product.title}</span>
        </nav>

        <h1 className="dp-title">
          {product.title}
          {isUpcoming && (
            <>
              {" "}
              <span className="upcoming">{avail.label}</span>
            </>
          )}
        </h1>

        <div className="dp-metarow">
          <span className="dp-date">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2.5" />
              <path d="M8 3v4M16 3v4M3 10h18" />
            </svg>
            {updatedTs > publishedTs + 60_000 ? (
              <>
                Updated <time dateTime={new Date(updatedTs).toISOString()}>{fmtShortDate(new Date(updatedTs).toISOString())}</time>
              </>
            ) : (
              <>
                Published <time dateTime={new Date(publishedTs).toISOString()}>{fmtShortDate(new Date(publishedTs).toISOString())}</time>
              </>
            )}
          </span>
          {ratingCount > 0 && (
            <a href="#reviews" className="dv-rating">
              <span className="dv-stars">
                <Stars rating={ratingAvg} size="13px" />
              </span>
              <span>
                {ratingAvg.toFixed(1)} ({ratingCount} review{ratingCount === 1 ? "" : "s"})
              </span>
            </a>
          )}
        </div>

        <div className="dp-split">
          {/* GALLERY */}
          <div className="dp-col-media">
            <div className="dp-gallery">
              <div className="dp-stage" id="dpStage">
                {images.length ? (
                  images.map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <OnClick
                      as="img"
                      key={u}
                      code="dpLightbox(window.dpIndex || 0)"
                      {...(i === 0
                        ? { src: u, fetchPriority: "high" }
                        : {
                            "data-src": u,
                            src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='466'%3E%3C/svg%3E",
                            loading: "lazy",
                          })}
                      alt={imageAlts[imagesFull[i]] || `${product.title}${i ? ` — photo ${i + 1}` : " front and back view"}`}
                      className={i === 0 ? "on" : ""}
                      decoding="async"
                      width={400}
                      height={466}
                    />
                  ))
                ) : (
                  <span className="dv-card-noimg" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="6" y="2" width="12" height="20" rx="2.5" />
                      <path d="M10.5 18.5h3" />
                    </svg>
                  </span>
                )}
                {images.length > 1 && (
                  <>
                    <OnClick className="dp-nav prev" aria-label="Previous image" code="dpGallery(-1)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 6-6 6 6 6" />
                      </svg>
                    </OnClick>
                    <OnClick className="dp-nav next" aria-label="Next image" code="dpGallery(1)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </OnClick>
                  </>
                )}
              </div>
              {images.length > 1 && (
                <div className="dp-thumbs" id="dpThumbs">
                  {imagesFull.map((u, i) => (
                    <OnClick key={u} className={i === 0 ? "on" : ""} code={`dpGoTo(${i})`} aria-label={`Show image ${i + 1} of ${images.length}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mmThumb(u, 120)} alt="" loading="lazy" width={58} height={68} />
                    </OnClick>
                  ))}
                </div>
              )}
            </div>
            {brandName && (
              <p className="dp-byline">
                By <Link href={`/${brandHandle}/`}>{brandName}</Link>
              </p>
            )}
          </div>

          {/* FEATURED SPECS */}
          <div className="dp-col-specs">
            {featured.length > 0 && (
              <div className="dp-featured">
                {featured.map((f) => (
                  <a href={`#spec-${f.anchor}`} key={f.icon}>
                    <span className="ico">
                      <Svg html={specPanelIconSvg(f.icon)} />
                    </span>
                    <span className="txt">
                      <span className="b">{f.value !== "" ? f.value : f.sub}</span>
                      {f.value !== "" && f.sub !== "" && <span className="s">{f.sub}</span>}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* PRICE / VARIANTS / ACTIONS */}
          <div className="dp-col-buy">
            <div className="dp-buy">
              <MmBuyBox
                variants={buyVariants}
                hasLegacyVariants={legacyVariants.length > 0}
                fromPrice={fromPrice}
                priceOld={Number(m.price_old) || null}
                priceNote={m.price_note || null}
                priceUsd={Number(m.price_usd) || null}
                purchasable={purchasable}
                unavailableLabel={
                  m.availability === "discontinued"
                    ? "This phone has been discontinued."
                    : isUpcoming
                    ? "Online ordering opens when this phone launches."
                    : undefined
                }
              />

              <div className="dp-actions">
                <OnClick
                  className="sp-btn sp-btn-outline"
                  data-cmp-slug={product.handle}
                  data-cmp-name={product.title}
                  data-cmp-img={mainImg}
                  code="SpecsCompare.compareThis(this)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                    <path d="M3 8h13l-3.5-3.5M21 16H8l3.5 3.5" />
                  </svg>
                  <span>Compare</span>
                </OnClick>
                <a className="sp-btn sp-btn-primary" href="#reviews">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                    <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
                  </svg>
                  <span>Write a Review</span>
                </a>
              </div>
              <LegacyScript code={BUY_USED_JS} />

              {ai && (
                <div className="dp-score" aria-label="Specification score">
                  <div className="dp-score-top">
                    <div className="dp-score-ring" style={{ ["--p" as any]: Number(ai.overall) }}>
                      <span>{Number(ai.overall)}</span>
                    </div>
                    <div className="dp-score-intro">
                      <strong>Spec Score</strong>
                      {ai.summary && <p className="dp-score-basis">{ai.summary}</p>}
                    </div>
                  </div>
                  <div className="dp-score-bars">
                    {Object.values(ai.categories || {}).map((c: any) => (
                      <div className="dp-score-bar" key={c.label}>
                        <div className="dp-score-bar-meta">
                          <span>{c.label}</span>
                          <span>{Number(c.score)}</span>
                        </div>
                        <div className="dp-score-track">
                          <i style={{ width: `${Number(c.score)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SECTION TABS */}
        <nav className="dp-tabs" id="dpTabs" aria-label="Device sections">
          <a href="#specifications" className="on">
            Specifications
          </a>
          {(pros.length > 0 || cons.length > 0) && <a href="#verdict">Pros &amp; Cons</a>}
          {hasDescription && <a href="#description">Description</a>}
          <a href="#reviews">
            Reviews{reviews.length > 0 && <span className="badge">{reviews.length}</span>}
          </a>
        </nav>

        <KnAd placement="device_top" />

        {/* SPECIFICATIONS */}
        <section id="specifications" style={{ scrollMarginTop: 110 }}>
          <div className="sp-sec">
            <h2>{product.title} Full Specifications</h2>
          </div>
          {groups.length ? (
            <div className="dp-spec-stack">
              {blocks.map((b, bi) =>
                b.kind === "table" ? (
                  <div className="cmp-wrap dp-spec-wrap" key={bi}>
                    <table className="cmp-table dp-spec-table">
                      <colgroup>
                        <col className="dp-spec-col-lbl" />
                        <col className="dp-spec-col-val" />
                      </colgroup>
                      <tbody>
                        {b.groups.map((g) => [
                          <tr className="sec" key={`${g.name}-h`}>
                            <td colSpan={2}>
                              <span className="dp-spec-sec-label">
                                <Svg html={specGroupIconSvg(g.icon)} />
                                {g.name}
                              </span>
                            </td>
                          </tr>,
                          ...g.rows.map((row) => (
                            <tr id={`spec-${row.key}`} key={row.key}>
                              <td className="lbl">{row.label}</td>
                              <td>{row.value}</td>
                            </tr>
                          )),
                        ])}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="dv-related-rail" data-related={b.key} key={bi}>
                    <h4 className="dv-related-title">{rails[b.key].title}</h4>
                    <div className="dv-grid dv-related-grid">
                      {rails[b.key].devices.map((d) => (
                        <DeviceCard d={d} key={d.id} />
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <>
              <div className="sp-empty" style={{ padding: 30 }}>
                <p>Specifications for this device have not been published yet.</p>
              </div>
              {fallbackOrder.map((k) =>
                rails[k].devices.length ? (
                  <div className="dv-related-rail" style={{ marginTop: 14 }} data-related={k} key={k}>
                    <h4 className="dv-related-title">{rails[k].title}</h4>
                    <div className="dv-grid dv-related-grid">
                      {rails[k].devices.map((d) => (
                        <DeviceCard d={d} key={d.id} />
                      ))}
                    </div>
                  </div>
                ) : null
              )}
            </>
          )}
          <p className="sp-note">
            Specifications are collected from the manufacturer and other reliable sources and may change without notice.
            {legacy.price_disclaimer && (
              <>
                <br />
                {legacy.price_disclaimer}
              </>
            )}
          </p>
        </section>

        <KnAd placement="device_end" />

        {/* PROS / CONS */}
        {(pros.length > 0 || cons.length > 0) && (
          <section id="verdict" style={{ scrollMarginTop: 110 }}>
            <div className="sp-sec">
              <h2>Pros &amp; Cons</h2>
            </div>
            <div className="pc-grid">
              {pros.length > 0 && (
                <div className="pc-box pros">
                  <h4>What we like</h4>
                  <ul>
                    {pros.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {cons.length > 0 && (
                <div className="pc-box cons">
                  <h4>What could be better</h4>
                  <ul>
                    {cons.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {/* DESCRIPTION */}
        {hasDescription && (
          <section id="description" style={{ scrollMarginTop: 110 }}>
            <div className="sp-sec">
              <h2>{product.title} Review &amp; Overview</h2>
            </div>
            <div className="dp-body" dangerouslySetInnerHTML={{ __html: product.description }} />
          </section>
        )}

        {/* REVIEWS */}
        <section id="reviews" style={{ scrollMarginTop: 80 }}>
          <div className="sp-sec">
            <h2>User Reviews{ratingCount ? ` (${ratingCount})` : ""}</h2>
            <OnClick as="a" className="more" href="#" code="SpecsReview.open();return false;">
              Write a review &rarr;
            </OnClick>
          </div>
          {[
            ["ok", "ok", "Thanks! Your review is now live."],
            ["pending", "ok", "Thanks! Your review was submitted and will appear once a moderator approves it."],
            ["invalid", "err", "Please add your name, a valid email address and your review text — everything you typed is still below."],
            ["spam", "err", "That submission was blocked automatically. Your text is still below — please try again."],
            ["ratelimit", "err", "You have posted a lot of reviews in the last hour. Please try again a bit later — your text is saved below."],
            ["error", "err", "Something went wrong saving your review. Your text is still below — please try again."],
          ].map(([k, cls, text]) => (
            <div className={`rv-alert ${cls}`} id={`review-${k}`} hidden key={k}>
              {text}
            </div>
          ))}
          <LegacyScript code={REVIEW_FLASH_JS} />

          <div className="rv-summary">
            <div className="rv-score">
              <div className="big">{ratingCount ? ratingAvg.toFixed(1) : "—"}</div>
              <div className="dv-stars" style={{ justifyContent: "center", marginTop: 6 }}>
                <Stars rating={ratingAvg} size="17px" />
              </div>
              <div className="of">
                {ratingCount} review{ratingCount === 1 ? "" : "s"}
              </div>
            </div>
            <div className="rv-bars">
              {[5, 4, 3, 2, 1].map((st) => (
                <div className="rv-bar" key={st}>
                  <span style={{ width: 40, display: "inline-flex", alignItems: "center", gap: 3 }}>
                    {st}
                    <span className="dv-star dv-star-full" style={{ width: 11, height: 11 }} aria-hidden="true" />
                  </span>
                  <span className="track">
                    <span className="fill" style={{ width: `${ratingCount ? Math.round((dist[st] / distMax) * 100) : 0}%` }} />
                  </span>
                  <span style={{ width: 26, textAlign: "right" }}>{dist[st]}</span>
                </div>
              ))}
              <OnClick className="sp-btn sp-btn-primary" style={{ marginTop: 10, alignSelf: "flex-start", height: 38 }} code="SpecsReview.open()">
                Write a Review
              </OnClick>
            </div>
          </div>

          {reviews.length ? (
            <div>
              {reviews.map((r) => (
                <article className="rv-item" id={`review-${r.id}`} key={r.id}>
                  <div className="rv-head">
                    <span className="rv-avatar">{(r.name || "?").slice(0, 1).toUpperCase()}</span>
                    <span>
                      <span className="rv-name">{r.name}</span>
                      {r.is_admin && <span className="rv-badge-team">Team</span>}
                      <br />
                      <span className="rv-date">{fmtShortDate(r.created_at)}</span>
                    </span>
                    {r.rating > 0 && (
                      <span className="dv-stars" style={{ marginLeft: "auto" }}>
                        <Stars rating={r.rating} size="14px" />
                      </span>
                    )}
                  </div>
                  {r.title && <h3 className="rv-title">{r.title}</h3>}
                  <div className="rv-msg">{r.message}</div>
                  <div className="rv-tools">
                    <OnClick code={`SpecsReview.reply(${JSON.stringify(r.id)}, ${JSON.stringify(r.name)})`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 14 4 9l5-5" />
                        <path d="M4 9h10a6 6 0 0 1 6 6v5" />
                      </svg>
                      Reply
                    </OnClick>
                    <OnClick data-helpful={r.id} code={`SpecsReview.helpful(${JSON.stringify(r.id)}, this)`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M7 22V11l5-9a2.5 2.5 0 0 1 2.4 3.2L13.5 9H19a2 2 0 0 1 2 2.4l-1.5 8A2 2 0 0 1 17.5 21H7z" />
                        <rect x="2" y="11" width="5" height="11" rx="1" />
                      </svg>
                      Helpful <span>{r.helpful > 0 ? `(${r.helpful})` : ""}</span>
                    </OnClick>
                  </div>
                  {r.replies.length > 0 && (
                    <div className="rv-replies">
                      {r.replies.map((rep, i) => (
                        <div key={i}>
                          <div className="rv-head" style={{ marginBottom: 3 }}>
                            <span
                              className="rv-avatar"
                              style={{ width: 28, height: 28, fontSize: ".78rem", ...(rep.is_admin ? { background: "var(--theme-primary)" } : {}) }}
                            >
                              {(rep.name || "?").slice(0, 1).toUpperCase()}
                            </span>
                            <span>
                              <span className="rv-name" style={{ fontSize: ".82rem" }}>
                                {rep.name}
                              </span>
                              {rep.is_admin && <span className="rv-badge-team">Team</span>}
                              <br />
                              <span className="rv-date">{fmtShortDate(rep.created_at)}</span>
                            </span>
                          </div>
                          <div className="rv-msg" style={{ fontSize: ".83rem" }}>
                            {rep.message}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="sp-empty" style={{ padding: "32px 16px" }}>
              <h3>No reviews yet</h3>
              <p>Be the first to share your experience with the {product.title}.</p>
              <OnClick className="sp-btn sp-btn-primary" style={{ marginTop: 12 }} code="SpecsReview.open()">
                Write the First Review
              </OnClick>
            </div>
          )}
        </section>

        {/* REVIEW MODAL */}
        <div className="sp-modal" id="reviewModal">
          <OnClick as="div" className="sp-modal-backdrop" code="SpecsReview.close()" />
          <div className="sp-modal-panel small" role="dialog" aria-modal="true" aria-labelledby="rvModalTitle">
            <div className="sp-modal-head">
              <h3 id="rvModalTitle">Write a Review</h3>
              <OnClick code="SpecsReview.close()" aria-label="Close">
                &times;
              </OnClick>
            </div>
            <div className="sp-modal-body">
              <form method="POST" action="/api/mm/review" className="rv-form" id="reviewForm">
                <input type="hidden" name="product_id" value={product.id} />
                <input type="hidden" name="handle" value={product.handle} />
                <input type="hidden" name="parent_id" id="rvParent" defaultValue="0" />
                <input type="hidden" name="rating" id="rvRating" defaultValue="0" />
                <input type="hidden" name="ts" id="rvTs" defaultValue="0" />
                <div style={{ position: "absolute", left: -9999 }} aria-hidden="true">
                  <label>
                    Website
                    <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>
                <div id="rvReplyNote" style={{ display: "none", fontSize: ".78rem", color: "var(--theme-secondary)", fontWeight: 700, marginBottom: 10 }} />
                <div id="rvRatingRow" style={{ marginBottom: 12 }}>
                  <label>Your Rating</label>
                  <div className="rv-stars-pick" id="rvStars">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <OnClick key={i} code={`SpecsReview.setRating(${i})`} aria-label={`${i} star`}>
                        <span className="dv-star dv-star-empty" data-star={i} />
                      </OnClick>
                    ))}
                  </div>
                </div>
                <div className="row2" style={{ marginBottom: 12 }}>
                  <div>
                    <label htmlFor="rvName">Your Name *</label>
                    <input type="text" id="rvName" name="name" required maxLength={110} placeholder="Ali Raza" />
                  </div>
                  <div>
                    <label htmlFor="rvEmail">
                      Email * <span style={{ fontWeight: 400, color: "#94a3b8" }}>(not published)</span>
                    </label>
                    <input type="email" id="rvEmail" name="email" required maxLength={190} placeholder="you@example.com" />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }} id="rvTitleRow">
                  <label htmlFor="rvTitle">Review Title</label>
                  <input type="text" id="rvTitle" name="title" maxLength={190} placeholder="Great battery, solid camera" />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label htmlFor="rvMsg">Your Review *</label>
                  <textarea id="rvMsg" name="message" rows={5} required maxLength={4000} placeholder="What do you like or dislike about this phone?" />
                </div>
                <button type="submit" className="sp-btn sp-btn-primary" style={{ width: "100%" }}>
                  Submit Review
                </button>
                <p className="rv-note">
                  Your email is never published. Reviews are the opinion of their authors.
                  {Number(legacy.reviews_require_approval ?? 1) ? " New reviews appear after moderation." : ""}
                </p>
              </form>
            </div>
          </div>
        </div>
        <LegacyScript code={REVIEWS_JS} />
        <LegacyScript code={REVIEW_LOCK_JS} />
      </div>

      {/* FULLSCREEN IMAGE LIGHTBOX */}
      {images.length > 0 && (
        <div className="dp-lightbox" id="dpLightbox" role="dialog" aria-modal="true" aria-label={`${product.title} photo`}>
          <OnClick className="dp-lb-close" code="dpLightboxClose()" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </OnClick>
          {images.length > 1 && (
            <>
              <OnClick className="dp-lb-nav prev" code="dpLightboxStep(-1)" aria-label="Previous image">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 6-6 6 6 6" />
                </svg>
              </OnClick>
              <OnClick className="dp-lb-nav next" code="dpLightboxStep(1)" aria-label="Next image">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </OnClick>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img id="dpLbImg" src={undefined} alt="" />
          <div className="dp-lb-cap" id="dpLbCap" />
        </div>
      )}
      <LegacyScript code={`var DP_IMAGES = window.DP_IMAGES || [];\n${DEVICE_GALLERY_JS}`} />
    </>
  )
}
