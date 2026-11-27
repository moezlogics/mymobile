"use client"

import { useEffect } from "react"

/**
 * Runs a PHP-era inline <script> once the server markup it targets is in
 * the DOM (the PHP pages ran them at the end of <body>). Keeps the original
 * DOM-based behaviour — dropdown placement, infinite scroll, carousels —
 * byte-for-byte instead of re-writing it. Re-runs when `code` changes
 * (i.e. on client-side navigation to another page that ships a script).
 */
export default function LegacyScript({ code }: { code: string }) {
  useEffect(() => {
    try {
      // eslint-disable-next-line no-new-func
      new Function(code)()
    } catch (e) {
      console.error("[legacy-script]", e)
    }
  }, [code])
  return null
}
