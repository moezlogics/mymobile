import { Metadata } from "next"

import { getBaseURL } from "@lib/util/env"
import MmHeader from "@modules/mm/layout/header"
import MmFooter from "@modules/mm/layout/footer"
import { CompareProvider } from "@modules/products/components/compare/context"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

/**
 * Public shell — the mymobile.pk PHP header, <main id="app-container">,
 * footer and mobile bottom nav (src/modules/mm/layout). No cookies() here:
 * per-user bits (cart badge) load client-side so pages stay ISR-cacheable.
 */
export default async function PageLayout(props: { children: React.ReactNode }) {
  return (
    <CompareProvider>
      <MmHeader />
      <main id="app-container" className="transition-opacity duration-300">
        {props.children}
      </main>
      <MmFooter />
    </CompareProvider>
  )
}
