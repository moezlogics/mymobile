import { listBrands } from "@lib/data/brands"
import { getMmSettings, mmImage } from "@modules/mm/lib"
import MmHeaderClient, { NavLink } from "./header-client"

/**
 * Server half of the header: builds the same menu the PHP header.php built —
 * admin `menu_items` when present, otherwise Home · Brands (top 10, featured
 * first) · Compare · Contact.
 */
const toPath = (url: string) => {
  const u = (url || "").trim()
  if (/^https?:\/\//i.test(u) || u.startsWith("#")) return u
  const clean = u.replace(/^\/+|\/+$/g, "")
  return clean ? `/${clean}/` : "/"
}

export default async function MmHeader() {
  const { s, legacy } = await getMmSettings()
  const siteName = s.site_name || legacy.site_name || "My Mobile"
  const logo = s.site_logo_url || mmImage(legacy.site_logo) || null
  const contactSlug = s.contact_page_slug || legacy.contact_page_slug || "contact-us"

  let nav: NavLink[] = []
  try {
    const items: any[] = JSON.parse(s.menu_main_json || "[]")
    if (items.length) {
      const byId = new Map<number, NavLink & { id: number }>()
      items.forEach((m) => byId.set(Number(m.id), { id: Number(m.id), label: m.label, url: toPath(m.url), children: [] }))
      for (const m of items) {
        const node = byId.get(Number(m.id))!
        const parent = Number(m.parent_id) > 0 ? byId.get(Number(m.parent_id)) : undefined
        if (parent) parent.children!.push(node)
        else nav.push(node)
      }
    }
  } catch {}

  if (!nav.length) {
    const brands = await listBrands().catch(() => [])
    const top = [...brands]
      .filter((b: any) => b.is_active !== false && !b.parent_id)
      .sort(
        (a: any, b: any) =>
          Number(!!b.metadata?.is_featured) - Number(!!a.metadata?.is_featured) ||
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          a.name.localeCompare(b.name)
      )
      .slice(0, 10)
    nav = [
      { label: "Home", url: "/" },
      { label: "Brands", url: "/brands/", children: top.map((b: any) => ({ label: b.name, url: `/${b.handle}/` })) },
      { label: "Compare", url: "/compare/" },
      { label: "Contact", url: `/${contactSlug}/` },
    ]
  }

  return <MmHeaderClient siteName={siteName} logo={logo} nav={nav} />
}
