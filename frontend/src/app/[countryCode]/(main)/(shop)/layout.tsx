import "styles/globals.css"
import { getSiteSettings } from "@lib/data/site-settings"
import { buildTheme } from "@lib/util/theme"
import { ClientUserWidgets } from "../client-wrappers"

/**
 * Ecommerce pages that never existed on the PHP site (cart, account,
 * orders, store listing) keep the zmobile storefront components and their
 * stylesheet. They still sit inside the mymobile.pk header/footer from the
 * parent (main) layout.
 */
export default async function ShopLayout(props: { children: React.ReactNode }) {
  const settings = await getSiteSettings()
  const theme = buildTheme(settings)
  return (
    <div className="zm-shop font-sans antialiased text-ink bg-bg" data-mode="light">
      <style dangerouslySetInnerHTML={{ __html: theme.cssVarsBlock }} />
      {/* zmobile components use Phosphor icons (self-hosted) */}
      <link rel="stylesheet" href="/icons/phosphor/regular/style.css" />
      <link rel="stylesheet" href="/icons/phosphor/bold/style.css" />
      <link rel="stylesheet" href="/icons/phosphor/fill/style.css" />
      {props.children}
      <ClientUserWidgets cartDrawerEnabled={settings.cart_drawer_enabled === "true"} />
    </div>
  )
}
