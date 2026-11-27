import { MetadataRoute } from "next"
import { getBaseURL } from "@lib/util/env"

/**
 * robots.txt — the mymobile.pk PHP rules (robots.php) kept intact, plus the
 * transactional routes the new ecommerce storefront adds (account, cart,
 * checkout, order, auth). Legacy disallows for PHP-only endpoints stay so any
 * stale links to them are never crawled.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseURL().replace(/\/+$/, "")

  const disallow = [
    // legacy PHP (unchanged)
    "/newlogin/",
    "/includes/",
    "/lib/",
    "/cache/",
    "/vendor/",
    "/node_modules/",
    "/track_view.php",
    "/track_device_view.php",
    "/review_helpful.php",
    "/ajax_compare.php",
    "/ajax_device_search.php",
    "/submit_review.php",
    "/compare/",
    "/compare",
    "/*?*spec[",
    "/*?*brand[",
    "/*?*sort=",
    "/*?*min_price=",
    "/*?*max_price=",
    "/*?q=",
    "/*?*page=",
    // new storefront — transactional / personal
    "/account",
    "/account/",
    "/cart",
    "/cart/",
    "/checkout",
    "/checkout/",
    "/order/",
    "/auth/",
    "/api/",
    "/*?*sortBy=",
    "/*?*v_id=",
    "/*?*spec_",
  ]

  return {
    rules: [{ userAgent: "*", allow: ["/", "/cache/img/"], disallow }],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
