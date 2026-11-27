import { NextResponse } from "next/server"
import { API_HEADERS, SLUG_RE, fetchDevices, toLegacyDevice } from "@lib/legacy-api"

/** GET /api/device/{slug}/ — legacy api_device.php contract. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid slug" }, { status: 400, headers: API_HEADERS })
  }
  const [p] = await fetchDevices([slug.toLowerCase()])
  if (!p) {
    return NextResponse.json({ ok: false, error: "Device not found" }, { status: 404, headers: API_HEADERS })
  }
  return NextResponse.json(
    { ok: true, device: toLegacyDevice(p), spec_score: p.metadata?.ai_score ?? null },
    { headers: API_HEADERS }
  )
}
