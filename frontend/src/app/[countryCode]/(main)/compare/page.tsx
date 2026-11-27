import { Metadata } from "next"
import Link from "next/link"
import { getSiteSettings } from "@lib/data/site-settings"
import { canonicalUrl } from "@lib/util/seo-url"
import { formatPrice, getMmSettings, mmThumb } from "@modules/mm/lib"
import { devicePrice, getAllDevices, getSpecTemplate } from "@modules/mm/lib/devices"
import { buildCompareSections, compareCellHtml, devicesBySlugs } from "@modules/mm/lib/compare"
import { PairSide, popularPairs } from "@modules/mm/templates/home"
import KnAd from "@modules/mm/components/kn-ad"
import OnClick from "@modules/mm/components/on-click"
import LegacyScript from "@modules/mm/components/legacy-script"

/**
 * compare.php — /compare/?d=slug-a,slug-b (noindex,nofollow like PHP).
 * Reads the query string, so it renders per request.
 */
export const dynamic = "force-dynamic"

type Props = { searchParams: Promise<{ d?: string | string[]; h?: string | string[] }> }

const slugsFrom = (sp: { d?: any; h?: any }) =>
  String((Array.isArray(sp.d) ? sp.d.join(",") : sp.d) || (Array.isArray(sp.h) ? sp.h.join(",") : sp.h) || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [sp, s, all, { legacy }] = await Promise.all([props.searchParams, getSiteSettings(), getAllDevices(), getMmSettings()])
  const devices = devicesBySlugs(all, slugsFrom(sp), Number(legacy.compare_max) || 4)
  const names = devices.map((d) => d.title)
  return {
    title:
      devices.length >= 2
        ? `${names.slice(0, 3).join(" vs ")} — Full Comparison`
        : s.seo_compare_title?.trim() || `Compare Mobile Phones Side by Side | ${s.site_name || ""}`,
    description:
      devices.length >= 2
        ? `Compare ${names.join(" vs ")} — price, display, chipset, camera, battery and every other specification side by side.`
        : s.seo_compare_description?.trim() ||
          "Compare any two or more mobile phones side by side — prices, specifications and the exact differences highlighted.",
    alternates: { canonical: canonicalUrl("/compare/") },
    robots: { index: false, follow: false },
  }
}

