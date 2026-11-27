/**
 * Ports of fetch_related_devices_by_specs / _by_price / _by_brand and
 * related_devices_pad() from lib/specs.php, over the in-memory catalog.
 */
import { MmDevice, devicePrice, specValues } from "./devices"

const views = (d: MmDevice) => Number(d.metadata?.views) || 0
const lid = (d: MmDevice) => Number(d.metadata?.legacy_id) || 0
const rel = (d: MmDevice) => {
  const r = d.metadata?.release_date ? Date.parse(d.metadata.release_date) : NaN
  return Number.isFinite(r) ? r : null
}

function pad(all: MmDevice[], rows: MmDevice[], limit: number, exclude: Set<string>, price: number): MmDevice[] {
  const seen = new Set(exclude)
  const out: MmDevice[] = []
  for (const r of rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push(r)
    if (out.length >= limit) return out
  }
  const rest = all.filter((d) => !seen.has(d.id))
  const sorted =
    price > 0
      ? rest.sort((a, b) => Math.abs(devicePrice(a) - price) - Math.abs(devicePrice(b) - price) || views(b) - views(a))
      : rest.sort((a, b) => views(b) - views(a) || lid(b) - lid(a))
  for (const d of sorted) {
    out.push(d)
    if (out.length >= limit) break
  }
  return out
}

const num = (raw: any): number | null => {
  if (typeof raw === "number") return raw
  const m = String(raw ?? "").match(/-?\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : null
}

export function relatedBySpecs(all: MmDevice[], dev: MmDevice, price: number, limit = 3): MmDevice[] {
  const specs = dev.metadata?.specs || {}
  const exclude = new Set([dev.id])
  const scorers: ((d: MmDevice) => number)[] = []

  const ramTok = String(specs.ram ?? "").split(/\s*,\s*/)[0]?.trim()
  const ramM = ramTok?.match(/(\d+)\s*GB/i)
  if (ramM) {
    const gb = Number(ramM[1])
    scorers.push((d) => 5 * specValues(d, "ram").filter((v) => new RegExp(`^${gb}\\s?GB`, "i").test(v.value) || v.num === gb).length)
  }
  const chip = String(specs.chipset ?? specs.cpu ?? "")
  const chipM = chip.match(/(snapdragon\s*[\w.+-]*|dimensity\s*[\w.+-]*|exynos\s*[\w.+-]*|tensor\s*[\w.+-]*|helio\s*[\w.+-]*|kirin\s*[\w.+-]*|apple\s*a\d+|bionic)/i)
  if (chipM) {
    const tok = chipM[1].trim().toLowerCase()
    scorers.push((d) => 4 * [...specValues(d, "chipset"), ...specValues(d, "cpu")].filter((v) => v.value.toLowerCase().includes(tok)).length)
  }
  const bat = num(specs.battery ?? specs.battery_capacity)
  if (bat && bat > 0) {
    scorers.push((d) => 3 * [...specValues(d, "battery"), ...specValues(d, "battery_capacity")].filter((v) => v.num !== null && v.num >= bat * 0.88 && v.num <= bat * 1.12).length)
  }
  const dsp = num(specs.display_size ?? specs.display)
  if (dsp && dsp > 0) {
    scorers.push((d) => 2 * [...specValues(d, "display_size"), ...specValues(d, "display")].filter((v) => v.num !== null && v.num >= dsp - 0.35 && v.num <= dsp + 0.35).length)
  }
  const stoTok = String(specs.storage ?? "").split(/\s*,\s*/)[0]?.trim()
  const stoM = stoTok?.match(/(\d+)\s*(GB|TB)/i)
  if (stoM) {
    const re = new RegExp(`^${stoM[1]}\\s?${stoM[2]}`, "i")
    scorers.push((d) => 2 * specValues(d, "storage").filter((v) => re.test(v.value)).length)
  }

  let rows: MmDevice[] = []
  if (scorers.length) {
    rows = all
      .filter((d) => !exclude.has(d.id))
      .map((d) => ({ d, s: scorers.reduce((a, f) => a + f(d), 0) }))
      .filter((x) => x.s > 0)
      .sort(
        (a, b) =>
          b.s - a.s ||
          (price > 0 ? Math.abs(devicePrice(a.d) - price) - Math.abs(devicePrice(b.d) - price) : 0) ||
          views(b.d) - views(a.d) ||
          lid(b.d) - lid(a.d)
      )
      .slice(0, limit)
      .map((x) => x.d)
  }
  return pad(all, rows, limit, exclude, price)
}

export function relatedByPrice(all: MmDevice[], dev: MmDevice, price: number, limit = 3): MmDevice[] {
  const exclude = new Set([dev.id])
  let rows: MmDevice[] = []
  if (price > 0) {
    for (const band of [0.35, 0.55, 0.85]) {
      const lo = price * (1 - band)
      const hi = price * (1 + band)
      rows = all
        .filter((d) => !exclude.has(d.id) && devicePrice(d) > 0 && devicePrice(d) >= lo && devicePrice(d) <= hi)
        .sort((a, b) => Math.abs(devicePrice(a) - price) - Math.abs(devicePrice(b) - price) || views(b) - views(a))
        .slice(0, limit)
      if (rows.length >= limit) break
    }
  }
  return pad(all, rows, limit, exclude, price)
}

export function relatedByBrand(all: MmDevice[], dev: MmDevice, price: number, limit = 3): MmDevice[] {
  const exclude = new Set([dev.id])
  const brand = dev.metadata?.brand_handle
  let rows: MmDevice[] = []
  if (brand) {
    rows = all
      .filter((d) => !exclude.has(d.id) && d.metadata?.brand_handle === brand)
      .sort((a, b) => {
        const ra = rel(a)
        const rb = rel(b)
        if ((ra === null) !== (rb === null)) return ra === null ? 1 : -1
        if (ra !== null && rb !== null && ra !== rb) return rb - ra
        return views(b) - views(a)
      })
      .slice(0, limit)
  }
  return pad(all, rows, limit, exclude, price)
}
