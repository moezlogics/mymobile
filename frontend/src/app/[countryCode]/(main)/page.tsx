import { Metadata } from "next"

import { getSiteSettings } from "@lib/data/site-settings"
import { canonicalUrl, ROBOTS_INDEX } from "@lib/util/seo-url"
import MmHome from "@modules/mm/templates/home"

// ISR: anonymous, identical for every visitor — the CDN can hold it.
export const revalidate = 300

/** Exact legacy homepage title/description (migrated from the PHP site). */
export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings()
  const title = s.seo_home_title?.trim()
  const description = s.seo_home_description?.trim()
  const ogImage = s.seo_default_og_image?.trim()
  const home = canonicalUrl("/")

  const meta: Metadata = {
    alternates: { canonical: home },
    robots: ROBOTS_INDEX,
  }
  if (title) meta.title = title
  if (description) meta.description = description
  meta.openGraph = {
    title,
    description,
    url: home,
    type: "website",
    ...(ogImage ? { images: [{ url: ogImage }] } : {}),
  }
  meta.twitter = {
    card: "summary_large_image",
    title,
    description,
    ...(ogImage ? { images: [ogImage] } : {}),
  }
  return meta
}

export default async function Home() {
  return <MmHome />
}
