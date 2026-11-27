"use client"

/**
 * Global mobile bottom navigation — Home · News · Search · Brands · Compare.
 * Ported from includes/mobile_nav.php (same markup, same active-tab rules).
 * The compare badge (#navCompareCount) is filled by /mm/compare.js, as on PHP.
 */
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Suspense, useEffect } from "react"

function activeFor(path: string, hasQuery: boolean) {
  const p = path.toLowerCase()
  if (p.includes("/blog")) return "news"
  if (hasQuery || p.includes("/search")) return "search"
  if (p.includes("/compare")) return "compare"
  if (p.includes("/brands")) return "brands"
  if (p.includes("/mobiles") || p.includes("/products/")) return "brands"
  if (p === "/" || p === "") return "home"
  return ""
}

function Nav({ active }: { active: string }) {
  const path = usePathname()
  // Re-sync compare checkboxes/badge after client-side navigation.
  useEffect(() => {
    ;(window as any).SpecsCompare?.sync?.()
  }, [path])
  const cls = (k: string) => (active === k ? "active" : "")
  const cur = (k: string) => (active === k ? ("page" as const) : undefined)
  return (
    <nav className="site-mobile-nav" aria-label="Main navigation" data-nav-active={active}>
      <Link href="/" data-nav="home" className={cls("home")} aria-current={cur("home")}>
        <span className="kn-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <path d="M9 22V12h6v10" />
          </svg>
        </span>
        <span>Home</span>
      </Link>
      <Link href="/blog/" data-nav="news" className={cls("news")} aria-current={cur("news")}>
        <span className="kn-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 20H5a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v13a2 2 0 0 0 2 2 2 2 0 0 0 2-2v-8a1 1 0 0 0-1-1h-3" />
            <path d="M7 8h6" />
            <path d="M7 12h6" />
            <path d="M7 16h4" />
          </svg>
        </span>
        <span>News</span>
      </Link>
      <a
        href="#"
        data-nav="search"
        className={cls("search")}
        aria-current={cur("search")}
        rel="nofollow"
        onClick={(e) => {
          e.preventDefault()
          window.dispatchEvent(new Event("mm:open-search"))
        }}
      >
        <span className="kn-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <span>Search</span>
      </a>
      <Link href="/brands/" data-nav="brands" className={cls("brands")} aria-current={cur("brands")}>
        <span className="kn-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </span>
        <span>Brands</span>
      </Link>
      <Link href="/compare/" data-nav="compare" className={cls("compare")} aria-current={cur("compare")}>
        <span className="kn-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8h13l-3.5-3.5M21 16H8l3.5 3.5" />
          </svg>
        </span>
        <span className="nav-badge" id="navCompareCount" aria-hidden="true" suppressHydrationWarning />
        <span>Compare</span>
      </Link>
    </nav>
  )
}

function WithQuery() {
  const path = usePathname() || "/"
  const sp = useSearchParams()
  return <Nav active={activeFor(path, !!(sp.get("q") || sp.get("search")))} />
}

function WithoutQuery() {
  const path = usePathname() || "/"
  return <Nav active={activeFor(path, false)} />
}

export default function MmMobileNav() {
  // useSearchParams needs a Suspense boundary on ISR pages; the fallback
  // renders the same nav from the path alone so it is never missing.
  return (
    <Suspense fallback={<WithoutQuery />}>
      <WithQuery />
    </Suspense>
  )
}
