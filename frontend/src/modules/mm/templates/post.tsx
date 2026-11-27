import Link from "next/link"
import { postPath, type BlogPost } from "@lib/data/blog"
import { canonicalUrl } from "@lib/util/seo-url"
import { getMmSettings, mmImage, mmThumb } from "@modules/mm/lib"
import {
  adInjectParagraphs,
  avatarColor,
  cleanPostBody,
  commentDate,
  getAllPosts,
  getComments,
  longDateTime,
  primaryCategory,
  relatedPostsInject,
  timeAgo,
} from "@modules/mm/lib/blog"
import LegacyScript from "@modules/mm/components/legacy-script"
import OnClick from "@modules/mm/components/on-click"

/** single.php reply-form script, verbatim except the form action. */
const REPLY_JS = `
window.closeAllReplyForms = function() {
  document.querySelectorAll('[id^="reply-form-container-"]').forEach(function(el){ el.innerHTML = ''; el.style.display = 'none'; });
};
window.toggleReplyForm = function(parentId, authorName) {
  var container = document.getElementById('reply-form-container-' + parentId);
  if (!container) return;
  if (container.innerHTML !== '') { closeAllReplyForms(); return; }
  closeAllReplyForms();
  container.style.display = 'block';
  var esc = function(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  container.innerHTML =
    '<div class="sp-reply-form-wrap">' +
      '<form action="/api/mm/comment" method="POST" style="display:flex; flex-direction:column; gap:12px; margin:0;">' +
        '<input type="hidden" name="parent_id" value="' + esc(parentId) + '">' +
        '<input type="hidden" name="handle" value="' + esc(window.MM_POST_HANDLE || '') + '">' +
        '<input type="hidden" name="back" value="' + esc(location.pathname) + '">' +
        '<div style="position:absolute;left:-9999px" aria-hidden="true"><input type="text" name="website" tabindex="-1" autocomplete="off"></div>' +
        '<div class="sp-field"><label style="font-size:0.7rem; font-weight:700; color:#475569; text-transform:uppercase;">Your Name <span style="color:#ef4444;">*</span></label>' +
        '<input type="text" name="name" required placeholder="e.g. Ali Khan" style="padding:8px 12px; font-size:0.85rem; height:38px;"></div>' +
        '<div class="sp-field"><label style="font-size:0.7rem; font-weight:700; color:#475569; text-transform:uppercase;">Reply to ' + esc(authorName) + ' <span style="color:#ef4444;">*</span></label>' +
        '<textarea name="message" rows="3" required style="padding:8px 12px; font-size:0.85rem; min-height:80px;" placeholder="Write your reply here..."></textarea></div>' +
        '<div style="display:flex; gap:10px;">' +
          '<button type="submit" class="sp-submit" style="margin-top:0; padding:8px 20px; font-size:0.82rem;">Post Reply</button>' +
          '<button type="button" class="sp-submit" onclick="closeAllReplyForms()" style="margin-top:0; padding:8px 20px; font-size:0.82rem; background:#cbd5e1; color:#475569;">Cancel</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};
(function(){
  var m = (location.hash || '').match(/^#comment-(ok|err|dup)$/);
  if (!m) return;
  var el = document.getElementById('comment-msg-' + m[1]);
  if (el) { el.hidden = false; history.replaceState(null, '', location.pathname + location.search + '#comments'); document.getElementById('comments').scrollIntoView(); }
})();`

