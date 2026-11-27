import { Metadata } from "next"
import Link from "next/link"
import { listBlogCategories } from "@lib/data/blog"
import { getSiteSettings } from "@lib/data/site-settings"
import { canonicalUrl, ROBOTS_INDEX } from "@lib/util/seo-url"
import { getAllPosts } from "@modules/mm/lib/blog"

export const revalidate = 300

/** categories.php — "News Sections" index of blog categories. */
export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings()
  const title = "News Sections"
  const description = `Browse the latest news by section on ${s.site_name || "our site"}.`
  const url = canonicalUrl("/categories/")
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website" }, robots: ROBOTS_INDEX }
}

export default async function CategoriesPage() {
  const [cats, posts] = await Promise.all([listBlogCategories(), getAllPosts()])
  const sorted = [...cats].sort(
    (a: any, b: any) => (Number(a.metadata?.sort_order) || 0) - (Number(b.metadata?.sort_order) || 0) || a.name.localeCompare(b.name)
  )
  return (
    <>
      <div className="border-b border-slate-100 bg-white/40 backdrop-blur-md py-12" style={{ padding: "36px 0", borderBottom: "1px solid #f1f5f9" }}>
        <div className="global-container text-center" style={{ textAlign: "center" }}>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900" style={{ fontSize: "1.8rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
            News Sections
          </h1>
          <p className="mt-2 text-slate-500" style={{ color: "#64748b", marginTop: 6 }}>
            Browse the latest headlines and stories by section.
          </p>
        </div>
      </div>
      <div className="global-container py-14" style={{ paddingTop: 34, paddingBottom: 44 }}>
        <div
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 20 }}
        >
          {sorted.length ? (
            sorted.map((c: any) => {
              const count = posts.filter((p) => p.categories?.some((x) => x.id === c.id)).length
              return (
                <Link
                  href={`/blog/category/${c.handle}/`}
                  className="hover-lift"
                  key={c.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    border: "1px solid #f1f5f9",
                    background: "#fff",
                    borderRadius: 12,
                    padding: 24,
                    textDecoration: "none",
                    color: "inherit",
                    boxShadow: "0 1px 4px rgba(0,0,0,.04)",
                    transition: "box-shadow .15s,transform .15s",
                  }}
                >
                  <span
                    style={{
                      marginBottom: 14,
                      display: "inline-flex",
                      width: 52,
                      height: 52,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 10,
                      fontSize: "1.3rem",
                      color: "#fff",
                      background: "linear-gradient(135deg,var(--theme-primary),var(--theme-secondary))",
                    }}
                  >
                    <i className="fa-regular fa-newspaper" />
                  </span>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a", margin: "0 0 4px" }}>{c.name}</h2>
                  <p style={{ fontSize: ".84rem", color: "#64748b", margin: "0 0 10px", lineHeight: 1.5 }}>
                    {c.seo_description ? String(c.seo_description).slice(0, 110) : `Latest ${c.name} news and headlines.`}
                  </p>
                  <span style={{ marginTop: "auto", fontSize: ".76rem", fontWeight: 700, color: "var(--theme-secondary)" }}>
                    {count} article{count === 1 ? "" : "s"} →
                  </span>
                </Link>
              )
            })
          ) : (
            <div style={{ gridColumn: "1/-1", padding: "32px 0", textAlign: "center", color: "#64748b" }}>No sections found.</div>
          )}
        </div>
      </div>
    </>
  )
}
