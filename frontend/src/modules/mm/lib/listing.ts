import "server-only"
import { formatPrice } from "@modules/mm/lib"
import { MmDevice, devicePrice, getAllDevices, getSpecTemplate, inCategory, ofBrand, specValues, sortLatest } from "./devices"
import { availabilityLabel } from "./specs"

/**
 * devices.php — the listing engine behind brand archives (/{brand}/),
 * category archives (/category/{x}/) and search (/mobiles/?q=). Same
 * filters, facets, sort orders, page size (24) and active-filter chips.
 */
export type ListingParams = Record<string, string | string[] | undefined>
export type ListingMode = { kind: "brand" | "category" | "search"; handle?: string; basePath: string }

const HIDDEN_CATS = new Set(["2-gb-ram", "3-gb-ram", "4-gb-ram", "6-gb-ram", "8-gb-ram", "12-gb-ram", "16-gb-ram", "mobile-phones"])
export const PER_PAGE = 24
export const SORTS: [string, string][] = [
  ["latest", "Newest first"],
  ["popular", "Most popular"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["rating", "Top rated"],
  ["name", "Name A–Z"],
]

const one = (v: any) => (Array.isArray(v) ? v[0] : v) ?? ""
const many = (v: any): string[] => (Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x).trim()).filter(Boolean)

/** Parse a URLSearchParams-like object (spec[ram][]=…) into a flat record. */
export function paramsFromSearch(sp: URLSearchParams): ListingParams {
  const out: Record<string, string[]> = {}
  for (const [k, v] of sp.entries()) (out[k] ||= []).push(v)
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length === 1 && !k.endsWith("[]") ? v[0] : v]))
}

/** Build a query string, PHP http_build_query style, keeping key order. */
export function qs(params: Record<string, any>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) continue
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, String(x)))
    else sp.append(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ""
}

