import { getMmSettings } from "@modules/mm/lib"
import { getAllDevices, getSpecTemplate } from "@modules/mm/lib/devices"
import { buildCompareSections, compareModalHtml, devicesBySlugs } from "@modules/mm/lib/compare"

/** GET /api/mm/compare-html?d=a,b — compare modal table (PHP ajax_compare.php). */
export async function GET(req: Request) {
  const { legacy } = await getMmSettings()
  const max = Number(legacy.compare_max) || 4
  const slugs = (new URL(req.url).searchParams.get("d") || "").split(",")
  const [all, template] = await Promise.all([getAllDevices(), getSpecTemplate()])
  const devices = devicesBySlugs(all, slugs, max)
  const html = compareModalHtml(devices, devices.length >= 2 ? buildCompareSections(devices, template) : [], max)
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex, nofollow" },
  })
}
