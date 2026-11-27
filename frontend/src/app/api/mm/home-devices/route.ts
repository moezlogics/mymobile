import { NextResponse } from "next/server"
import { applySpecFilters, devicePrice, getAllDevices, sortLatest } from "@modules/mm/lib/devices"
import { deviceCardHtml } from "@modules/mm/components/device-card"

/**
 * GET /api/mm/home-devices?spec[ram][]=8GB&spec[storage][]=256GB[&min_price&max_price]
 * Homepage quick-filter results (PHP ajax_home_devices.php): { html, count }.
 */
export async function GET(req: Request) {
  const u = new URL(req.url)
  const picked: Record<string, string[]> = {}
  for (const [k, v] of u.searchParams.entries()) {
    const m = k.match(/^spec\[([a-z0-9_]+)\]\[\]$/i)
    if (!m || !v.trim()) continue
    const key = m[1].toLowerCase()
    ;(picked[key] ||= []).push(v.trim())
  }
  const min = u.searchParams.get("min_price")
  const max = u.searchParams.get("max_price")

  let list = applySpecFilters(await getAllDevices(), picked)
  if (min) list = list.filter((d) => devicePrice(d) >= Number(min))
  if (max) list = list.filter((d) => devicePrice(d) > 0 && devicePrice(d) <= Number(max))

  const html = sortLatest(list).slice(0, 18).map(deviceCardHtml).join("\n")
  return NextResponse.json(
    { html, count: list.length },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }
  )
}
