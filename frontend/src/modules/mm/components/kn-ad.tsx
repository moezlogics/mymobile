/**
 * lib/ads.php kn_ad() — one responsive AdSense unit. /mm/ads.js (loaded
 * once in the root layout) pushes each unit when it has layout, including
 * units that appear after client-side navigation.
 */
export const KN_ADS_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "ca-pub-2571706004681433"
export const KN_ADS_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT || "3017142585"
export const KN_ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED !== "false"

export default function KnAd({ grid = false, className = "" }: { placement?: string; grid?: boolean; className?: string }) {
  if (!KN_ADS_ENABLED) return null
  return (
    <div className={`kn-ad${grid ? " kn-ad--grid" : ""}${className ? ` ${className}` : ""}`}>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={KN_ADS_CLIENT}
        data-ad-slot={KN_ADS_SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}
