import "server-only"
import { cache } from "react"
import { postPath, type BlogPost } from "@lib/data/blog"
import { mmThumb } from "@modules/mm/lib"
import { KN_ADS_CLIENT, KN_ADS_ENABLED, KN_ADS_SLOT } from "@modules/mm/components/kn-ad"

/**
 * Blog helpers ported from blog.php / archive.php / single.php /
 * lib/related_posts.php / lib/ads.php.
 */
const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:3102"
const PK = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

export const getAllPosts = cache(async (): Promise<BlogPost[]> => {
  const out: BlogPost[] = []
  for (let offset = 0; offset < 5000; offset += 50) {
    const r = await fetch(`${BACKEND_URL}/store/blog/posts?limit=50&offset=${offset}`, {
      headers: PK ? { "x-publishable-api-key": PK } : {},
      next: { revalidate: 300, tags: ["blog"] },
    })
    if (!r.ok) throw new Error(`posts fetch failed: HTTP ${r.status}`)
    const { posts } = await r.json()
    out.push(...posts)
    if (posts.length < 50) break
  }
  // ORDER BY posted_date DESC, id DESC
  return out.sort(
    (a, b) =>
      (Date.parse(b.published_at || b.created_at) || 0) - (Date.parse(a.published_at || a.created_at) || 0) ||
      (Number(b.metadata?.legacy_id) || 0) - (Number(a.metadata?.legacy_id) || 0)
  )
})

