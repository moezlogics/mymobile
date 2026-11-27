"use client"

/** Brand strip arrow — calls window.scrollBrands() set up by the PHP script. */
export default function BrandNavButton({ dir, label, children }: { dir: 1 | -1; label: string; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={() => (window as any).scrollBrands?.(dir)}>
      {children}
    </button>
  )
}
