import Link from "next/link"
import type { MmDevice } from "@modules/mm/lib/devices"
import { deviceFromPrice, formatPrice, mmThumb } from "@modules/mm/lib"

/**
 * includes/device_card.php — a 6:7 product shot, the name and the price.
 * `DeviceCard` (React) and `deviceCardHtml` (string, for the AJAX fragments
 * the PHP infinite-scroll / filter scripts append) emit identical markup.
 */
function cardData(d: MmDevice) {
  const img = mmThumb(d.thumbnail || d.images?.[0]?.url || "", 260)
  const from = deviceFromPrice(d)
  const alt = d.metadata?.image_alt || `${d.title} price and specifications`
  return { href: `/products/${d.handle}/`, img, from, alt }
}

const PhoneIcon = () => (
  <span className="dv-card-noimg" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </svg>
  </span>
)

export default function DeviceCard({ d, eager = false }: { d: MmDevice; eager?: boolean }) {
  const { href, img, from, alt } = cardData(d)
  return (
    <Link className="dv-card" href={href}>
      <span className="dv-card-img">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={alt}
            {...(eager ? { fetchPriority: "high" as const } : { loading: "lazy" as const })}
            decoding="async"
            width={240}
            height={280}
          />
        ) : (
          <PhoneIcon />
        )}
      </span>
      <span className="dv-card-body">
        <span className="dv-name">{d.title}</span>
        <span className="dv-price">{from !== null ? formatPrice(from) : <span className="tba">Coming soon</span>}</span>
      </span>
    </Link>
  )
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export function deviceCardHtml(d: MmDevice): string {
  const { href, img, from, alt } = cardData(d)
  const media = img
    ? `<img src="${esc(img)}" alt="${esc(alt)}" loading="lazy" decoding="async" width="240" height="280">`
    : `<span class="dv-card-noimg" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10.5 18.5h3"/></svg></span>`
  const price = from !== null ? esc(formatPrice(from)) : `<span class="tba">Coming soon</span>`
  return `<a class="dv-card" href="${esc(href)}"><span class="dv-card-img">${media}</span><span class="dv-card-body"><span class="dv-name">${esc(d.title)}</span><span class="dv-price">${price}</span></span></a>`
}
