/**
 * Ports of the lib/specs.php display helpers used by device.php:
 * spec_format_value, build_spec_groups, spec_short_value,
 * device_featured_specs, spec_group_icon, spec_panel_icon,
 * related_rail_key_for_group, availability_label, render_stars.
 */
import type { SpecField, SpecGroup } from "./devices"

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export function specFormatValue(raw: any, field: Partial<SpecField>): string {
  if (raw === null || raw === undefined || raw === "") return ""
  if (typeof raw === "boolean") return raw ? "Yes" : "No"
  if (Array.isArray(raw)) raw = raw.map(String).join(", ")
  let s = String(raw).trim()
  if (!s) return ""
  const type = field.type || "text"
  if (type === "boolean") return ["1", "true", "yes", "y", "on"].includes(s.toLowerCase()) ? "Yes" : "No"
  if (type === "date") {
    const t = Date.parse(s)
    if (Number.isFinite(t)) {
      const d = new Date(t)
      let label = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
      if (t > Date.now()) label += " (Expected)"
      return label
    }
    return s
  }
  if (type === "number" && /^-?\d+(\.\d+)?$/.test(s) && Math.abs(Number(s)) >= 10000) {
    const n = Number(s)
    s = n.toLocaleString("en-US", { maximumFractionDigits: Number.isInteger(n) ? 0 : 2, minimumFractionDigits: Number.isInteger(n) ? 0 : 2 })
  }
  const unit = String(field.unit || "").trim()
  if (unit && !s.toLowerCase().includes(unit.toLowerCase())) s += ` ${unit}`
  return s
}

export type SpecRow = { key: string; label: string; value: string }
export type BuiltGroup = { name: string; icon: string; rows: SpecRow[] }

export function buildSpecGroups(specs: Record<string, any>, groups: SpecGroup[]): BuiltGroup[] {
  const out: BuiltGroup[] = []
  const used = new Set<string>()
  for (const g of groups) {
    const rows: SpecRow[] = []
    for (const f of g.fields || []) {
      used.add(f.key)
      if (!(f.key in specs)) continue
      const value = specFormatValue(specs[f.key], f)
      if (value === "") continue
      rows.push({ key: f.key, label: f.label, value })
    }
    if (rows.length) out.push({ name: g.name, icon: g.icon || "ph-info", rows })
  }
  const other: SpecRow[] = []
  for (const [k, v] of Object.entries(specs || {})) {
    if (used.has(k) || k === "" || k[0] === "_") continue
    const value = specFormatValue(v, { type: "text" })
    if (value === "") continue
    other.push({ key: k, label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), value })
  }
  if (other.length) out.push({ name: "Other", icon: "ph-info", rows: other })
  return out
}

export function specShortValue(raw: any, mode = ""): string {
  if (raw === null || raw === undefined || raw === "" || Array.isArray(raw) || typeof raw === "object") return ""
  let s = String(raw).trim()
  if (!s) return ""
  s = s.split("\n")[0].trim()
  if (["camera", "charging", "refresh", "display", "memory", "storage", "fps"].includes(mode)) s = s.split(",")[0].trim()
  if (["chipset", "camera", "charging", "fps"].includes(mode)) s = s.split("(")[0].trim()
  if (mode === "chipset") s = s.replace(/^(qualcomm|mediatek|media tek)\s+/i, "")
  if (mode === "camera") {
    const m = s.match(/(\d+(?:\.\d+)?)\s*MP/i)
    if (m) s = `${m[1]} MP`
  }
  return s.trim()
}

export type FeaturedRow = { icon: string; value: string; sub: string; anchor: string }

