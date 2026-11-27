import { notFound } from "next/navigation"
import { getBrandByPath } from "@lib/data/brands"
import { getCategoryByHandle } from "@lib/data/categories"
import { buildListing, ListingParams } from "@modules/mm/lib/listing"
import MmArchive from "./archive"

/** brand.php → devices.php */
export async function MmBrandArchive({ handle, params = {} }: { handle: string; params?: ListingParams }) {
  const data = await getBrandByPath([handle])
  if (!data) notFound()
  const b: any = data.brand
  const listing = await buildListing({ kind: "brand", handle, basePath: `/${handle}/` }, params)
  return (
    <MmArchive
      listing={listing}
      heading={b.metadata?.h1 || `${b.name} Mobile Phones — Prices & Specifications`}
      crumb={b.name}
      forcedBrand
      intro={b.description ? String(b.description) : null}
      canonicalPath={`/${handle}/`}
      schemaName={b.name}
    />
  )
}

/** category.php → devices.php */
export async function MmCategoryArchive({ handle, params = {} }: { handle: string; params?: ListingParams }) {
  const cat: any = await getCategoryByHandle([handle])
  if (!cat) notFound()
  const listing = await buildListing({ kind: "category", handle, basePath: `/category/${handle}/` }, params)
  return (
    <MmArchive
      listing={listing}
      heading={cat.metadata?.h1 || cat.name}
      crumb={cat.name}
      intro={cat.description || null}
      canonicalPath={`/category/${handle}/`}
      schemaName={cat.name}
    />
  )
}

/** devices.php?q= — search results (noindex, canonical → home) */
export async function MmSearchResults({ params }: { params: ListingParams }) {
  const listing = await buildListing({ kind: "search", basePath: "/mobiles/" }, params)
  const heading = listing.q ? `Search results for “${listing.q}”` : "All Mobile Phones"
  return <MmArchive listing={listing} heading={heading} crumb={null} />
}
