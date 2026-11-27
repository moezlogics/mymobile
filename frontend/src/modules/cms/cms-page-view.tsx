import { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { getCmsPage } from "@lib/data/legacy"
import { getSiteSettings } from "@lib/data/site-settings"
import { canonicalUrl } from "@lib/util/seo-url"
import { htmlToText } from "@lib/util/html-text"
import { getMmSettings } from "@modules/mm/lib"
import LegacyScript from "@modules/mm/components/legacy-script"

/**
 * Editable CMS pages at /{handle}/ — the PHP templates, 1:1:
 *   page.php     privacy-policy, terms-conditions, disclaimer …
 *   about.php    about-us   (metadata.kind = "about")
 *   contact.php  contact-us (metadata.kind = "contact", with the form)
 * Title/description are the exact strings the PHP site rendered.
 */
export async function cmsPageMetadata(handle: string): Promise<Metadata> {
  const [page, s] = await Promise.all([getCmsPage(handle), getSiteSettings()])
  if (!page) return {}
  const title = page.seo_title?.trim() || page.title
  const description = page.seo_description?.trim() || htmlToText(page.content || "", 160) || undefined
  const url = canonicalUrl(`/${page.handle}/`)
  const image = s.seo_default_og_image?.trim() || undefined
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: s.site_name?.trim() || undefined, ...(image ? { images: [image] } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(image ? { images: [image] } : {}) },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    },
  }
}

const SOCIALS = [
  ["facebook_url", "fa-brands fa-facebook-f", "Facebook", "sp-soc-fb"],
  ["instagram_url", "fa-brands fa-instagram", "Instagram", "sp-soc-ig"],
  ["tiktok_url", "fa-brands fa-tiktok", "TikTok", "sp-soc-tt"],
  ["youtube_url", "fa-brands fa-youtube", "YouTube", "sp-soc-yt"],
  ["twitter_url", "fa-brands fa-x-twitter", "X / Twitter", "sp-soc-x"],
  ["linkedin_url", "fa-brands fa-linkedin-in", "LinkedIn", "sp-soc-li"],
] as const

const CONTACT_FLASH_JS = `(function(){
  var m = (location.hash || '').match(/^#contact-(ok|err|spam)$/);
  if (!m) return;
  var el = document.getElementById('contact-msg-' + m[1]);
  if (el) { el.hidden = false; history.replaceState(null, '', location.pathname + location.search); el.scrollIntoView({ block: 'center' }); }
})();`

