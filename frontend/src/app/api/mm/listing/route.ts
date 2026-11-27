import { NextResponse } from "next/server"
import { resolveLegacyPath } from "@lib/data/legacy"
import { buildListing, paramsFromSearch } from "@modules/mm/lib/listing"
import { deviceCardHtml } from "@modules/mm/components/device-card"

/**
 * GET /api/mm/listing?path=/samsung/&page=2&… — infinite-scroll batch for a
 * listing (PHP devices.php?load_more=1): { html, has_more, next_url }.
 */
export async function GET(req: Request) {
  const u = new URL(req.url)
  const path = u.searchParams.get("path") || "/"
  u.searchParams.delete("path")
  const params = paramsFromSearch(u.searchParams)
  const seg = path.split("/").filter(Boolean)
  let mode: Parameters<typeof buildListing>[0] | null = null
  if (seg.length === 1 && seg[0] === "mobiles") mode = { kind: "search", basePath: "/mobiles/" }
  else if (seg.length === 2 && seg[0] === "category") mode = { kind: "category", handle: seg[1], basePath: path }
  else if (seg.length === 1 && (await resolveLegacyPath(seg)).kind === "brand") mode = { kind: "brand", handle: seg[0], basePath: path }
  const headers = { "X-Robots-Tag": "noindex", "Cache-Control": "public, max-age=60" }
  if (!mode) return NextResponse.json({ html: "", has_more: false, next_url: null }, { headers })
  const L = await buildListing(mode, params)
  return NextResponse.json(
    {
      html: L.devices.map(deviceCardHtml).join("\n"),
      has_more: L.page < L.pages,
      next_url: L.page < L.pages ? L.pageUrl(L.page + 1) : null,
    },
    { headers }
  )
}
