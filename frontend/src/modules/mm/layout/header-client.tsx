"use client"

/**
 * mymobile.pk header — markup and class names ported 1:1 from
 * includes/header.php; the inline PHP scripts (sticky compaction, mobile
 * drawer, fullscreen search with live results) are reimplemented as React
 * state. Ecommerce addition: a cart link with the live item count.
 */
import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"

export type NavLink = { label: string; url: string; children?: NavLink[] }

type Props = {
  siteName: string
  logo: string | null
  nav: NavLink[]
}

type Hit = { slug: string; name: string; brand: string; img: string; price: string; url: string }

const isCurrent = (path: string, url: string) => {
  const p = url.replace(/\/+$/, "")
  const cur = path.replace(/\/+$/, "")
  if (p === "") return cur === ""
  return cur === p || (cur + "/").startsWith(p + "/")
}

function useCartCount() {
  const [count, setCount] = useState<number>(0)
  useEffect(() => {
    let alive = true
    const load = () =>
      fetch("/api/mm/cart-count", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then((d) => alive && setCount(Number(d.count) || 0))
        .catch(() => {})
    load()
    window.addEventListener("mm:cart-updated", load)
    return () => {
      alive = false
      window.removeEventListener("mm:cart-updated", load)
    }
  }, [])
  return count
}

export default function MmHeaderClient({ siteName, logo, nav }: Props) {
  const path = usePathname() || "/"
  const [stuck, setStuck] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuShown, setMenuShown] = useState(false)
  const [openSub, setOpenSub] = useState<number | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<any>(null)
  const cartCount = useCartCount()

  // Sticky compaction (PHP: header.is-stuck past 8px)
  useEffect(() => {
    let ticking = false
    const sync = () => {
      setStuck((window.scrollY || 0) > 8)
      ticking = false
    }
    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(sync)
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    sync()
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Drawer open/close with the same 300ms transition as PHP
  const toggleMenu = (open: boolean) => {
    if (open) {
      setMenuShown(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setMenuOpen(true)))
      document.body.style.overflow = "hidden"
    } else {
      setMenuOpen(false)
      document.body.style.overflow = ""
      setTimeout(() => setMenuShown(false), 300)
    }
  }

  const openSearch = () => {
    setSearchOpen(true)
    document.body.style.overflow = "hidden"
    setTimeout(() => inputRef.current?.focus(), 80)
  }
  const closeSearch = () => {
    setSearchOpen(false)
    document.body.style.overflow = ""
  }

  useEffect(() => {
    const onOpen = () => openSearch()
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeSearch()
    window.addEventListener("mm:open-search", onOpen)
    document.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("mm:open-search", onOpen)
      document.removeEventListener("keydown", onKey)
    }
  }, [])

  // Close overlays on navigation
  useEffect(() => {
    if (menuShown) toggleMenu(false)
    if (searchOpen) closeSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  const live = (val: string) => {
    setQ(val)
    clearTimeout(timer.current)
    setFailed(false)
    if (val.length < 2) {
      setHits(null)
      setSearching(false)
      return
    }
    setSearching(true)
    timer.current = setTimeout(() => {
      fetch(`/api/mm/search?q=${encodeURIComponent(val)}`)
        .then((r) => r.json())
        .then((d) => setHits(d))
        .catch(() => setFailed(true))
        .finally(() => setSearching(false))
    }, 350)
  }

  return (
    <header
      id="siteHeader"
      className={`sticky top-0 z-50 transition-colors duration-300${stuck ? " is-stuck" : ""}`}
      style={{ backgroundColor: "var(--theme-header-bg)", color: "var(--theme-header-text)" }}
    >
      <div className="global-container">
        <div className="flex items-center justify-between gap-4 header-bar">
          {/* Logo: left-aligned on every screen size */}
          <div className="flex items-center shrink-0 justify-start">
            <Link href="/" className="flex items-center site-logo-link">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo}
                  alt={siteName}
                  className="logo-img logo-full object-contain"
                  width={120}
                  height={40}
                  fetchPriority="high"
                  decoding="async"
                />
              ) : (
                <span className="logo-full text-lg md:text-xl font-bold tracking-tight" style={{ color: "var(--theme-header-text)" }}>
                  {siteName}
                </span>
              )}
            </Link>
          </div>

          {/* Right side: Nav (desktop only) + cart */}
          <div className="flex items-center shrink-0 gap-3 ml-auto">
            <nav className="hidden lg:block">
              <ul className="flex items-center gap-0.5" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {nav.map((link, i) => {
                  const on = isCurrent(path, link.url)
                  const hasChildren = !!link.children?.length
                  return (
                    <li key={i} className={hasChildren ? "relative group header-dropdown" : ""}>
                      <Link
                        href={link.url}
                        className={`hdr-nav-link${hasChildren ? " header-dropdown-btn" : ""}${on ? " is-current" : ""}`}
                        aria-current={on ? "page" : undefined}
                      >
                        {hasChildren ? <span>{link.label}</span> : link.label}
                        {hasChildren && (
                          <svg className="hdr-nav-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        )}
                      </Link>
                      {hasChildren && (
                        <div className="absolute left-0 top-full pt-1.5 w-48 hidden group-hover:block group-focus-within:block header-dropdown-menu z-50">
                          <ul className="bg-white text-slate-800 rounded-xl shadow-xl border border-slate-100 py-2 list-none m-0 p-0 overflow-hidden">
                            {link.children!.map((c, j) => (
                              <li key={j}>
                                <Link href={c.url} className="block px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-theme-secondary transition-all text-decoration-none">
                                  {c.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </nav>
            <Link href="/cart/" className="mm-cart-link" aria-label={`Cart (${cartCount} items)`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 7h12l-1 13H7L6 7Z" />
                <path d="M9 7a3 3 0 0 1 6 0" />
              </svg>
              {cartCount > 0 && <span className="mm-cart-badge">{cartCount}</span>}
            </Link>
          </div>
        </div>

        {/* Search row — search field plus the menu button, under the bar */}
        <div className="hdr-search-row">
          <form action="/mobiles/" method="GET" className="hdr-search" role="search">
            <button type="submit" className="hdr-search-ico" aria-label="Search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
            <input
              type="text"
              name="q"
              id="desktopSearch"
              autoComplete="off"
              placeholder="Search phones, brands & prices"
              aria-label="Search phones"
            />
          </form>
          <button type="button" aria-label="Open menu" className="hdr-menu-btn" onClick={() => toggleMenu(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Search Overlay (fullscreen, white glass, native-app style) */}
      <div
        id="mobileSearchBar"
        style={{
          display: searchOpen ? "flex" : "none",
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          flexDirection: "column",
          alignItems: "stretch",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderBottom: "1px solid #e8edf2",
            background: "#fff",
            position: "sticky",
            top: 0,
            zIndex: 10,
            boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
          }}
        >
          <button type="button" aria-label="Close search" onClick={closeSearch} className="mm-search-back">
            <i className="fa-solid fa-arrow-left" style={{ fontSize: 17 }} />
          </button>
          <form
            action="/mobiles/"
            method="GET"
            style={{ flex: 1, display: "flex", alignItems: "center" }}
            onSubmit={() => closeSearch()}
          >
            <div style={{ position: "relative", width: "100%", display: "flex", alignItems: "center" }}>
              <i
                className="fa-solid fa-magnifying-glass"
                style={{ position: "absolute", left: 13, color: "#94a3b8", fontSize: 13, pointerEvents: "none" }}
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="text"
                name="q"
                id="mobileSearchInput"
                placeholder="Search phones, brands..."
                aria-label="Search phones"
                autoComplete="off"
                className="mm-search-input"
                value={q}
                onChange={(e) => live(e.target.value)}
              />
              {q && (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="mm-search-clear"
                  onClick={() => {
                    live("")
                    inputRef.current?.focus()
                  }}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              )}
            </div>
          </form>
        </div>

        {q.length < 2 && (
          <div id="mobileSearchHint" style={{ padding: "28px 16px 0", color: "#94a3b8", fontSize: "0.82rem", textAlign: "center" }}>
            <i className="fa-solid fa-magnifying-glass" style={{ fontSize: "2rem", color: "#e2e8f0", display: "block", marginBottom: 10 }} />
            Type a phone or brand name
          </div>
        )}

        <div id="mobileSearchResults" style={{ padding: "12px 14px 80px", display: "flex", flexDirection: "column", gap: 12 }}>
          {searching && (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#94a3b8", fontSize: "0.85rem" }}>
              <i className="fa-solid fa-spinner fa-spin" /> Searching...
            </div>
          )}
          {!searching && failed && (
            <div style={{ textAlign: "center", padding: 24, color: "#f87171", fontSize: "0.85rem" }}>Search failed. Try again.</div>
          )}
          {!searching && !failed && hits && hits.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: "0.85rem" }}>
              <i className="fa-solid fa-mobile-screen" style={{ fontSize: "1.8rem", color: "#e2e8f0", display: "block", marginBottom: 10 }} />
              No devices found
            </div>
          )}
          {!searching &&
            hits?.map((item) => (
              <Link
                key={item.slug}
                href={item.url}
                onClick={closeSearch}
                style={{ display: "flex", gap: 12, alignItems: "center", textDecoration: "none", color: "inherit" }}
              >
                <div style={{ flex: "0 0 58px", height: 66, borderRadius: 8, overflow: "hidden", background: "#fff", border: "1px solid #e6eaf0" }}>
                  {item.img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.img} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} loading="lazy" />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "0.84rem", fontWeight: 700, color: "#1e293b", lineHeight: 1.35, margin: "0 0 3px" }}>{item.name}</p>
                  <p style={{ fontSize: "0.72rem", color: "#64748b", margin: 0 }}>
                    {item.brand}
                    {item.price ? (
                      <>
                        {" · "}
                        <strong>{item.price}</strong>
                      </>
                    ) : null}
                  </p>
                </div>
              </Link>
            ))}
        </div>
      </div>

      {/* Mobile Sidebar Menu Drawer */}
      <div id="mobileMenuDrawer" className={`fixed inset-0 z-[100]${menuShown ? "" : " hidden"}`} role="dialog" aria-modal="true">
        <div
          id="mobileMenuBackdrop"
          className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ${menuOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => toggleMenu(false)}
        />
        <div
          id="mobileMenuPanel"
          className={`fixed top-0 left-0 bottom-0 w-72 max-w-[80vw] bg-white shadow-2xl flex flex-col z-50 transform transition-transform duration-300 ease-out ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
          style={{ backgroundColor: "#ffffff" }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100" style={{ borderColor: "#f1f5f9" }}>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-slate-900" style={{ color: "#1e293b" }}>
                Menu
              </span>
            </div>
            <button
              type="button"
              aria-label="Close menu"
              className="h-8 w-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              onClick={() => toggleMenu(false)}
              style={{ color: "#64748b" }}
            >
              <i className="fa-solid fa-xmark text-lg" />
            </button>
          </div>

          <nav className="flex-grow overflow-y-auto py-4 px-3">
            <ul className="space-y-1">
              {nav.map((link, i) => (
                <li key={i}>
                  {link.children?.length ? (
                    <div className="mobile-submenu-wrap">
                      <button
                        type="button"
                        className="flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm font-semibold text-slate-700 hover:text-indigo-600 hover:bg-slate-50 transition-all"
                        onClick={() => setOpenSub(openSub === i ? null : i)}
                        style={{ color: "#334155", border: "none", background: "none", textAlign: "left", cursor: "pointer", width: "100%" }}
                      >
                        <span>{link.label}</span>
                        <i
                          className={`fa-solid fa-chevron-down text-xs transition-transform duration-200 chevron${openSub === i ? " rotate-180" : ""}`}
                          style={{ color: "#64748b" }}
                        />
                      </button>
                      <ul className={`space-y-1 pl-4 mt-1${openSub === i ? "" : " hidden"}`}>
                        {link.children.map((c, j) => (
                          <li key={j}>
                            <Link
                              href={c.url}
                              className="flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-all"
                              style={{ color: "#4b5563" }}
                            >
                              └─ {c.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <Link
                      href={link.url}
                      className="flex items-center px-4 py-3 rounded-xl text-sm font-semibold text-slate-700 hover:text-indigo-600 hover:bg-slate-50 transition-all"
                      style={{ color: "#334155" }}
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
              <li>
                <Link
                  href="/account/"
                  className="flex items-center px-4 py-3 rounded-xl text-sm font-semibold text-slate-700 hover:text-indigo-600 hover:bg-slate-50 transition-all"
                  style={{ color: "#334155" }}
                >
                  My Account
                </Link>
              </li>
            </ul>
          </nav>

          <div className="p-5 border-t border-slate-100 mt-auto bg-slate-50/50" style={{ borderColor: "#f1f5f9", backgroundColor: "#f8fafc" }}>
            <p className="text-xs text-slate-400 text-center">
              &copy; {new Date().getFullYear()} {siteName}
            </p>
          </div>
        </div>
      </div>
    </header>
  )
}
