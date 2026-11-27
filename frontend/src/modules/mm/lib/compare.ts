import "server-only"
import { formatPrice, mmThumb } from "@modules/mm/lib"
import { MmDevice, SpecGroup, devicePrice } from "./devices"
import { specFormatValue } from "./specs"

/** fetch_devices_by_slugs() — keep the visitor's order, cap at compare_max. */
export function devicesBySlugs(all: MmDevice[], slugs: string[], max = 4): MmDevice[] {
  const seen = new Set<string>()
  return slugs
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && !seen.has(s) && (seen.add(s), true))
    .map((s) => all.find((d) => d.handle === s))
    .filter(Boolean)
    .slice(0, max) as MmDevice[]
}

export type CmpRow = { key: string; label: string; values: (string | string[])[]; differs: boolean; list?: "p" | "c" }
export type CmpSection = { name: string; icon: string; rows: CmpRow[] }

const proConList = (d: MmDevice, key: "pros" | "cons"): string[] => {
  const ai = d.metadata?.ai_score_json
  if (ai?.[key]?.length) return ai[key]
  return String(d.metadata?.[key] || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
}

/** build_compare_sections() */
export function buildCompareSections(devices: MmDevice[], template: SpecGroup[]): CmpSection[] {
  const maps = devices.map((d) => Object.fromEntries(Object.entries(d.metadata?.specs || {}).map(([k, v]) => [k.toLowerCase(), v])))
  const rowValues = (key: string, field: any) => maps.map((m) => (key in m ? specFormatValue(m[key], field) : ""))
  const differs = (vals: string[]) => new Set(vals.map((v) => String(v).trim().toLowerCase())).size > 1

  const sections: CmpSection[] = []
  const used = new Set<string>()
  const prices = devices.map((d) => (devicePrice(d) ? formatPrice(devicePrice(d)) : "—"))
  const brands = devices.map((d) => d.metadata?.brand || "—")
  const released = devices.map((d) => {
    const t = d.metadata?.release_date ? Date.parse(d.metadata.release_date) : NaN
    return Number.isFinite(t) ? new Date(t).toLocaleString("en-US", { month: "short", year: "numeric" }) : "—"
  })
  const ratings = devices.map((d) => {
    const c = Number(d.metadata?.rating_count) || 0
    if (!c) return "—"
    const avg = Math.round(((Number(d.metadata?.rating_sum) || 0) / c) * 10) / 10
    return `${avg}/5 (${c})`
  })
  const overview: CmpRow[] = [
    { label: "Price", values: prices, differs: differs(prices), key: "_price" },
    { label: "Brand", values: brands, differs: differs(brands), key: "_brand" },
    { label: "Released", values: released, differs: differs(released), key: "_released" },
  ]
  if (ratings.some((r) => r !== "—")) overview.push({ label: "User Rating", values: ratings, differs: differs(ratings), key: "_rating" })
  sections.push({ name: "Overview", icon: "ph-info", rows: overview })

  for (const g of template) {
    const rows: CmpRow[] = []
    for (const f of g.fields || []) {
      used.add(f.key)
      const vals = rowValues(f.key, f)
      if (!vals.some((v) => v !== "")) continue
      rows.push({ key: f.key, label: f.label, values: vals, differs: differs(vals) })
    }
    if (rows.length) sections.push({ name: g.name, icon: g.icon || "ph-info", rows })
  }

  const pros = devices.map((d) => proConList(d, "pros"))
  const cons = devices.map((d) => proConList(d, "cons"))
  const verdict: CmpRow[] = []
  if (pros.some((p) => p.length)) verdict.push({ key: "_pros", label: "Pros", values: pros, differs: false, list: "p" })
  if (cons.some((c) => c.length)) verdict.push({ key: "_cons", label: "Cons", values: cons, differs: false, list: "c" })
  if (verdict.length) sections.push({ name: "Pros & Cons", icon: "ph-list-checks", rows: verdict })

  const extra = new Set<string>()
  for (const m of maps) for (const k of Object.keys(m)) if (!used.has(k) && k && k[0] !== "_") extra.add(k)
  const rows: CmpRow[] = []
  for (const k of extra) {
    const vals = rowValues(k, { type: "text", unit: "" })
    if (!vals.some((v) => v !== "")) continue
    rows.push({ key: k, label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), values: vals, differs: differs(vals) })
  }
  if (rows.length) sections.push({ name: "Other Specs", icon: "ph-info", rows })
  return sections
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

/** render_compare_cell() */
export function compareCellHtml(value: string | string[], list?: string): string {
  if (list && Array.isArray(value)) {
    if (!value.length) return '<span class="na">&mdash;</span>'
    return `<ul>${value.map((i) => `<li class="${esc(list)}">${esc(i)}</li>`).join("")}</ul>`
  }
  const s = Array.isArray(value) ? value.join(", ") : String(value)
  return s !== "" ? esc(s) : '<span class="na">&mdash;</span>'
}

/** ajax_compare.php — the modal table HTML used by /mm/compare.js */
export function compareModalHtml(devices: MmDevice[], sections: CmpSection[], max: number): string {
  if (devices.length < 2) return '<div style="padding:36px;text-align:center;color:#94a3b8">Select at least two devices to compare.</div>'
  const cols = devices.length
  const head = devices
    .map((d) => {
      const img = mmThumb(d.thumbnail, 180)
      const price = devicePrice(d) ? esc(formatPrice(devicePrice(d))) : "—"
      return `<th><div class="cmp-head-card">${img ? `<img src="${esc(img)}" alt="${esc(d.title)}" loading="lazy">` : ""}<a href="/products/${esc(
        d.handle
      )}/">${esc(d.title)}</a><span class="p">${price}</span><button type="button" class="rm" onclick="SpecsCompare.removeAndRefresh('${esc(d.handle)}')">Remove</button></div></th>`
    })
    .join("")
  const body = sections
    .map(
      (sec) =>
        `<tr class="sec"><td colspan="${cols + 1}">${esc(sec.name)}</td></tr>` +
        sec.rows.map((row) => `<tr><td class="lbl">${esc(row.label)}</td>${row.values.map((v) => `<td>${compareCellHtml(v, row.list)}</td>`).join("")}</tr>`).join("")
    )
    .join("")
  const picker =
    cols < max
      ? `<div style="margin-top:16px;border-top:1px solid var(--sp-line);padding-top:14px"><div class="cmp-pick"><input type="text" placeholder="Add another device to the comparison…" aria-label="Search devices" oninput="SpecsCompare.search(this.value, 'cmpModalResults')"></div><div class="cmp-results" id="cmpModalResults"></div></div>`
      : ""
  return `<div class="cmp-wrap ${cols > 2 ? "scrollable" : ""}"><table class="cmp-table"><thead><tr><th class="lbl">Specs</th>${head}</tr></thead><tbody>${body}</tbody></table></div>${picker}`
}