export function deviceFeaturedSpecs(specs: Record<string, any>): FeaturedRow[] {
  const get = (keys: string[]): [string | null, any] => {
    for (const k of keys) {
      const v = specs?.[k]
      if (v !== undefined && v !== null && String(v).trim() !== "") return [k, v]
    }
    return [null, null]
  }
  const [camKey, camRaw] = get(["camera_main", "camera"])
  const [selKey, selRaw] = get(["camera_front"])
  const [ramKey, ramRaw] = get(["ram", "memory"])
  const [stoKey, stoRaw] = get(["storage"])
  const [dspKey, dspRaw] = get(["display_size", "display"])
  const [rfrKey, rfrRaw] = get(["refresh_rate", "display_resolution"])
  const [batKey, batRaw] = get(["battery", "battery_capacity"])
  const [chgKey, chgRaw] = get(["charging", "charging_speed"])
  const [chpKey, chpRaw] = get(["chipset", "cpu"])
  const [fpsKey, fpsRaw] = get(["gaming_fps", "pubg_fps"])

  const camera = specShortValue(camRaw, "camera")
  const selfie = specShortValue(selRaw, "camera")
  let ram = specShortValue(ramRaw, "memory")
  const storage = specShortValue(stoRaw, "storage")
  let display = specShortValue(dspRaw, "display")
  const refresh = specShortValue(rfrRaw, "refresh")
  let battery = specShortValue(batRaw, "")
  const charging = specShortValue(chgRaw, "charging")
  const chipset = specShortValue(chpRaw, "chipset")
  const fps = specShortValue(fpsRaw, "fps")

  if (battery && !/mah/i.test(battery)) battery += " mAh"
  if (ram && !/ram/i.test(ram)) ram += " RAM"
  if (display && !/inch|"|”/i.test(display)) display += " inches"
  const fpsLine = fps ? (/pubg/i.test(fps) ? fps : `${fps} on PUBG`) : ""

  const rows: FeaturedRow[] = [
    { icon: "camera", value: camera, sub: selfie ? `${selfie} Selfie` : "", anchor: camKey || selKey || "" },
    { icon: "memory", value: ram, sub: storage ? `${storage} Storage` : "", anchor: ramKey || stoKey || "" },
    { icon: "display", value: display, sub: refresh, anchor: dspKey || rfrKey || "" },
    { icon: "battery", value: battery, sub: charging, anchor: batKey || chgKey || "" },
    { icon: "gaming", value: fpsLine || chipset, sub: fpsLine ? chipset : "", anchor: fpsKey || chpKey || "" },
  ]
  return rows.filter((r) => r.value !== "" || r.sub !== "")
}

const GROUP_ICONS: Record<string, string> = {
  "rocket-launch": '<path d="M5 13c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M14.5 4.5C17 2 21 3 21 3s1 4-1.5 6.5L14 15l-5-5 5.5-5.5z"/><circle cx="15.5" cy="8.5" r="1.4"/><path d="m9 10-4 1 1 4"/>',
  "cell-signal-high": '<path d="M4 20h1M9 20v-4M14 20v-9M19 20V6"/>',
  signal: '<path d="M4 20h1M9 20v-4M14 20v-9M19 20V6"/>',
  ruler: '<path d="m15.5 2.5 6 6a1.4 1.4 0 0 1 0 2l-11 11a1.4 1.4 0 0 1-2 0l-6-6a1.4 1.4 0 0 1 0-2l11-11a1.4 1.4 0 0 1 2 0z"/><path d="m10 6 2 2M7.5 8.5l1.5 1.5M5 11l2 2M13 16l2 2"/>',
  monitor: '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M10.5 5h3"/>',
  cpu: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M9 1.5v2.5M15 1.5v2.5M9 20v2.5M15 20v2.5M1.5 9H4M1.5 15H4M20 9h2.5M20 15h2.5"/>',
  database: '<rect x="2" y="7" width="20" height="9" rx="1.5"/><rect x="5" y="10" width="3" height="3.5" rx=".5"/><rect x="10.5" y="10" width="3" height="3.5" rx=".5"/><rect x="16" y="10" width="3" height="3.5" rx=".5"/><path d="M6 16v2M12 16v2M18 16v2"/>',
  camera: '<path d="M14.5 4h-5L8 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4l-1.5-3z"/><circle cx="12" cy="13" r="4"/>',
  "user-focus": '<path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16"/><circle cx="12" cy="10.5" r="2.4"/><path d="M8 17a4.2 4.2 0 0 1 8 0"/>',
  "battery-full": '<rect x="2" y="6" width="16" height="12" rx="2.5"/><path d="M20 10v4" stroke-width="2.4"/><path d="M6 10v4M9.5 10v4M13 10v4"/>',
  battery: '<rect x="2" y="6" width="16" height="12" rx="2.5"/><path d="M20 10v4" stroke-width="2.4"/>',
  "speaker-high": '<path d="M4 9h3l4.5-3.5v13L7 15H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z"/><path d="M16 9.2a4 4 0 0 1 0 5.6M18.6 6.6a7.6 7.6 0 0 1 0 10.8"/>',
  "wifi-high": '<path d="M2.5 9a15 15 0 0 1 19 0M5.8 12.4a10 10 0 0 1 12.4 0M9.2 15.8a5 5 0 0 1 5.6 0"/><circle cx="12" cy="19.3" r="1.1" fill="currentColor" stroke="none"/>',
  "circles-three": '<circle cx="8" cy="8" r="4"/><circle cx="16.5" cy="8" r="4"/><circle cx="12" cy="16" r="4"/>',
  heartbeat: '<path d="M20.8 6.6a5 5 0 0 0-8.8-1.9 5 5 0 0 0-8.8 1.9c-1 3.7 3.4 8 8.8 12.4 5.4-4.4 9.8-8.7 8.8-12.4z"/><path d="M3.5 12h4l1.5-2.5 2 5 1.8-3.5H20"/>',
  watch: '<circle cx="12" cy="12" r="6"/><path d="M9 6.2 9.5 2.5h5L15 6.2M9 17.8l.5 3.7h5l.5-3.7M12 9.5V12l1.8 1.2"/>',
  headphones: '<path d="M3.5 15v-3a8.5 8.5 0 0 1 17 0v3"/><rect x="2" y="14" width="4.5" height="6.5" rx="1.8"/><rect x="17.5" y="14" width="4.5" height="6.5" rx="1.8"/>',
  laptop: '<rect x="4" y="4.5" width="16" height="11" rx="1.8"/><path d="M2 18.5h20"/>',
  "device-mobile": '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10.5 18.5h3"/>',
  "device-tablet": '<rect x="4" y="2" width="16" height="20" rx="2.5"/><path d="M10.5 18.5h3"/>',
  "list-checks": '<path d="M10 6h11M10 12h11M10 18h11"/><path d="m3 6 1.5 1.5L7.5 4.5M3 12l1.5 1.5L7.5 10.5M3 18l1.5 1.5L7.5 16.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
}

export function specGroupIconSvg(name: string): string {
  const n = String(name || "").trim().toLowerCase().replace(/^ph[-_]?/, "")
  const path = GROUP_ICONS[n] || GROUP_ICONS.info
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
}

const PANEL_ICONS: Record<string, string> = {
  camera: '<path d="M14.5 4h-5L8 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4l-1.5-3z"/><circle cx="12" cy="13" r="4"/>',
  memory: '<rect x="2" y="7" width="20" height="9" rx="1"/><rect x="4.5" y="9.5" width="3.5" height="4" rx=".5"/><rect x="10.25" y="9.5" width="3.5" height="4" rx=".5"/><rect x="16" y="9.5" width="3.5" height="4" rx=".5"/><path d="M6 16v2M12 16v2M18 16v2"/>',
  display: '<rect x="5" y="2" width="14" height="20" rx="3"/><rect x="10" y="3.5" width="4" height="1.2" rx=".6" fill="currentColor"/><path d="M6 17l3-3.5 3 3.5 4-5.5 3 5.5" stroke-width="1.5"/>',
  battery: '<rect x="2" y="6" width="16" height="12" rx="2.5"/><path d="M20 10v4" stroke-width="2.5"/><path d="M11 8.5L8.5 12h3l-1 4 4-4.5h-3l1-3z" fill="currentColor"/>',
  gaming: '<path d="M6 7h12a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-1l-1 3a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1l-1-3H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5z"/><path d="M7 11h4M9 9v4" stroke-width="2"/><circle cx="16" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12.5" r="1.2" fill="currentColor" stroke="none"/>',
}

export function specPanelIconSvg(name: string): string {
  const path = PANEL_ICONS[name] || PANEL_ICONS.display
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
}

export function relatedRailKeyForGroup(groupName: string): "specs" | "price" | "brand" | null {
  const n = String(groupName || "").trim().toLowerCase()
  if (!n) return null
  if (n.includes("body") || n === "design" || n.includes("body &")) return "specs"
  if (n.includes("design") && !n.includes("audio") && !n.includes("connect")) return "specs"
  if (!n.includes("selfie") && (n.includes("main camera") || n === "camera")) return "price"
  if (n.includes("sensor") || (n.includes("feature") && !n.includes("camera"))) return "brand"
  return null
}

export function availabilityLabel(a?: string) {
  switch (a) {
    case "coming_soon":
      return { label: "Coming Soon", class: "soon" }
    case "rumored":
      return { label: "Rumored", class: "rumored" }
    case "discontinued":
      return { label: "Discontinued", class: "gone" }
    default:
      return { label: "Available", class: "ok" }
  }
}

/** render_stars() → array of fill states for <span class="dv-star dv-star-…"> */
export function starFills(rating: number): ("full" | "half" | "empty")[] {
  return [1, 2, 3, 4, 5].map((i) => (rating >= i ? "full" : rating >= i - 0.5 ? "half" : "empty"))
}

/** PHP date('j M Y') */
export function fmtShortDate(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })} ${d.getFullYear()}`
}