const pad2 = (n: number) => String(n).padStart(2, "0")
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** news_time_ago() / blog_time_ago() */
export function timeAgo(iso?: string | null): string {
  if (!iso) return ""
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return ""
  const diff = (Date.now() - ts) / 1000
  if (diff < 60) return "Just now"
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
  if (diff < 172800) return "Yesterday"
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`
  const d = new Date(ts)
  return `${pad2(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}`
}

/** date('F j, Y g:i A') */
export function longDateTime(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const h = d.getHours() % 12 || 12
  return `${MONTH[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${h}:${pad2(d.getMinutes())} ${d.getHours() < 12 ? "AM" : "PM"}`
}

/** date('d M Y, h:i A') */
export function commentDate(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const h = d.getHours() % 12 || 12
  return `${pad2(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}, ${pad2(h)}:${pad2(d.getMinutes())} ${d.getHours() < 12 ? "AM" : "PM"}`
}

export const primaryCategory = (p: BlogPost) =>
  p.categories?.find((c) => c.handle === p.metadata?.primary_category_handle) || p.categories?.[0] || null

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

/** render_blog_archive_item() as an HTML string (for infinite-scroll batches). */
export function blogItemHtml(p: BlogPost): string {
  const cat = primaryCategory(p)
  const img = mmThumb(p.featured_image, 480) || ""
  const excerpt = p.excerpt ? esc(p.excerpt.slice(0, 180)) : ""
  return `<a href="${esc(postPath(p))}" class="arc-item"><div class="news-thumb arc-thumb"><img src="${esc(img)}" alt="${esc(p.title)}" loading="lazy" decoding="async" width="480" height="270"></div><div class="arc-body">${
    cat ? `<span class="news-cat-chip">${esc(cat.name)}</span>` : ""
  }<h2 class="arc-title line-clamp-2">${esc(p.title)}</h2>${excerpt ? `<p class="arc-excerpt line-clamp-2">${excerpt}</p>` : ""}<div class="news-meta">${
    p.author?.name ? `<span class="arc-author">By ${esc(p.author.name)}</span><span>·</span>` : ""
  }<span>${esc(timeAgo(p.published_at || p.created_at))}</span></div></div></a>`
}

// ── related_posts.php ───────────────────────────────────────────────────
const STOP = new Set(
  (
    "the a an and or but for to of in on at by with from as is are was were be been this that these those it its his her their our your my we you they he she " +
    "will would can could should shall may might must have has had do does did not no yes if then than when where what which who whom whose how why all any " +
    "each more most other some such only own same so too very just about after before during under over again further once here there new latest best top " +
    "price prices mobile mobiles phone phones pakistan pkr rs full specs specifications review news update updates"
  ).split(" ")
)
function keywords(text: string): string[] {
  const t = text.replace(/<[^>]*>/g, " ").toLowerCase().replace(/[^a-z0-9\s]+/g, " ")
  return [...new Set(t.split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)))]
}

export function relatedPosts(all: BlogPost[], post: BlogPost, need: number, pinned: number[] = []): BlogPost[] {
  const byLegacy = new Map(all.map((p) => [Number(p.metadata?.legacy_id), p]))
  const myId = Number(post.metadata?.legacy_id)
  let manual: number[] = []
  try {
    manual = (JSON.parse(String(post.metadata?.related_manual || "[]")) as any[]).map(Number).filter(Boolean)
  } catch {}
  const wanted = [...pinned, ...manual].filter((id, i, a) => id !== myId && a.indexOf(id) === i)
  const rows = wanted.map((id) => byLegacy.get(id)).filter(Boolean).slice(0, need) as BlogPost[]
  if (rows.length >= need) return rows

  const have = new Set([post.id, ...rows.map((r) => r.id)])
  const tags = new Set((post.tags || []).map((t) => t.id))
  const primary = primaryCategory(post)?.id
  const extra = new Set((post.categories || []).map((c) => c.id).filter((id) => id !== primary))
  const mine = new Set(keywords(`${post.title} ${post.excerpt || ""}`))
  const yearAgo = Date.now() - 365 * 86400_000
  const scored = all
    .filter((p) => !have.has(p.id))
    .map((p) => {
      const pPrimary = primaryCategory(p)?.id
      let s = (p.tags || []).filter((t) => tags.has(t.id)).length * 4
      if (primary && pPrimary === primary) s += 3
      s += (p.categories || []).filter((c) => c.id !== pPrimary && extra.has(c.id)).length
      if ((Date.parse(p.published_at || p.created_at) || 0) >= yearAgo) s += 1
      s += keywords(p.title).filter((w) => mine.has(w)).length * 2
      return { p, s, ts: Date.parse(p.published_at || p.created_at) || 0 }
    })
    .sort((a, b) => b.s - a.s || b.ts - a.ts)
  return [...rows, ...scored.map((x) => x.p)].slice(0, need)
}

function relatedBox(rows: BlogPost[], title: string): string {
  if (!rows.length) return ""
  return `<aside class="sp-related" aria-label="${esc(title)}"><div class="sp-related-head">${esc(title)}</div><ul class="sp-related-list">${rows
    .map((r) => {
      const thumb = r.featured_image ? mmThumb(r.featured_image, 120) : ""
      return `<li><a href="${esc(postPath(r))}">${
        thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" decoding="async" width="80" height="60">` : ""
      }<span>${esc(r.title)}</span></a></li>`
    })
    .join("")}</ul></aside>`
}

export function relatedPostsInject(html: string, all: BlogPost[], post: BlogPost, legacy: Record<string, any>): string {
  const enabled = Number(legacy.related_enabled ?? 1) === 1
  if (!enabled || post.metadata?.related_off) return html
  const positions = String(legacy.related_positions ?? "3,7")
    .split(/[^0-9]+/)
    .map(Number)
    .filter(Boolean)
    .sort((a, b) => a - b)
  const pos = positions.length ? positions : [3, 7]
  const perBox = Math.max(1, Math.min(6, Number(legacy.related_count ?? 3) || 3))
  const title = String(legacy.related_title || "").trim() || "Also Read"
  const pinned = String(legacy.related_pinned || "").split(/[^0-9]+/).map(Number).filter(Boolean)
  const rows = relatedPosts(all, post, Math.min(pos.length * perBox, 12), pinned)
  if (!rows.length) return html
  const boxes: BlogPost[][] = []
  for (let i = 0; i < rows.length; i += perBox) boxes.push(rows.slice(i, i + perBox))
  const map = new Map<number, string[]>()
  pos.forEach((p, i) => {
    if (boxes[i]) map.set(Math.max(1, p), [...(map.get(Math.max(1, p)) || []), relatedBox(boxes[i], title)])
  })
  const parts = html.split(/(<\/p>)/i)
  let out = ""
  let closed = 0
  for (const part of parts) {
    out += part
    if (part.trim().toLowerCase() === "</p>") {
      closed++
      if (map.has(closed)) {
        out += map.get(closed)!.join("")
        map.delete(closed)
      }
    }
  }
  for (const k of [...map.keys()].sort((a, b) => a - b)) out += map.get(k)!.join("")
  return out
}

// ── lib/ads.php kn_ad_inject_paragraphs() ───────────────────────────────
const adHtml = () =>
  `<div class="kn-ad">\n  <ins class="adsbygoogle" style="display:block"\n       data-ad-client="${KN_ADS_CLIENT}"\n       data-ad-slot="${KN_ADS_SLOT}"\n       data-ad-format="auto"\n       data-full-width-responsive="true"></ins>\n</div>`

export function adInjectParagraphs(html: string, first = 2, every = 4, max = 12): string {
  if (!KN_ADS_ENABLED || !html.trim()) return html
  const parts = html.split(/(<\/p>)/i)
  let out = ""
  let para = 0
  let placed = 0
  let last = 0
  for (const seg of parts) {
    out += seg
    if (seg.toLowerCase() !== "</p>") continue
    para++
    if (para >= first && (para - first) % every === 0 && placed < max) {
      out += adHtml()
      placed++
      last = para
    }
  }
  if (para > 0 && last !== para) out += adHtml()
  return out
}

/** single.php body clean-up: no <h1> in the body, drop empty headings. */
export function cleanPostBody(html: string): string {
  return html
    .replace(/<h1(\s[^>]*)?>/gi, "<h2$1>")
    .replace(/<\/h1>/gi, "</h2>")
    .replace(/<h([2-6])(\s[^>]*)?>\s*(?:&nbsp;|\s|<br\s*\/?>)*<\/h\1>/gi, "")
}

export type MmComment = { id: string; parent_id: string | null; name: string; content: string; is_admin: boolean; created_at: string }

export async function getComments(handle: string): Promise<MmComment[]> {
  try {
    const r = await fetch(`${BACKEND_URL}/store/blog/posts/${encodeURIComponent(handle)}/comments`, {
      headers: PK ? { "x-publishable-api-key": PK } : {},
      next: { revalidate: 60, tags: ["blog-comments", `comments-${handle}`] },
    })
    return r.ok ? (await r.json()).comments || [] : []
  } catch {
    return []
  }
}

/** get_guest_avatar_color() — crc32(lower(trim(name))) % 8 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
export function avatarColor(name: string): string {
  const colors = ["#0284c7", "#0d9488", "#059669", "#7c3aed", "#db2777", "#ea580c", "#e11d48", "#2563eb"]
  const bytes = new TextEncoder().encode(name.trim().toLowerCase())
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  const crc = (c ^ 0xffffffff) >>> 0
  return colors[crc % colors.length]
}
