import Link from "next/link"
import type { BlogPost } from "@lib/data/blog"
import { canonicalUrl } from "@lib/util/seo-url"
import { postPath } from "@lib/data/blog"
import { mmImage } from "@modules/mm/lib"
import { blogItemHtml } from "@modules/mm/lib/blog"
import LegacyScript from "@modules/mm/components/legacy-script"

export const BLOG_PER_PAGE = 15

/** Infinite scroll shared by blog.php / archive.php (fetches /api/mm/blog). */
const loadMoreJs = (listId: string, moreId: string) => `
(function(){
  var list = document.getElementById(${JSON.stringify(listId)});
  var more = document.getElementById(${JSON.stringify(moreId)});
  if(!list || !more || !('IntersectionObserver' in window)) return;
  var nextUrl = more.getAttribute('data-next-url');
  var api = more.getAttribute('data-api');
  var page = 2;
  var busy = false;
  async function loadMore(){
    if(busy || !nextUrl) return;
    busy = true;
    more.classList.add('loading');
    try{
      var res = await fetch(api + '&page=' + page, { headers: { 'X-Requested-With': 'fetch' } });
      if(!res.ok) throw new Error('Load failed');
      var data = await res.json();
      if(data.html) list.insertAdjacentHTML('beforeend', data.html);
      nextUrl = data.next_url || '';
      page++;
      if(!nextUrl){ more.remove(); obs.disconnect(); return; }
      more.setAttribute('data-next-url', nextUrl);
    }catch(e){
      more.innerHTML = '<a class="sp-btn sp-btn-outline" href="' + nextUrl + '">Load more</a>';
      obs.disconnect();
      return;
    }
    busy = false;
    more.classList.remove('loading');
  }
  var obs = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){ if(entry.isIntersecting) loadMore(); });
  }, { rootMargin: '300px 0px' });
  obs.observe(more);
})();`

/** blog.php — /blog/ */
export function MmBlogIndex({ posts, total }: { posts: BlogPost[]; total: number }) {
  const pages = Math.max(1, Math.ceil(total / BLOG_PER_PAGE))
  return (
    <div className="global-container" style={{ paddingTop: 26, paddingBottom: 40 }}>
      <div className="sp-crumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link> <span>/</span> <span>Blog</span>
      </div>
      <div className="sp-sec">
        <h1>Blog</h1>
        <span className="more">
          {total.toLocaleString("en-US")} post{total === 1 ? "" : "s"}
        </span>
      </div>
      {posts.length ? (
        <div className="arc-list" id="blogArchiveList" dangerouslySetInnerHTML={{ __html: posts.map(blogItemHtml).join("") }} />
      ) : (
        <div className="arc-list" id="blogArchiveList">
          <div style={{ border: "1px solid #fde68a", background: "#fffbeb", color: "#b45309", borderRadius: 8, padding: 24, textAlign: "center" }}>
            No blog posts published yet.
          </div>
        </div>
      )}
      {pages > 1 && (
        <div className="home-more" id="blogArchiveMore" data-next-url="/blog/?page=2" data-api="/api/mm/blog?kind=all">
          <span className="spin" />
        </div>
      )}
      <LegacyScript code={loadMoreJs("blogArchiveList", "blogArchiveMore")} />
    </div>
  )
}

type ArchiveProps = {
  kind: "category" | "tag" | "author"
  handle: string
  heading: string
  subheading?: string
  posts: BlogPost[]
  total: number
  bottom?: string | null
  author?: {
    name: string
    role?: string | null
    bio?: string | null
    avatar_url?: string | null
    twitter_url?: string | null
    facebook_url?: string | null
    linkedin_url?: string | null
    website_url?: string | null
  } | null
}

