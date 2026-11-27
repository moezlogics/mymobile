import Image from "next/image"
import { postPath, type BlogPost } from "@lib/data/blog"
import { canonicalUrl } from "@lib/util/seo-url"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import BreadcrumbJsonLd from "@modules/common/components/breadcrumb-jsonld"

/**
 * Shared archive layout for /blog/category/{x}/ and /blog/tag/{x}/ —
 * heading + subheading exactly as the PHP archive.php printed them,
 * followed by the post grid (CollectionPage + ItemList JSON-LD).
 */
export default function BlogArchive({
  heading,
  subheading,
  path,
  crumb,
  posts,
}: {
  heading: string
  subheading: string
  path: string
  crumb: string
  posts: BlogPost[]
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: heading,
    description: subheading,
    url: canonicalUrl(path),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: posts.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: canonicalUrl(postPath(p)),
        name: p.title,
      })),
    },
  }

  return (
    <div className="container-anvogue py-10 md:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BreadcrumbJsonLd
        countryCode="pk"
        items={[{ name: "Home", href: "/" }, { name: "Blog", href: "/blog/" }, { name: crumb }]}
      />
      <header className="mb-8 md:mb-10">
        <h1 className="heading2 text-ink">{heading}</h1>
        <p className="body1 text-secondary mt-2">{subheading}</p>
      </header>

      {posts.length === 0 ? (
        <p className="text-secondary">No posts yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <article key={post.id} className="rounded-2xl border border-line overflow-hidden bg-white hover:shadow-md transition-shadow">
              <LocalizedClientLink href={postPath(post)} className="block">
                {post.featured_image && (
                  <div className="relative aspect-[16/9] bg-surface">
                    <Image
                      src={post.featured_image}
                      alt={post.featured_image_alt || post.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="p-4">
                  <h2 className="text-[16px] font-semibold text-ink leading-snug line-clamp-2">{post.title}</h2>
                  {post.excerpt && <p className="mt-2 text-[14px] text-secondary line-clamp-3">{post.excerpt}</p>}
                  {post.published_at && (
                    <time className="mt-3 block text-[12px] text-ink/50" dateTime={post.published_at}>
                      {new Date(post.published_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </time>
                  )}
                </div>
              </LocalizedClientLink>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
