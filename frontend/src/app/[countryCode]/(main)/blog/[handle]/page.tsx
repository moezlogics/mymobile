import { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import { getBlogPostByHandle, listBlogCategories, postPath } from "@lib/data/blog"
import { getSiteSettings } from "@lib/data/site-settings"
import { canonicalUrl } from "@lib/util/seo-url"
import MmPostPage from "@modules/mm/templates/post"

type Props = {
  // `category` is set when rendered through /blog/{category}/{handle}/
  params: Promise<{ countryCode: string; handle: string; category?: string }>
}

export const revalidate = 300

/** Exact legacy title/description (migrated from the PHP render). */
export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const [post, settings] = await Promise.all([getBlogPostByHandle(params.handle), getSiteSettings()])
  if (!post) return {}
  const title = post.seo_title || post.title
  const description =
    post.seo_description || post.excerpt || (post.content ? post.content.replace(/<[^>]*>/g, "").substring(0, 160) : "")
  const url = canonicalUrl(postPath(post))
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url,
      siteName: settings.site_name || undefined,
      publishedTime: post.published_at || post.created_at,
      modifiedTime: post.updated_at,
      ...(post.featured_image ? { images: [{ url: post.featured_image, alt: post.featured_image_alt || post.title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(post.featured_image ? { images: [post.featured_image] } : {}),
    },
    alternates: { canonical: url },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    },
  }
}

export default async function BlogPostPage(props: Props) {
  const params = await props.params
  const post = await getBlogPostByHandle(params.handle)

  if (!post) {
    // /blog/{blog-category}/ → the category archive (canonical)
    if (!params.category) {
      const cats = await listBlogCategories()
      if (cats.some((c) => c.handle === params.handle)) permanentRedirect(`/blog/category/${params.handle}/`)
    }
    notFound()
  }

  // mymobile.pk canonical: /blog/{primary-category}/{slug}/. Any other
  // spelling (/blog/{slug}/, wrong category) 301s there, as PHP router did.
  const canonicalPath = postPath(post)
  const requestedPath = params.category ? `/blog/${params.category}/${post.handle}/` : `/blog/${post.handle}/`
  if (requestedPath !== canonicalPath) permanentRedirect(canonicalPath)

  return <MmPostPage post={post} />
}
