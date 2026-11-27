import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getBlogCategoryArchive } from "@lib/data/blog"
import { getSiteSettings } from "@lib/data/site-settings"
import { canonicalUrl, ROBOTS_INDEX } from "@lib/util/seo-url"
import { getAllPosts } from "@modules/mm/lib/blog"
import { BLOG_PER_PAGE, MmBlogArchive } from "@modules/mm/templates/blog-list"

/** archive.php?category= — /blog/category/{handle}/ (same title formula). */
type Props = { params: Promise<{ countryCode: string; handle: string }> }

export const revalidate = 300

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { handle } = await props.params
  const [data, s] = await Promise.all([getBlogCategoryArchive(handle, { limit: 1 }), getSiteSettings()])
  if (!data) return {}
  const c = data.category
  const title = c.seo_title?.trim() || `${c.name} News - ${s.site_name || ""}`
  const description = c.seo_description?.trim() || `Latest ${c.name} news, headlines and stories`
  const url = canonicalUrl(`/blog/category/${c.handle}/`)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: s.site_name || undefined },
    robots: ROBOTS_INDEX,
  }
}

export default async function BlogCategoryPage(props: Props) {
  const { handle } = await props.params
  const data = await getBlogCategoryArchive(handle, { limit: 1 })
  if (!data) notFound()
  const c = data.category
  const posts = (await getAllPosts()).filter((p) => p.categories?.some((x) => x.handle === handle))
  return (
    <MmBlogArchive
      kind="category"
      handle={handle}
      heading={c.name}
      subheading={`Latest ${c.name} news, headlines and stories`}
      posts={posts.slice(0, BLOG_PER_PAGE)}
      total={posts.length}
      bottom={c.description || null}
    />
  )
}
