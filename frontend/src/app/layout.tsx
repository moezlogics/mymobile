import { getBaseURL } from "@lib/util/env"
import { Metadata, Viewport } from "next"
import Script from "next/script"
import GoogleAnalytics from "@modules/analytics/google-analytics"
import MetaPixel from "@modules/analytics/meta-pixel"
import CustomHeadCode from "@modules/analytics/custom-head-code"
import BusinessJsonLd from "@modules/seo/business-json-ld"
import SiteJsonLd from "@modules/seo/site-json-ld"
import { getSiteSettings, resolveProductCardAspectClass } from "@lib/data/site-settings"
import { CartDrawerProvider } from "@lib/context/cart-drawer-context"
import { SiteSettingsProvider } from "@lib/context/site-settings-context"
import { UserDataProvider } from "@lib/context/user-data-context"

/*
 * mymobile.pk keeps its ORIGINAL design: the PHP site's stylesheets are
 * served unchanged from /public/mm and the public pages render the PHP
 * template markup (src/modules/mm). The zmobile storefront stylesheet
 * (styles/globals.css) is only loaded by the cart / checkout / account
 * layouts, so the two designs never fight over the same class names.
 */

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings()

  const siteName = settings.site_name?.trim()
  const tagline = settings.site_tagline?.trim()
  const title = settings.seo_home_title?.trim()
  const description = settings.seo_home_description?.trim()

  const meta: Metadata = {
    metadataBase: new URL(getBaseURL()),
  }

  if (siteName) {
    meta.applicationName = siteName
    // No title template: every page sets its full, exact legacy title.
    meta.title = {
      default: title || (tagline ? `${siteName} | ${tagline}` : siteName),
      template: "%s",
    }
  } else if (title) {
    meta.title = title
  }

  if (description) meta.description = description

  if (settings.seo_home_keywords?.trim()) {
    meta.keywords = settings.seo_home_keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
  }

  const favicon = settings.site_favicon_url?.trim() || "/favicon.ico"
  meta.icons = {
    icon: favicon,
    shortcut: favicon,
    apple: favicon,
  }

  meta.openGraph = {
    siteName: siteName || undefined,
    type: "website",
    locale: "en_PK",
  }

  return meta
}

export async function generateViewport(): Promise<Viewport> {
  const settings = await getSiteSettings()
  const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
  let legacy: Record<string, any> = {}
  try {
    legacy = JSON.parse(settings.legacy_settings_json || "{}")
  } catch {}
  const browserBar =
    [legacy.theme_browser_bar, settings.theme_browser_bar, legacy.theme_header_bg, settings.theme_header_bg]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .find((v) => v && HEX.test(v)) || "#FFFFFF"
  return { themeColor: browserBar }
}

/**
 * The PHP site's :root theme variables (its critical CSS), from the migrated
 * legacy settings — same admin colours, radius and container width.
 */
function mmThemeVars(settings: Record<string, any>): string {
  let l: Record<string, any> = {}
  try {
    l = JSON.parse(settings.legacy_settings_json || "{}")
  } catch {}
  const v = (x: any, d: string) => (typeof x === "string" && x.trim() ? x.trim() : d)
  const hexRgb = (h: string) => {
    const m = h.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
    return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : "0, 0, 0"
  }
  const primary = v(l.theme_primary, "#000000")
  const secondary = v(l.theme_secondary, "#005BB4")
  const vars: Record<string, string> = {
    "--theme-primary": primary,
    "--theme-primary-rgb": hexRgb(primary),
    "--theme-secondary": secondary,
    "--theme-secondary-rgb": hexRgb(secondary),
    "--theme-hover": v(l.theme_hover, "#000000"),
    "--theme-header-bg": v(l.theme_header_bg, "#ffffff"),
    "--theme-header-text": v(l.theme_header_text, "#000000"),
    "--theme-header-widget": v(l.theme_header_widget, "rgba(255,255,255,0.12)"),
    "--theme-price": v(l.theme_price, "#005BB4"),
    "--theme-body-bg": v(l.theme_body_bg, "#ffffff"),
    "--theme-card-border": v(l.theme_card_border, "#e6eaf0"),
    "--theme-footer-bg": v(l.theme_footer_bg, "#ffffff"),
    "--theme-footer-text": v(l.theme_footer_text, "#000000"),
    "--theme-nav-active": v(l.theme_nav_active, "#005BB4"),
    "--theme-radius": v(l.theme_radius, "28px"),
    "--theme-container": v(l.theme_container, "1600px"),
  }
  return `:root{${Object.entries(vars)
    .map(([k, val]) => `${k}:${val}`)
    .join(";")}}`
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const settings = await getSiteSettings()
  // NOTE: no cookies() here — per-user data hydrates client-side
  // (UserDataProvider), so every public route stays ISR-cacheable.

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/mm/bundle.min.css" />
        <link rel="stylesheet" href="/mm/site.css" />
        <link rel="stylesheet" href="/mm/shop.css" />
        <style id="mm-theme" dangerouslySetInnerHTML={{ __html: mmThemeVars(settings) }} />
        <GoogleAnalytics measurementId={settings.google_analytics_id} />
        <MetaPixel pixelId={settings.meta_pixel_id} />
        <link rel="dns-prefetch" href="https://pagead2.googlesyndication.com" />
        <SiteJsonLd settings={settings} />
        <BusinessJsonLd settings={settings} />
        <CustomHeadCode html={settings.head_code} />
      </head>
      <body className="bg-white font-sans text-slate-800 antialiased has-mobile-nav">
        <UserDataProvider>
          <CartDrawerProvider>
            <SiteSettingsProvider aspectClass={resolveProductCardAspectClass(settings)}>
              {props.children}
            </SiteSettingsProvider>
          </CartDrawerProvider>
        </UserDataProvider>
        {/* PHP compare.js — localStorage compare list, toast, modal */}
        <Script src="/mm/compare.js" strategy="afterInteractive" />
        {/* AdSense, exactly as the PHP site: loader + ads.js (pushes each
            .kn-ad unit once it has layout, also after client navigation) */}
        {process.env.NEXT_PUBLIC_ADS_ENABLED !== "false" && (
          <>
            <Script
              src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${
                process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "ca-pub-2571706004681433"
              }`}
              strategy="afterInteractive"
              crossOrigin="anonymous"
            />
            <Script src="/mm/ads.js" strategy="afterInteractive" />
          </>
        )}
      </body>
    </html>
  )
}