/** archive.php — /blog/category/x/, /blog/tag/x/, /blog/author/x/ */
export function MmBlogArchive({ kind, handle, heading, subheading, posts, total, bottom, author }: ArchiveProps) {
  const pages = Math.max(1, Math.ceil(total / BLOG_PER_PAGE))
  const base = `/blog/${kind}/${handle}/`
  const socials = author
    ? ([
        ["fa-brands fa-x-twitter", author.twitter_url, "X / Twitter"],
        ["fa-brands fa-facebook-f", author.facebook_url, "Facebook"],
        ["fa-brands fa-linkedin-in", author.linkedin_url, "LinkedIn"],
        ["fa-solid fa-globe", author.website_url, "Website"],
      ].filter(([, u]) => !!u) as [string, string, string][])
    : []

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": kind === "author" ? "ProfilePage" : "CollectionPage",
    name: heading,
    url: canonicalUrl(base),
    ...(kind === "author" && author
      ? { mainEntity: { "@type": "Person", name: author.name, ...(author.role ? { jobTitle: author.role } : {}), ...(author.avatar_url ? { image: mmImage(author.avatar_url) } : {}) } }
      : {
          mainEntity: {
            "@type": "ItemList",
            itemListElement: posts.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: canonicalUrl(postPath(p)), name: p.title })),
          },
        }),
  }
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: canonicalUrl("/") },
      { "@type": "ListItem", position: 2, name: "Blog", item: canonicalUrl("/blog/") },
      { "@type": "ListItem", position: 3, name: heading, item: canonicalUrl(base) },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <div className="py-8 bg-slate-50/50 border-b border-slate-100/80" style={{ background: "#f8fafc", borderBottom: "1px solid #f1f5f9", padding: "26px 0" }}>
        <div className="global-container">
          {kind === "author" && author ? (
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              {author.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mmImage(author.avatar_url)} alt={heading} style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <span style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--theme-secondary)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "1.7rem", fontWeight: 800 }}>
                  {heading.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div style={{ flex: 1, minWidth: 200 }}>
                <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900" style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                  {heading}
                </h1>
                {author.role && (
                  <p style={{ fontSize: ".82rem", fontWeight: 700, color: "var(--theme-secondary)", textTransform: "uppercase", letterSpacing: ".05em", margin: "2px 0 4px" }}>
                    {author.role}
                  </p>
                )}
                {author.bio && (
                  <p style={{ fontSize: ".88rem", color: "#475569", lineHeight: 1.55, margin: "4px 0 0", maxWidth: 640 }}>
                    {author.bio.replace(/<[^>]*>/g, "").slice(0, 260)}
                  </p>
                )}
                {socials.length > 0 && (
                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    {socials.map(([icon, url, label]) => (
                      <a key={label} href={url} target="_blank" rel="noopener nofollow" aria-label={label} style={{ color: "#64748b", fontSize: ".9rem" }}>
                        <i className={icon} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900" style={{ fontSize: "1.7rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                {heading}
              </h1>
              <p style={{ fontSize: ".88rem", color: "#64748b", margin: "4px 0 0" }}>
                {subheading} <span style={{ color: "#94a3b8" }}>— {total} article{total === 1 ? "" : "s"}</span>
              </p>
            </>
          )}
        </div>
      </div>

      <div className="global-container" style={{ paddingTop: 22, paddingBottom: 40 }}>
        {posts.length ? (
          <div className="arc-list" id="archiveList" dangerouslySetInnerHTML={{ __html: posts.map(blogItemHtml).join("") }} />
        ) : (
          <div className="arc-list" id="archiveList">
            <div style={{ border: "1px solid #fde68a", background: "#fffbeb", color: "#b45309", borderRadius: 8, padding: 24, textAlign: "center" }}>
              No news found matching your criteria.
            </div>
          </div>
        )}
        {pages > 1 && (
          <div
            className="home-more"
            id="archiveLoadMore"
            data-next-url={`${base}?page=2`}
            data-api={`/api/mm/blog?kind=${kind}&handle=${encodeURIComponent(handle)}`}
            data-loading-text="Loading more articles..."
          >
            <span className="spin" />
          </div>
        )}
        <LegacyScript code={loadMoreJs("archiveList", "archiveLoadMore")} />
      </div>

      {bottom && (
        <div style={{ borderTop: "1px solid #f1f5f9", background: "#f8fafc", padding: "34px 0", marginBottom: 20 }}>
          <div className="global-container">
            <div
              style={{ fontSize: ".92rem", color: "#475569", lineHeight: 1.75, background: "#fff", borderRadius: 10, padding: "22px 26px", border: "1px solid #f1f5f9" }}
              dangerouslySetInnerHTML={{ __html: bottom }}
            />
          </div>
        </div>
      )}
    </>
  )
}
