import "server-only"
import { getMmSettings } from "@modules/mm/lib"
import { MmDevice, devicePrice, inCategory, ofBrand, sortLatest, sortTrending } from "./devices"

/** Admin-built homepage rails (PHP `home_sections`, migrated to site_setting). */
export type HomeSection = {
  id: number
  title: string
  subtitle?: string | null
  source: "latest" | "trending" | "featured" | "brand" | "category" | "price"
  brand_handle?: string | null
  category_handle?: string | null
  min_price?: number | null
  max_price?: number | null
  item_count: number
  infinite: number | boolean
  link_url?: string | null
  is_active: number | boolean
  sort_order: number
}

export async function getHomeSections(): Promise<HomeSection[]> {
  const { s } = await getMmSettings()
  try {
    const list = JSON.parse(s.home_sections_json || "[]") as HomeSection[]
    return list
      .filter((x) => Number(x.is_active) === 1 || x.is_active === true)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)
  } catch {
    return []
  }
}

/** home_section_query() + home_section_devices() */
export function homeSectionDevices(all: MmDevice[], sec: HomeSection, limit: number, offset = 0): MmDevice[] {
  let list = all
  switch (sec.source) {
    case "trending":
      return sortTrending(list).slice(offset, offset + limit)
    case "featured":
      list = list.filter((d) => !!d.metadata?.is_featured)
      break
    case "brand":
      list = sec.brand_handle ? list.filter((d) => ofBrand(d, sec.brand_handle!)) : []
      break
    case "category":
      list = sec.category_handle ? list.filter((d) => inCategory(d, sec.category_handle!)) : []
      break
    case "price": {
      const min = sec.min_price != null && String(sec.min_price) !== "" ? Number(sec.min_price) : null
      const max = sec.max_price != null && String(sec.max_price) !== "" ? Number(sec.max_price) : null
      list = list.filter((d) => {
        const p = devicePrice(d)
        if (min !== null && !(p >= min)) return false
        if (max !== null && !(p > 0 && p <= max)) return false
        return true
      })
      return [...list].sort((a, b) => devicePrice(a) - devicePrice(b)).slice(offset, offset + limit)
    }
  }
  return sortLatest(list).slice(offset, offset + limit)
}

/** home_section_link() — "View all" target. */
export function homeSectionLink(sec: HomeSection): string {
  if (sec.link_url) return sec.link_url
  switch (sec.source) {
    case "brand":
      return sec.brand_handle ? `/${sec.brand_handle}/` : ""
    case "category":
      return sec.category_handle ? `/category/${sec.category_handle}/` : ""
    default:
      return ""
  }
}