export default async function CmsPageView({ handle }: { handle: string }) {
  const [page, { s, legacy }] = await Promise.all([getCmsPage(handle), getMmSettings()])
  if (!page) notFound()
  const kind = page.metadata?.kind
  const siteName = s.site_name || legacy.site_name || "My Mobile"
  const webPageLd = {
    "@context": "https://schema.org",
    "@type": kind === "contact" ? "ContactPage" : kind === "about" ? "AboutPage" : "WebPage",
    name: page.seo_title || page.title,
    url: canonicalUrl(`/${page.handle}/`),
    dateModified: page.updated_at,
    isPartOf: { "@type": "WebSite", name: siteName, url: canonicalUrl("/") },
  }
  // PHP header.php "BreadcrumbList — Custom Static Page" (plain pages only)
  const breadcrumbLd =
    kind === "contact" || kind === "about"
      ? null
      : {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: canonicalUrl("/") },
            { "@type": "ListItem", position: 2, name: page.title, item: canonicalUrl(`/${page.handle}/`) },
          ],
        }
  const ld = (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageLd) }} />
      {breadcrumbLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      )}
    </>
  )

  // ── about.php
  if (kind === "about") {
    return (
      <>
        {ld}
        <section className="static-hero">
          <div className="global-container static-hero__inner">
            <h1 className="static-hero__title">{page.title || "About Us"}</h1>
            <p className="static-hero__subtitle">
              {page.subtitle || "Your trusted source for breaking news, headlines and in-depth reporting."}
            </p>
          </div>
        </section>
        <section className="global-container static-body">
          <div className="static-card static-card--wide">
            {page.content ? (
              <div className="static-prose" dangerouslySetInnerHTML={{ __html: page.content }} />
            ) : (
              <div className="static-prose">
                <h2>Our Mission</h2>
                <p>
                  At {siteName}, our core mission is to deliver accurate, timely and independent news coverage across politics, business, sports,
                  technology and more.
                </p>
              </div>
            )}
            <div className="static-cta">
              <Link href="/" className="btn-brand">
                Read the Latest News
              </Link>
            </div>
          </div>
        </section>
      </>
    )
  }

  // ── contact.php
  if (kind === "contact") {
    const items: { icon: string; label: string; value: string; href: string }[] = []
    if (legacy.contact_email) items.push({ icon: "fa-regular fa-envelope", label: "Email", value: legacy.contact_email, href: `mailto:${legacy.contact_email}` })
    if (legacy.contact_phone)
      items.push({ icon: "fa-solid fa-phone", label: "Phone", value: legacy.contact_phone, href: `tel:${String(legacy.contact_phone).replace(/\s+/g, "")}` })
    if (legacy.contact_whatsapp) {
      const d = String(legacy.contact_whatsapp).replace(/\D+/g, "")
      if (d) items.push({ icon: "fa-brands fa-whatsapp", label: "WhatsApp", value: legacy.contact_whatsapp, href: `https://wa.me/${d}` })
    }
    const addr =
      String(legacy.business_address || "").trim() ||
      [legacy.business_city, legacy.business_state, legacy.business_postal, legacy.business_country].map((x) => String(x || "").trim()).filter(Boolean).join(", ")
    if (addr) {
      let maps = String(legacy.google_maps_url || "").trim()
      if (maps && !/^https?:\/\//i.test(maps)) maps = `https://${maps.replace(/^\/+/, "")}`
      items.push({ icon: "fa-solid fa-location-dot", label: "Address", value: addr, href: maps })
    }
    if (legacy.opening_hours) items.push({ icon: "fa-regular fa-clock", label: "Hours", value: legacy.opening_hours, href: "" })
    const socials = SOCIALS.filter(([k]) => legacy[k]).map(([k, icon, label, cls]) => ({ url: legacy[k], icon, label, cls }))

    return (
      <>
        {ld}
        <section className="static-hero">
          <div className="global-container static-hero__inner">
            <h1 className="static-hero__title">{page.title || "Contact Us"}</h1>
            <p className="static-hero__subtitle">{page.subtitle || "Have a question? We'd love to hear from you."}</p>
          </div>
        </section>
        <section className="global-container static-body">
          <div className="contact-grid">
            <aside className="static-card contact-aside">
              <h2 className="contact-aside__title">Get in Touch</h2>
              <p className="contact-aside__text">Reach us through any of the channels below. We usually respond within 48 hours.</p>
              {items.length > 0 && (
                <ul className="contact-info-list">
                  {items.map((item) => (
                    <li key={item.label}>
                      <span className="contact-info-icon">
                        <i className={item.icon} />
                      </span>
                      <div>
                        <span className="contact-info-label">{item.label}</span>
                        {item.href ? (
                          <a href={item.href} className="contact-info-value" {...(item.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                            {item.value}
                          </a>
                        ) : (
                          <span className="contact-info-value">{item.value}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {socials.length > 0 && (
                <div className="contact-social">
                  <span className="contact-social__label">Follow Us</span>
                  <div className="contact-social__links">
                    {socials.map((soc) => (
                      <a key={soc.label} href={soc.url} target="_blank" rel="noopener noreferrer" className={`contact-social-btn ${soc.cls}`} title={soc.label}>
                        <i className={soc.icon} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </aside>

            <div className="static-card contact-form-card">
              <div className="static-alert static-alert--ok" id="contact-msg-ok" hidden>
                <i className="fa-solid fa-circle-check" /> Thank you! Your message has been sent successfully.
              </div>
              <div className="static-alert static-alert--err" id="contact-msg-err" hidden>
                <i className="fa-solid fa-triangle-exclamation" /> Please fill in all fields.
              </div>
              <div className="static-alert static-alert--warn" id="contact-msg-spam" hidden>
                <i className="fa-solid fa-circle-exclamation" /> Your message could not be sent. Please try again.
              </div>
              <form method="POST" action="/api/mm/contact" className="contact-form">
                <input type="hidden" name="back" value={`/${page.handle}/`} />
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
                />
                <div className="contact-form-grid">
                  <div>
                    <label htmlFor="cName">Full Name</label>
                    <input type="text" id="cName" name="name" required placeholder="Your name" />
                  </div>
                  <div>
                    <label htmlFor="cEmail">Email Address</label>
                    <input type="email" id="cEmail" name="email" required placeholder="you@example.com" />
                  </div>
                </div>
                <div className="contact-form-field">
                  <label htmlFor="cSubject">Subject</label>
                  <input type="text" id="cSubject" name="subject" required placeholder="How can we help?" />
                </div>
                <div className="contact-form-field">
                  <label htmlFor="cMessage">Message</label>
                  <textarea id="cMessage" name="message" rows={5} required placeholder="Write your message here..." />
                </div>
                <button type="submit" className="btn-brand contact-submit">
                  <i className="fa-solid fa-paper-plane" /> Send Message
                </button>
              </form>
            </div>
          </div>
          {page.content && (
            <div className="static-card static-card--wide contact-extra">
              <div className="static-prose" dangerouslySetInnerHTML={{ __html: page.content }} />
            </div>
          )}
        </section>
        <LegacyScript code={CONTACT_FLASH_JS} />
      </>
    )
  }

  // ── page.php
  return (
    <>
      {ld}
      <div className="border-b border-slate-100 bg-white/40 backdrop-blur-md py-12">
        <div className="global-container text-center">
          <h1 className="text-2xl md:text-4xl font-extrabold text-slate-900">{page.title}</h1>
        </div>
      </div>
      <div className="global-container py-12">
        <div className="p-1 md:p-3">
          <div className="prose prose-slate max-w-none article-content" dangerouslySetInnerHTML={{ __html: page.content || "" }} />
        </div>
      </div>
    </>
  )
}
