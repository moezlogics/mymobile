import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getBlogAuthorByHandle } from "@lib/data/blog"
import { getSiteSettings } from "@lib/data/site-settings"
import { canonicalUrl, ROBOTS_INDEX } from "@lib/util/seo-url"
import { getAllPosts } from "@modules/mm/lib/blog"
import { BLOG_PER_PAGE, MmBlogArchive } from "@modules/mm/templates/blog-list"

/** archive.php?author= — /blog/author/{handle}/ */
type Props = { params: Promise<{ countryCode: string; handle: string }> }

export const revalidate = 300

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { handle } = await props.params
  const [data, s] = await Promise.all([getBlogAuthorByHandle(handle), getSiteSettings()])
  if (!data) return {}
  const a = data.author
  // archive.php: "{name} - Author at {site}"; description = bio, strip_tags, 155 chars
  const title = `${a.name} - Author at ${s.site_name || ""}`.trim()
  const bio = String(a.bio || "").replace(/<[^>]*>/g, "")
  const description = bio ? bio.slice(0, 155) : `Articles by ${a.name}`
  const url = canonicalUrl(`/blog/author/${a.handle}/`)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "profile", siteName: s.site_name || undefined, ...(a.avatar_url ? { images: [a.avatar_url] } : {}) },
    robots: ROBOTS_INDEX,
  }
}

export default async function BlogAuthorPage(props: Props) {
  const { handle } = await props.params
  const data = await getBlogAuthorByHandle(handle)
  if (!data) notFound()
  const posts = (await getAllPosts()).filter((p) => p.author?.handle === handle)
  return (
    <MmBlogArchive
      kind="author"
      handle={handle}
      heading={data.author.name}
      posts={posts.slice(0, BLOG_PER_PAGE)}
      total={posts.length}
      author={data.author as any}
    />
  )
}
