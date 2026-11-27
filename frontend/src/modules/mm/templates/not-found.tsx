import Link from "next/link"

/** 404.php — same markup (styles in /mm/site.css). */
export default function MmNotFound() {
  return (
    <section className="error-404" aria-labelledby="error-404-title">
      <div className="error-404__inner">
        <p className="error-404__code" aria-hidden="true">
          404
        </p>
        <h1 id="error-404-title" className="error-404__title">
          Page not found
        </h1>
        <p className="error-404__text">This link is broken or the page was removed. Try searching, or head back home.</p>
        <form className="error-404__search" action="/mobiles/" method="GET" role="search">
          <label className="sr-only" htmlFor="error404Search">
            Search mobiles
          </label>
          <input id="error404Search" type="search" name="q" placeholder="Search mobiles..." autoComplete="off" required />
          <button type="submit" aria-label="Search">
            <i className="fa-solid fa-magnifying-glass" />
          </button>
        </form>
        <div className="error-404__actions">
          <Link href="/" className="error-404__btn error-404__btn--primary">
            Home
          </Link>
          <Link href="/categories/" className="error-404__btn error-404__btn--ghost">
            Sections
          </Link>
        </div>
      </div>
    </section>
  )
}
