import { Metadata } from "next"
import MmNotFound from "@modules/mm/templates/not-found"

/** 404.php — inside the mymobile.pk header/footer. */
export const metadata: Metadata = {
  title: "Page Not Found",
  description: "The page you requested could not be found. Browse the latest news, sections, or return home.",
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return <MmNotFound />
}