export async function buildListing(mode: ListingMode, params: ListingParams) {
  const [all, template] = await Promise.all([getAllDevices(), getSpecTemplate()])
  const q = String(one(params.q) || one(params.search)).trim()
  const brandSlugs = many(params["brand[]"])
  const minPrice = one(params.min_price) !== "" ? Number(one(params.min_price)) : null
  const maxPrice = one(params.max_price) !== "" ? Number(one(params.max_price)) : null
  const availability = ["available", "coming_soon", "rumored", "discontinued"].includes(one(params.availability)) ? one(params.availability) : ""
  const sort = SORTS.some(([k]) => k === one(params.sort)) ? one(params.sort) : "latest"
  let page = Math.max(1, parseInt(one(params.page), 10) || 1)
  const categorySlug = mode.kind === "category" ? "" : String(one(params.category)).trim()

  const filterFields = template.flatMap((g) => g.fields || []).filter((f) => f.is_filter)
  const specFilters: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(params)) {
    const m = k.match(/^spec\[([a-z0-9_]+)\]\[\]$/i)
    if (m && many(v).length) specFilters[m[1].toLowerCase()] = many(v)
  }

  // base where (everything except spec filters) — facets are counted against it
  let base = all
  if (q) {
    const ql = q.toLowerCase()
    base = base.filter(
      (d) =>
        d.title.toLowerCase().includes(ql) ||
        String(d.metadata?.model_no || "").toLowerCase().includes(ql) ||
        String(d.metadata?.brand || "").toLowerCase().includes(ql)
    )
  }
  if (brandSlugs.length) base = base.filter((d) => brandSlugs.includes(d.metadata?.brand_handle))
  if (minPrice !== null && Number.isFinite(minPrice)) base = base.filter((d) => devicePrice(d) >= minPrice)
  if (maxPrice !== null && Number.isFinite(maxPrice)) base = base.filter((d) => devicePrice(d) > 0 && devicePrice(d) <= maxPrice)
  if (availability) base = base.filter((d) => d.metadata?.availability === availability)
  if (mode.kind === "brand" && mode.handle) base = base.filter((d) => ofBrand(d, mode.handle!))
  if (mode.kind === "category" && mode.handle) base = base.filter((d) => inCategory(d, mode.handle!))
  if (categorySlug) base = base.filter((d) => inCategory(d, categorySlug))

  let full = base
  for (const [k, vals] of Object.entries(specFilters)) {
    full = full.filter((d) => {
      const have = new Set(specValues(d, k).map((v) => v.value))
      return vals.some((v) => have.has(v))
    })
  }

  const views = (d: MmDevice) => Number(d.metadata?.views) || 0
  const lid = (d: MmDevice) => Number(d.metadata?.legacy_id) || 0
  const rating = (d: MmDevice) => (Number(d.metadata?.rating_sum) || 0) / Math.max(1, Number(d.metadata?.rating_count) || 0)
  let sorted: MmDevice[]
  switch (sort) {
    case "oldest":
      sorted = sortLatest(full).reverse()
      break
    case "popular":
      sorted = [...full].sort((a, b) => views(b) - views(a) || lid(b) - lid(a))
      break
    case "price_asc":
      sorted = [...full].sort((a, b) => {
        const pa = devicePrice(a)
        const pb = devicePrice(b)
        if (!pa !== !pb) return !pa ? 1 : -1
        return pa - pb
      })
      break
    case "price_desc":
      sorted = [...full].sort((a, b) => devicePrice(b) - devicePrice(a))
      break
    case "name":
      sorted = [...full].sort((a, b) => a.title.localeCompare(b.title))
      break
    case "rating":
      sorted = [...full].sort(
        (a, b) => rating(b) - rating(a) || (Number(b.metadata?.rating_count) || 0) - (Number(a.metadata?.rating_count) || 0)
      )
      break
    default:
      sorted = sortLatest(full)
  }

  const total = sorted.length
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))
  if (page > pages) page = pages
  const devices = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  // ── facets
  const brandCount = new Map<string, { name: string; slug: string; c: number }>()
  for (const d of all) {
    if (mode.kind === "brand" && !ofBrand(d, mode.handle!)) continue
    const h = d.metadata?.brand_handle
    if (!h) continue
    const e = brandCount.get(h) || { name: d.metadata?.brand || h, slug: h, c: 0 }
    e.c++
    brandCount.set(h, e)
  }
  const brandFacets = [...brandCount.values()].sort((a, b) => b.c - a.c || a.name.localeCompare(b.name)).slice(0, 30)

  const catCount = new Map<string, { name: string; slug: string; c: number }>()
  if (mode.kind !== "category") {
    for (const d of all) {
      if (mode.kind === "brand" && !ofBrand(d, mode.handle!)) continue
      for (const c of d.categories || []) {
        if (HIDDEN_CATS.has(c.handle)) continue
        const e = catCount.get(c.handle) || { name: c.name, slug: c.handle, c: 0 }
        e.c++
        catCount.set(c.handle, e)
      }
    }
  }
  const categoryFacets = [...catCount.values()].sort((a, b) => b.c - a.c || a.name.localeCompare(b.name)).slice(0, 20)

  const specFacets = filterFields
    .map((f) => {
      const map = new Map<string, number>()
      for (const d of base) {
        const seen = new Set<string>()
        for (const { value } of specValues(d, f.key)) {
          if (seen.has(value)) continue
          seen.add(value)
          map.set(value, (map.get(value) || 0) + 1)
        }
      }
      const values = [...map.entries()]
        .map(([v, c]) => ({ v, c }))
        .sort((a, b) => b.c - a.c || a.v.localeCompare(b.v))
        .slice(0, 18)
      return { field: f, values }
    })
    .filter((x) => x.values.length)

  // ── URLs + active chips (listing_url drops `page`)
  const current: Record<string, any> = {}
  if (q) current.q = q
  if (one(params.type)) current.type = one(params.type)
  if (minPrice !== null) current.min_price = one(params.min_price)
  if (maxPrice !== null) current.max_price = one(params.max_price)
  if (brandSlugs.length) current["brand[]"] = brandSlugs
  if (categorySlug) current.category = categorySlug
  if (availability) current.availability = availability
  for (const [k, vals] of Object.entries(specFilters)) current[`spec[${k}][]`] = vals
  if (sort !== "latest") current.sort = sort
  const listingUrl = (p: Record<string, any>) => `${mode.basePath}${qs(p)}`
  const pageUrl = (p: number) => `${mode.basePath}${qs({ ...current, page: p })}`

  const chips: { label: string; url: string }[] = []
  if (minPrice !== null || maxPrice !== null) {
    const label =
      minPrice !== null && maxPrice !== null
        ? `${formatPrice(minPrice)} – ${formatPrice(maxPrice)}`
        : minPrice !== null
        ? `Over ${formatPrice(minPrice)}`
        : `Under ${formatPrice(maxPrice)}`
    const { min_price, max_price, ...rest } = current
    chips.push({ label, url: listingUrl(rest) })
  }
  for (const bs of brandSlugs) {
    chips.push({ label: bs.charAt(0).toUpperCase() + bs.slice(1), url: listingUrl({ ...current, "brand[]": brandSlugs.filter((x) => x !== bs) }) })
  }
  if (availability) {
    const { availability: _a, ...rest } = current
    chips.push({ label: availabilityLabel(availability).label, url: listingUrl(rest) })
  }
  if (categorySlug) {
    const { category: _c, ...rest } = current
    chips.push({ label: categoryFacets.find((c) => c.slug === categorySlug)?.name || categorySlug, url: listingUrl(rest) })
  }
  for (const [k, vals] of Object.entries(specFilters)) {
    for (const v of vals) {
      chips.push({ label: v, url: listingUrl({ ...current, [`spec[${k}][]`]: vals.filter((x) => x !== v) }) })
    }
  }
  const clearUrl = listingUrl(q ? { q } : {})
  const noindex = !!(q || page > 1 || Object.keys(specFilters).length || brandSlugs.length)

  return {
    q,
    sort,
    page,
    pages,
    total,
    devices,
    brandSlugs,
    minPrice,
    maxPrice,
    availability,
    categorySlug,
    specFilters,
    brandFacets,
    categoryFacets,
    specFacets,
    chips,
    clearUrl,
    pageUrl,
    current,
    noindex,
    typeParam: one(params.type),
  }
}

export type Listing = Awaited<ReturnType<typeof buildListing>>
