import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getBlogTagArchive } from "@lib/data/blog"
import { getSiteSettings } from "@lib/data/site-settings"
import { canonicalUrl, ROBOTS_INDEX } from "@lib/util/seo-url"
import { getAllPosts } from "@modules/mm/lib/blog"
import { BLOG_PER_PAGE, MmBlogArchive } from "@modules/mm/templates/blog-list"

/** archive.php?tag= — /blog/tag/{handle}/ (same title formula). */
type Props = { params: Promise<{ countryCode: string; handle: string }> }

export const revalidate = 300

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { handle } = await props.params
  const [data, s] = await Promise.all([getBlogTagArchive(handle, { limit: 1 }), getSiteSettings()])
  if (!data) return {}
  const t = data.tag
  const title = t.seo_title?.trim() || `${t.name} - ${s.site_name || ""}`
  const description = t.seo_description?.trim() || `All news tagged "${t.name}"`
  const url = canonicalUrl(`/blog/tag/${t.handle}/`)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: s.site_name || undefined },
    robots: ROBOTS_INDEX,
  }
}

export default async function BlogTagPage(props: Props) {
  const { handle } = await props.params
  const data = await getBlogTagArchive(handle, { limit: 1 })
  if (!data) notFound()
  const t = data.tag
  const posts = (await getAllPosts()).filter((p) => p.tags?.some((x) => x.handle === handle))
  return (
    <MmBlogArchive
      kind="tag"
      handle={handle}
      heading={t.name}
      subheading={`All news tagged "${t.name}"`}
      posts={posts.slice(0, BLOG_PER_PAGE)}
      total={posts.length}
      bottom={t.description || null}
    />
  )
}
