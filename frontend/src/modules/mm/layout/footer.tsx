import Link from "next/link"
import { getMmSettings, mmImage } from "@modules/mm/lib"
import MmMobileNav from "./mobile-nav"

/**
 * mymobile.pk footer — ported 1:1 from includes/footer.php (brand blurb,
 * footer menu, contact block, socials, copyright) + the mobile bottom nav.
 */
const SOCIALS = [
  { key: "facebook_url", label: "Facebook", icon: "fa-brands fa-facebook-f", mod: "sf-social--fb" },
  { key: "instagram_url", label: "Instagram", icon: "fa-brands fa-instagram", mod: "sf-social--ig" },
  { key: "tiktok_url", label: "TikTok", icon: "fa-brands fa-tiktok", mod: "sf-social--tt" },
  { key: "youtube_url", label: "YouTube", icon: "fa-brands fa-youtube", mod: "sf-social--yt" },
  { key: "twitter_url", label: "X / Twitter", icon: "fa-brands fa-x-twitter", mod: "sf-social--x" },
  { key: "linkedin_url", label: "LinkedIn", icon: "fa-brands fa-linkedin-in", mod: "sf-social--li" },
]

const normalizeUrl = (u: any) => {
  const s = String(u || "").trim()
  if (!s) return ""
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`
}

export default async function MmFooter() {
  const { s, legacy } = await getMmSettings()
  const siteName = s.site_name || legacy.site_name || "My Mobile"
  const logo = s.site_logo_url || mmImage(legacy.site_logo) || null
  const aboutSlug = s.about_page_slug || legacy.about_page_slug || "about-us"
  const contactSlug = s.contact_page_slug || legacy.contact_page_slug || "contact-us"

  // Footer menu (footer_menu_items). Legacy /about/ and /contact/ entries
  // point at the configurable about/contact slugs, as the PHP router did.
  let flat: { label: string; url: string }[] = []
  try {
    flat = (JSON.parse(s.menu_footer_json || "[]") as any[])
      .filter((m) => !(Number(m.parent_id) > 0))
      .map((m) => {
        let u = String(m.url || "").trim()
        const clean = u.replace(/^\/+|\/+$/g, "")
        if (clean === "about") u = `/${aboutSlug}/`
        else if (clean === "contact") u = `/${contactSlug}/`
        else if (!/^https?:\/\//i.test(u)) u = clean ? `/${clean}/` : "/"
        return { label: m.label, url: u }
      })
  } catch {}

  const socials = SOCIALS.map((d) => ({ ...d, url: normalizeUrl(legacy[d.key]) })).filter((d) => d.url)
  const waRaw = String(legacy.contact_whatsapp || s.whatsapp_number || "").replace(/[^0-9]/g, "")
  if (waRaw) {
    const wa = /^0(3\d{9})$/.test(waRaw) ? `92${waRaw.slice(1)}` : waRaw
    socials.push({ key: "wa", label: "WhatsApp", icon: "fa-brands fa-whatsapp", mod: "sf-social--wa", url: `https://wa.me/${wa}` })
  }

  const address =
    String(legacy.business_address || "").trim() ||
    [legacy.business_city, legacy.business_state, legacy.business_postal, legacy.business_country]
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .join(", ")
  const mapsUrl = normalizeUrl(legacy.google_maps_url)
  const email = String(legacy.contact_email || s.contact_email || "").trim()
  const phone = String(legacy.contact_phone || s.contact_phone || "").trim()
  const showContact = !!(address || email || phone || socials.length)
  const desc =
    legacy.homepage_description || legacy.seo_description || "Latest breaking news, headlines and in-depth stories."

  return (
    <>
      <footer className="site-footer sf">
        <div className="sf-inner">
          <div className="sf-top">
            <div className="sf-brand">
              {logo ? (
                <Link href="/" className="sf-logo-link" aria-label={siteName}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo} alt={siteName} className="sf-logo" width={200} height={54} loading="lazy" decoding="async" />
                </Link>
              ) : (
                <Link href="/" className="sf-site-name-link">
                  <p className="sf-site-name">{siteName}</p>
                </Link>
              )}
              <p className="sf-desc">{desc}</p>
            </div>

            <nav className="sf-nav" aria-label="Footer Navigation">
              {flat.length > 0 && (
                <div className="sf-nav-col">
                  <span className="sf-nav-heading">Quick Links</span>
                  <ul className="sf-nav-list">
                    {flat.map((l, i) => (
                      <li key={i}>
                        <Link href={l.url}>{l.label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </nav>

            {showContact && (
              <div className="sf-contact">
                <div className="sf-contact-details">
                  {address && (
                    <div className="sf-address">
                      {mapsUrl ? (
                        <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                          <i className="fa-solid fa-location-dot sf-contact-icon" aria-hidden="true" />
                          <span>{address}</span>
                        </a>
                      ) : (
                        <div className="sf-address-text">
                          <i className="fa-solid fa-location-dot sf-contact-icon" aria-hidden="true" />
                          <span>{address}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {phone && (
                    <div className="sf-contact-item sf-phone">
                      <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`}>
                        <i className="fa-solid fa-phone sf-contact-icon" aria-hidden="true" />
                        <span>{phone}</span>
                      </a>
                    </div>
                  )}
                  {email && (
                    <div className="sf-contact-item sf-email">
                      <a href={`mailto:${email}`}>
                        <i className="fa-solid fa-envelope sf-contact-icon" aria-hidden="true" />
                        <span>{email}</span>
                      </a>
                    </div>
                  )}
                </div>
                {socials.length > 0 && (
                  <div className="sf-socials-wrap">
                    <span className="sf-nav-heading sf-socials-heading">Follow Us</span>
                    <ul className="sf-socials" aria-label="Social media">
                      {socials.map((soc) => (
                        <li key={soc.key}>
                          <a
                            href={soc.url}
                            className={`sf-social ${soc.mod}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={soc.label}
                            title={soc.label}
                          >
                            <i className={soc.icon} aria-hidden="true" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="sf-bottom">
            <p className="sf-copy">
              &copy; {new Date().getFullYear()} {siteName}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
      <MmMobileNav />
    </>
  )
}
