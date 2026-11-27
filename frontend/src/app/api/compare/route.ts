import { NextResponse } from "next/server"
import { API_HEADERS, SLUG_RE, fetchDevices, toLegacyDevice } from "@lib/legacy-api"

const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:3102"
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

/**
 * GET /api/compare/?d=slug-a,slug-b[,…] — legacy api_compare.php contract:
 *   { ok, devices: [...], sections: [{ name, rows: [{ key, label, values[] }] }] }
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("d") || ""
  const slugs = [...new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter((s) => SLUG_RE.test(s)))].slice(0, 4)
  if (slugs.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Provide at least two device slugs via ?d=slug-a,slug-b" },
      { status: 400, headers: API_HEADERS }
    )
  }
  const products = await fetchDevices(slugs)
  if (products.length < 2) {
    return NextResponse.json({ ok: false, error: "Need at least two matching devices" }, { status: 404, headers: API_HEADERS })
  }

  let groups: any[] = []
  try {
    const res = await fetch(`${BACKEND_URL}/store/spec-templates?limit=50`, {
      headers: PUBLISHABLE_KEY ? { "x-publishable-api-key": PUBLISHABLE_KEY } : {},
      next: { revalidate: 3600, tags: ["spec-templates"] },
    })
    const { spec_templates } = await res.json()
    const tpl = spec_templates?.find((t: any) => t.handle === "mobile-phone") || spec_templates?.[0]
    groups = tpl?.template_data?.groups || []
  } catch {}

  const devices = products.map((p) => {
    const d = toLegacyDevice(p)
    return {
      id: d.id,
      name: d.name,
      slug: d.slug,
      url: d.url,
      brand: d.brand,
      price: d.price,
      currency: d.currency,
      image: d.image,
      spec_score: p.metadata?.ai_score ?? null,
      specs: d.specs,
    }
  })
  const sections = groups
    .map((g: any) => ({
      name: g.name,
      rows: (g.fields || [])
        .map((f: any) => ({
          key: f.key,
          label: f.label,
          values: devices.map((d) => {
            const v = d.specs?.[f.key]
            return v === undefined || v === null || v === "" ? null : v
          }),
        }))
        .filter((r: any) => r.values.some((v: any) => v !== null)),
    }))
    .filter((s: any) => s.rows.length)

  return NextResponse.json({ ok: true, devices, sections }, { headers: API_HEADERS })
}
