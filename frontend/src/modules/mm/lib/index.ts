/**
 * mymobile.pk UI helpers — the storefront renders the ORIGINAL PHP design
 * (markup + class names ported 1:1 from the PHP templates, styled by
 * /mm/bundle.min.css + /mm/site.css). These helpers mirror the PHP
 * functions the templates used (format_price, device_from_price, …).
 */
import manifest from "./thumb-manifest.json"
import { getSiteSettings } from "@lib/data/site-settings"
import { cache } from "react"

export type LegacySettings = Record<string, any>

const CDN = (process.env.NEXT_PUBLIC_CDN_URL || process.env.CDN_PUBLIC_URL || "").replace(/\/+$/, "")

/** Raw PHP `settings` row (stored by the migration) merged with live site_setting keys. */
export const getMmSettings = cache(async (): Promise<{ s: Record<string, any>; legacy: LegacySettings }> => {
  const s = (await getSiteSettings()) as Record<string, any>
  let legacy: LegacySettings = {}
  try {
    legacy = JSON.parse(s.legacy_settings_json || "{}")
  } catch {}
  return { s, legacy }
})

/** Legacy image path (images/x.webp) or absolute URL → public URL. */
export function mmImage(path?: string | null): string {
  const p = (path || "").trim()
  if (!p) return ""
  if (/^https?:\/\//i.test(p)) return p
  return `${CDN}/uploads/${p.replace(/^(\.\.\/)+|^\/+/g, "")}`
}

/**
 * Smallest prebuilt WebP sibling (foo-w200.webp / foo-w400.webp) at least
 * `minW` wide — exactly the files the PHP media library generated. Falls
 * back to the original.
 */
export function mmThumb(url?: string | null, minW = 260): string {
  const u = (url || "").trim()
  if (!u) return ""
  const m = u.match(/^(.*\/images\/)([^/?#]+)$/)
  if (!m) return u
  const sizes: number[] | undefined = (manifest as Record<string, number[]>)[m[2]]
  const w = sizes?.find((x) => x >= minW)
  if (!w) return u
  return `${m[1]}${m[2].replace(/\.[a-z0-9]+$/i, "")}-w${w}.webp`
}

/** PHP format_price(): "Rs 27,999" (empty when no price). */
export function formatPrice(amount: any, symbol = "Rs"): string {
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0) return ""
  return `${symbol} ${Math.round(n).toLocaleString("en-US")}`
}

/** PHP device_from_price(): lowest positive of device price + variant prices. */
export function deviceFromPrice(p: any): number | null {
  const m = p?.metadata || {}
  const prices: number[] = []
  if (Number(m.price) > 0) prices.push(Number(m.price))
  for (const v of m.variants_legacy || []) if (Number(v?.price) > 0) prices.push(Number(v.price))
  if (!prices.length) {
    for (const v of p?.variants || []) {
      const a = v?.calculated_price?.calculated_amount
      if (Number(a) > 0) prices.push(Number(a))
    }
  }
  return prices.length ? Math.min(...prices) : null
}

export const deviceUrl = (handle: string) => `/products/${handle}/`
export const brandUrl = (handle: string) => `/${handle}/`
export const categoryUrl = (handle: string) => `/category/${handle}/`

/** "4th flour, …" safe join helper. */
export const clean = (v: any) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v))

/** Strip tags → plain text (for meta-ish snippets inside markup). */
export const stripTags = (html?: string | null) =>
  (html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