export default async function MmPostPage({ post }: { post: BlogPost }) {
  const [{ s, legacy }, all, comments] = await Promise.all([getMmSettings(), getAllPosts(), getComments(post.handle)])
  const cat = primaryCategory(post)
  const author: any = post.author || null
  const url = canonicalUrl(postPath(post))
  const shareUrl = url
  const posted = post.published_at || post.created_at
  const publDisplay = longDateTime(posted)
  const updDisplay =
    post.updated_at && (Date.parse(post.updated_at) - (Date.parse(posted) || 0)) / 1000 > 3600 ? longDateTime(post.updated_at) : ""
  const featImg = post.featured_image ? mmThumb(post.featured_image, 820) : ""
  const caption = post.metadata?.image_caption || ""

  let body = post.content ? cleanPostBody(post.content) : ""
  if (body) {
    body = relatedPostsInject(body, all, post, legacy)
    body = adInjectParagraphs(body)
  }

  const related = cat
    ? all.filter((p) => p.id !== post.id && p.categories?.some((c) => c.id === cat.id)).slice(0, 6)
    : []

  const parents = comments.filter((c) => !c.parent_id).sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
  const repliesOf = (id: string) => comments.filter((c) => c.parent_id === id)

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.seo_description || post.excerpt || undefined,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: new Date(Date.parse(posted)).toISOString(),
    dateModified: new Date(Date.parse(post.updated_at || posted)).toISOString(),
    ...(post.featured_image ? { image: [post.featured_image] } : {}),
    author: author
      ? { "@type": "Person", name: author.name, url: canonicalUrl(`/blog/author/${author.handle}/`), ...(author.role ? { jobTitle: author.role } : {}) }
      : { "@type": "Organization", name: s.site_name || "My Mobile" },
    publisher: {
      "@type": "Organization",
      name: s.site_name || "My Mobile",
      ...(s.site_logo_url ? { logo: { "@type": "ImageObject", url: s.site_logo_url } } : {}),
    },
    ...(cat ? { articleSection: cat.name } : {}),
  }
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: canonicalUrl("/") },
      ...(cat ? [{ "@type": "ListItem", position: 2, name: cat.name, item: canonicalUrl(`/blog/category/${cat.handle}/`) }] : []),
      { "@type": "ListItem", position: cat ? 3 : 2, name: post.title, item: url },
    ],
  }

  return (
    <>
      <link rel="stylesheet" href="/mm/single.css" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script dangerouslySetInnerHTML={{ __html: `window.MM_POST_HANDLE=${JSON.stringify(post.handle)};` }} />

      <div className="sp-wrap">
        <nav className="sp-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          {cat && (
            <>
              <span>›</span>
              <Link href={`/blog/category/${cat.handle}/`}>{cat.name}</Link>
            </>
          )}
          <span>›</span>
          <span style={{ color: "#cbd5e1" }}>{post.title.length > 48 ? `${post.title.slice(0, 48)}…` : post.title}</span>
        </nav>

        {cat && (
          <Link className="sp-cat-chip" href={`/blog/category/${cat.handle}/`}>
            {cat.name}
          </Link>
        )}
        <h1 className="sp-title">{post.title}</h1>
        {post.excerpt && <p className="sp-excerpt">{post.excerpt}</p>}

        <div className="sp-byline">
          {author?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mmImage(author.avatar_url)} alt={author.name || "Author"} className="sp-byline-avatar" width={38} height={38} loading="lazy" />
          ) : (
            <span className="sp-byline-avatar">{(author?.name || "S").slice(0, 1).toUpperCase()}</span>
          )}
          <div className="sp-byline-info">
            {author?.name && author?.handle ? (
              <Link className="sp-byline-name" href={`/blog/author/${author.handle}/`} rel="author">
                By {author.name}
                {author.role && <span style={{ fontWeight: 500, color: "#94a3b8" }}> — {author.role}</span>}
              </Link>
            ) : (
              <span className="sp-byline-name">By {s.site_name || "Staff"}</span>
            )}
            <span className="sp-byline-dates">
              {publDisplay && (
                <>
                  Published <time dateTime={new Date(Date.parse(posted)).toISOString()}>{publDisplay}</time>
                </>
              )}
              {updDisplay && (
                <>
                  &nbsp;·&nbsp; Updated <time dateTime={new Date(Date.parse(post.updated_at)).toISOString()}>{updDisplay}</time>
                </>
              )}
            </span>
          </div>
          <div className="sp-share-inline">
            <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener" className="sp-share-btn sp-share-fb" title="Share on Facebook" aria-label="Share on Facebook">
              <i className="fa-brands fa-facebook-f" />
            </a>
            <a href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${post.title} - ${shareUrl}`)}`} target="_blank" rel="noopener" className="sp-share-btn sp-share-wa" title="Share on WhatsApp" aria-label="Share on WhatsApp">
              <i className="fa-brands fa-whatsapp" />
            </a>
            <a href={`https://x.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(post.title)}`} target="_blank" rel="noopener" className="sp-share-btn sp-share-tw" title="Share on X" aria-label="Share on X">
              <i className="fa-brands fa-x-twitter" />
            </a>
            <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener" className="sp-share-btn sp-share-li" title="Share on LinkedIn" aria-label="Share on LinkedIn">
              <i className="fa-brands fa-linkedin-in" />
            </a>
          </div>
        </div>

        {post.featured_image && (
          <figure className="sp-feat-img">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={featImg} alt={caption || post.featured_image_alt || post.title} fetchPriority="high" loading="eager" decoding="async" width={820} height={461} />
            {caption && <figcaption>{caption}</figcaption>}
          </figure>
        )}

        {body && <div className="sp-content" dangerouslySetInnerHTML={{ __html: body }} />}

        {post.tags && post.tags.length > 0 && (
          <div className="sp-tags">
            <span className="sp-tags-label">
              <i className="fa-solid fa-tags" /> Tags:
            </span>
            {[...post.tags]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((t) => (
                <Link className="sp-tag" href={`/blog/tag/${t.handle}/`} key={t.id}>
                  {t.name}
                </Link>
              ))}
          </div>
        )}

        {author?.name && (
          <div className="sp-author-card">
            {author.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mmImage(author.avatar_url)} alt={author.name} className="sp-author-avatar" loading="lazy" />
            ) : (
              <div className="sp-author-avatar">{author.name.slice(0, 1).toUpperCase()}</div>
            )}
            <div className="sp-author-details">
              <h2 className="sp-author-heading">
                {author.handle ? (
                  <Link href={`/blog/author/${author.handle}/`} className="sp-author-name">
                    {author.name}
                  </Link>
                ) : (
                  <span className="sp-author-name">{author.name}</span>
                )}
                {author.role && <span className="sp-author-role">{author.role}</span>}
              </h2>
              <p className="sp-author-bio">
                {author.bio
                  ? String(author.bio).replace(/<[^>]*>/g, "").slice(0, 300)
                  : `${author.name} is a member of the ${s.site_name || "our"} editorial team.`}{" "}
                {author.handle && (
                  <Link href={`/blog/author/${author.handle}/`} style={{ color: "var(--theme-secondary)", fontWeight: 600, textDecoration: "none" }}>
                    View all articles →
                  </Link>
                )}
              </p>
            </div>
          </div>
        )}

        {related.length > 0 && (
          <div className="sp-related">
            <h2 className="sp-related-title">Related News</h2>
            <div className="sp-related-grid">
              {related.map((rp) => (
                <Link href={postPath(rp)} className="sp-related-item" key={rp.id}>
                  <div className="news-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mmThumb(rp.featured_image, 400)} alt={rp.title} loading="lazy" decoding="async" width={400} height={225} />
                  </div>
                  <h3 className="line-clamp-2">{rp.title}</h3>
                  <div className="news-meta">
                    <span>{timeAgo(rp.published_at || rp.created_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div id="comments">
          <h2 className="sp-comments-title">
            <i className="fa-solid fa-comments" /> Comments ({comments.length})
          </h2>

          {parents.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {parents.map((c) => (
                <div className="sp-comment-thread" id={`comment-thread-${c.id}`} key={c.id}>
                  <div className="sp-comment-node" id={`comment-${c.id}`}>
                    <div className="sp-comment-avatar-wrap">
                      <div className="guest-letter-avatar" style={{ backgroundColor: avatarColor(c.name) }}>
                        {c.name.slice(0, 1).toUpperCase()}
                      </div>
                    </div>
                    <div className="sp-comment-content">
                      <div className="sp-comment-header">
                        <div className="sp-comment-author-wrap">
                          <span className="sp-comment-author-name">{c.name}</span>
                          {c.is_admin && (
                            <span className="sp-comment-badge-admin">
                              <i className="fa-solid fa-user-shield" style={{ fontSize: "0.55rem", marginRight: 2.5 }} />
                              Staff
                            </span>
                          )}
                        </div>
                        <span className="sp-comment-date">{commentDate(c.created_at)}</span>
                      </div>
                      <div className="sp-comment-text" style={{ whiteSpace: "pre-line" }}>
                        {c.content}
                      </div>
                      <div className="sp-comment-actions">
                        <OnClick className="sp-comment-action-btn" code={`toggleReplyForm(${JSON.stringify(c.id)}, ${JSON.stringify(c.name)})`}>
                          <i className="fa-solid fa-reply" /> Reply
                        </OnClick>
                      </div>
                      <div id={`reply-form-container-${c.id}`} style={{ display: "none", width: "100%" }} />
                    </div>
                  </div>
                  {repliesOf(c.id).length > 0 && (
                    <div className="sp-comment-replies-list">
                      {repliesOf(c.id).map((r) => (
                        <div className="sp-comment-node" id={`comment-${r.id}`} key={r.id}>
                          <div className="sp-comment-avatar-wrap">
                            <div className="guest-letter-avatar" style={{ backgroundColor: avatarColor(r.name) }}>
                              {r.name.slice(0, 1).toUpperCase()}
                            </div>
                          </div>
                          <div className="sp-comment-content">
                            <div className="sp-comment-header">
                              <div className="sp-comment-author-wrap">
                                <span className="sp-comment-author-name">{r.name}</span>
                                {r.is_admin && (
                                  <span className="sp-comment-badge-admin">
                                    <i className="fa-solid fa-user-shield" style={{ fontSize: "0.55rem", marginRight: 2.5 }} />
                                    Staff
                                  </span>
                                )}
                              </div>
                              <span className="sp-comment-date">{commentDate(r.created_at)}</span>
                            </div>
                            <div className="sp-comment-text" style={{ whiteSpace: "pre-line" }}>
                              {r.content}
                            </div>
                            <div className="sp-comment-actions">
                              <OnClick className="sp-comment-action-btn" code={`toggleReplyForm(${JSON.stringify(c.id)}, ${JSON.stringify(r.name)})`}>
                                <i className="fa-solid fa-reply" /> Reply
                              </OnClick>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: "0.88rem", color: "#94a3b8", padding: "12px 0" }}>No comments yet. Be the first to comment!</p>
          )}

          <div className="sp-form-title">Leave a Comment</div>
          <div className="sp-alert sp-alert-ok" id="comment-msg-ok" hidden>
            <i className="fa-solid fa-circle-check" /> Comment posted successfully!
          </div>
          <div className="sp-alert sp-alert-warn" id="comment-msg-dup" hidden>
            <i className="fa-solid fa-circle-exclamation" /> Duplicate comment detected. Please wait a few seconds.
          </div>
          <div className="sp-alert sp-alert-err" id="comment-msg-err" hidden>
            <i className="fa-solid fa-triangle-exclamation" /> Failed to post comment. Try again.
          </div>
          <form action="/api/mm/comment" method="POST" id="mainCommentForm">
            <input type="hidden" name="handle" value={post.handle} />
            <input type="hidden" name="back" value={postPath(post)} />
            <div style={{ position: "absolute", left: -9999 }} aria-hidden="true">
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </div>
            <div className="sp-form-grid">
              <div className="sp-field">
                <label>
                  Your Name <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input type="text" name="name" required placeholder="e.g. Ali Khan" />
              </div>
            </div>
            <div className="sp-field">
              <label>
                Comment <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <textarea name="message" rows={4} required placeholder="Write your comment here..." />
            </div>
            <button type="submit" className="sp-submit">
              <i className="fa-solid fa-paper-plane" /> Post Comment
            </button>
          </form>
          <LegacyScript code={REPLY_JS} />
        </div>
      </div>
    </>
  )
}