export default async function ComparePage(props: Props) {
  const [sp, all, template, { legacy }] = await Promise.all([props.searchParams, getAllDevices(), getSpecTemplate(), getMmSettings()])
  const max = Number(legacy.compare_max) || 4
  const devices = devicesBySlugs(all, slugsFrom(sp), max)
  const cols = devices.length
  const sections = cols >= 2 ? buildCompareSections(devices, template) : []
  const names = devices.map((d) => d.title)
  const pairs = cols === 0 ? popularPairs(all, 12) : []
  const seed = devices.map((d) => ({ slug: d.handle, name: d.title, img: mmThumb(d.thumbnail, 120) }))
  const linkWithout = (h: string) => {
    const rest = devices.filter((d) => d.handle !== h).map((d) => d.handle)
    return rest.length ? `/compare/?d=${rest.join(",")}` : "/compare/"
  }

  return (
    <div className="sp-container">
      <script dangerouslySetInnerHTML={{ __html: `window.SPECS_COMPARE_PAGE=true;window.SPECS_COMPARE_SEED=${JSON.stringify(seed)};` }} />
      <nav className="sp-crumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link> <span>/</span> <span>Compare</span>
      </nav>

      <div className="sp-sec cmp-page-head">
        <h2 className="cmp-page-title">{cols >= 2 ? names.join(" vs ") : "Compare Mobile Phones"}</h2>
        {cols > 0 && (
          <OnClick as="a" className="more" href="/compare/" code="SpecsCompare.clear()">
            Start over &rarr;
          </OnClick>
        )}
      </div>
      <p className="cmp-page-sub">
        {cols >= 2
          ? "Compare price, display, chipset, camera, battery and every important spec side by side."
          : cols === 1
          ? "Add one more phone to unlock the full side-by-side comparison table."
          : ""}
      </p>

      <div className="cmp-stage">
        {devices.map((d) => {
          const img = mmThumb(d.thumbnail, 280)
          const ai = d.metadata?.ai_score_json
          return (
            <div className="cmp-device-card" key={d.id}>
              <OnClick
                className="cmp-remove-btn"
                aria-label={`Remove ${d.title}`}
                code={`SpecsCompare.remove(${JSON.stringify(d.handle)});window.location=${JSON.stringify(linkWithout(d.handle))}`}
              >
                &times;
              </OnClick>
              <Link href={`/products/${d.handle}/`} className="cmp-device-link">
                {img && (
                  <div className="cmp-device-media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt={d.title} loading="lazy" />
                  </div>
                )}
                <span className="cmp-device-name">{d.title}</span>
              </Link>
              <span className="cmp-device-price">{devicePrice(d) ? formatPrice(devicePrice(d)) : <span className="tba">—</span>}</span>
              {ai?.overall ? (
                <div className="cmp-score" title={ai.summary || undefined}>
                  <span className="cmp-score-num">{Number(ai.overall)}</span>
                  <span className="cmp-score-lbl">Spec Score</span>
                </div>
              ) : null}
            </div>
          )
        })}
        {cols < max && (
          <OnClick className="cmp-add-card" code="document.getElementById('cmpPickInput').focus()">
            <span className="cmp-add-icon">+</span>
            <span className="cmp-add-title">Add a device</span>
            <span className="cmp-add-sub">Search and add another phone</span>
          </OnClick>
        )}
      </div>

      {cols < max && (
        <div className="cmp-pick-wrap">
          <div className="cmp-pick-head">
            <h3>Add Phones</h3>
            <p>Search by model or brand to add more devices to this comparison.</p>
          </div>
          <div className="cmp-pick">
            <input type="text" id="cmpPickInput" placeholder="Search a phone to add — e.g. Redmi Note 15" aria-label="Search devices" />
          </div>
          <div className="cmp-results" id="cmpPageResults" />
          <LegacyScript
            code={`var i=document.getElementById('cmpPickInput'); if(i&&!i.dataset.bound){i.dataset.bound='1'; i.addEventListener('input',function(){ window.SpecsCompare && SpecsCompare.search(i.value,'cmpPageResults'); });}`}
          />
        </div>
      )}

      {cols >= 2 ? (
        <>
          <KnAd placement="compare" />
          <div className="cmp-table-top">
            <div className="cmp-table-note">Differences are highlighted automatically. On mobile, swipe sideways to see every phone.</div>
          </div>
          <div className={`cmp-wrap ${cols > 2 ? "scrollable" : ""}`}>
            <table className="cmp-table">
              <thead>
                <tr>
                  <th className="lbl">Specs</th>
                  {devices.map((d) => {
                    const img = mmThumb(d.thumbnail, 180)
                    return (
                      <th key={d.id}>
                        <div className="cmp-head-card">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {img && <img src={img} alt={d.metadata?.image_alt || d.title} loading="lazy" />}
                          <Link href={`/products/${d.handle}/`}>{d.title}</Link>
                          <span className="p">{devicePrice(d) ? formatPrice(devicePrice(d)) : "—"}</span>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {sections.map((sec) => [
                  <tr className="sec" key={`${sec.name}-h`}>
                    <td colSpan={cols + 1}>{sec.name}</td>
                  </tr>,
                  ...sec.rows.map((row) => (
                    <tr className={row.differs ? "diff" : undefined} key={`${sec.name}-${row.key}`}>
                      <td className="lbl">{row.label}</td>
                      {row.values.map((v, i) => (
                        <td key={i} dangerouslySetInnerHTML={{ __html: compareCellHtml(v, row.list) }} />
                      ))}
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        </>
      ) : cols === 1 ? (
        <div className="sp-empty">
          <h3>Add one more device</h3>
          <p>Pick a second phone above to see the full side-by-side comparison.</p>
        </div>
      ) : (
        <>
          <div className="sp-empty">
            <h3>Nothing selected yet</h3>
            <p>
              Search above, or tap the <strong>VS</strong> button on any device card to add it to the comparison.
            </p>
          </div>
          {pairs.length > 0 && (
            <>
              <div className="sp-sec">
                <h2>Popular Compares</h2>
              </div>
              <p className="cmp-page-sub" style={{ marginTop: -4 }}>
                Similar-price pairs picked for quick side-by-side comparison.
              </p>
              <div className="cmp-suggest-grid" id="cmpSuggestGrid">
                {pairs.map(([a, b]) => (
                  <Link className="cmp-suggest-card" href={`/compare/?d=${a.handle},${b.handle}`} key={`${a.handle}-${b.handle}`}>
                    <PairSide d={a} vs />
                    <PairSide d={b} vs={false} />
                  </Link>
                ))}
              </div>
              <LegacyScript
                code={`(function(){var grid=document.getElementById('cmpSuggestGrid');if(!grid)return;var cards=Array.prototype.slice.call(grid.children);if(cards.length<=6)return;cards.sort(function(){return Math.random()-0.5;});cards.forEach(function(card,idx){card.style.display=idx<6?'':'none';});})();`}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
