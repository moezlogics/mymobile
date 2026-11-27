import { getAllDevices } from "@modules/mm/lib/devices"
import { getHomeSections, homeSectionDevices } from "@modules/mm/lib/home"
import { deviceCardHtml } from "@modules/mm/components/device-card"

/** GET /api/mm/home-section?id=1&offset=60 — next batch of a rail (PHP ajax_home_section.php). */
export async function GET(req: Request) {
  const u = new URL(req.url)
  const id = Number(u.searchParams.get("id"))
  const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0)
  const sec = (await getHomeSections()).find((s) => s.id === id)
  const headers = { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex", "Cache-Control": "public, max-age=120" }
  if (!sec) return new Response("", { headers })
  const batch = Math.max(2, Math.min(30, Number(sec.item_count) || 10))
  const all = await getAllDevices()
  const html = homeSectionDevices(all, sec, batch, offset).map(deviceCardHtml).join("\n")
  return new Response(html, { headers })
}
