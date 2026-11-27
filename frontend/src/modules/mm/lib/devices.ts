import "server-only"
import { cache } from "react"

/**
 * Catalog access for the mymobile.pk templates.
 *
 * The catalog is small (a few hundred phones), so the whole published set is
 * pulled once (Next data cache, 5 min) and the PHP SQL semantics — "newest
 * release first, undated last", spec facets from device_spec_values, price
 * bands — are reproduced in memory exactly. Each page of 100 stays well
 * under Next's 2MB fetch-cache entry limit.
 */
const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:3102"
const PK = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

export type MmDevice = {
  id: string
  handle: string
  title: string
  thumbnail: string | null
  created_at: string
  updated_at: string
  metadata: Record<string, any>
  categories: { id: string; handle: string; name: string }[]
  images?: { url: string }[]
}

const FIELDS = "id,handle,title,thumbnail,created_at,updated_at,metadata,categories.id,categories.handle,categories.name"

export const getAllDevices = cache(async (): Promise<MmDevice[]> => {
  const out: MmDevice[] = []
  for (let offset = 0; offset < 5000; offset += 100) {
    const res = await fetch(`${BACKEND_URL}/store/products?limit=100&offset=${offset}&fields=${FIELDS}`, {
      headers: PK ? { "x-publishable-api-key": PK } : {},
      next: { revalidate: 300, tags: ["products", "mm-devices"] },
    })
    if (!res.ok) throw new Error(`devices fetch failed: HTTP ${res.status}`)
    const { products } = await res.json()
    out.push(...products)
    if (products.length < 100) break
  }
  return out
})

const legacyId = (d: MmDevice) => Number(d.metadata?.legacy_id) || 0
const releaseTs = (d: MmDevice) => {
  const r = d.metadata?.release_date
  const t = r ? Date.parse(String(r)) : NaN
  return Number.isFinite(t) ? t : null
}

/** ORDER BY d.release_date IS NULL, d.release_date DESC, d.id DESC */
export function sortLatest(list: MmDevice[]): MmDevice[] {
  return [...list].sort((a, b) => {
    const ra = releaseTs(a)
    const rb = releaseTs(b)
    if ((ra === null) !== (rb === null)) return ra === null ? 1 : -1
    if (ra !== null && rb !== null && ra !== rb) return rb - ra
    return legacyId(b) - legacyId(a)
  })
}

/** ORDER BY views DESC, id DESC (trending fallback without the daily table). */
export function sortTrending(list: MmDevice[]): MmDevice[] {
  return [...list].sort(
    (a, b) =>
      (Number(b.metadata?.views_30d) || 0) - (Number(a.metadata?.views_30d) || 0) ||
      (Number(b.metadata?.views) || 0) - (Number(a.metadata?.views) || 0) ||
      legacyId(b) - legacyId(a)
  )
}

export const devicePrice = (d: MmDevice) => Number(d.metadata?.price) || 0

/** device_spec_values for one device: multi-value strings split on commas. */
export function specValues(d: MmDevice, key: string): { value: string; num: number | null }[] {
  const raw = d.metadata?.specs?.[key]
  if (raw === undefined || raw === null || raw === "") return []
  if (typeof raw === "boolean") return [{ value: raw ? "Yes" : "No", num: raw ? 1 : 0 }]
  const str = Array.isArray(raw) ? raw.join(",") : String(raw).trim()
  return str
    .split(/\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((value) => {
      const m = value.match(/-?\d+(?:\.\d+)?/)
      return { value: value.slice(0, 180), num: m ? Number(m[0]) : null }
    })
}

export const inCategory = (d: MmDevice, handle: string) => (d.categories || []).some((c) => c.handle === handle)
export const ofBrand = (d: MmDevice, handle: string) => d.metadata?.brand_handle === handle

/** Apply the PHP listing spec filters: { ram: ["8GB","12GB"], … } (OR within a key, AND across keys). */
export function applySpecFilters(list: MmDevice[], picked: Record<string, string[]>): MmDevice[] {
  const keys = Object.keys(picked).filter((k) => picked[k]?.length)
  if (!keys.length) return list
  return list.filter((d) =>
    keys.every((k) => {
      const vals = new Set(specValues(d, k).map((v) => v.value))
      return picked[k].some((p) => vals.has(p))
    })
  )
}

/** Facet values for a spec key across `list`, ordered like PHP (numeric asc, count desc). */
export function specFacet(list: MmDevice[], key: string, limit = 8) {
  const map = new Map<string, { v: string; c: number; num: number | null }>()
  for (const d of list) {
    const seen = new Set<string>()
    for (const { value, num } of specValues(d, key)) {
      if (seen.has(value)) continue
      seen.add(value)
      const e = map.get(value) || { v: value, c: 0, num }
      e.c++
      map.set(value, e)
    }
  }
  return [...map.values()]
    .sort((a, b) => {
      if ((a.num === null) !== (b.num === null)) return a.num === null ? 1 : -1
      if (a.num !== null && b.num !== null && a.num !== b.num) return a.num - b.num
      return b.c - a.c
    })
    .slice(0, limit)
}

export type SpecField = { key: string; label: string; unit?: string; type?: string; options?: string[]; is_filter?: boolean; placeholder?: string; highlight?: boolean }
export type SpecGroup = { name: string; icon?: string; fields: SpecField[] }

/** The legacy "Mobile Phone" spec template (same groups/keys as PHP). */
export const getSpecTemplate = cache(async (): Promise<SpecGroup[]> => {
  const res = await fetch(`${BACKEND_URL}/store/spec-templates?limit=50`, {
    headers: PK ? { "x-publishable-api-key": PK } : {},
    next: { revalidate: 3600, tags: ["spec-templates"] },
  })
  if (!res.ok) return []
  const { spec_templates } = await res.json()
  const t = (spec_templates || []).find((x: any) => x.handle === "mobile-phone") || spec_templates?.[0]
  return t?.template_data?.groups || []
})

export const specLabels = (groups: SpecGroup[]) => {
  const out: Record<string, string> = {}
  for (const g of groups) for (const f of g.fields || []) out[f.key] = f.label
  return out
}
