"use client"

/**
 * Element with a PHP-style inline onclick handler: `code` runs with `this`
 * bound to the element (e.g. "SpecsCompare.compareThis(this)",
 * "SpecsReview.open();return false;"). Returning false prevents the default.
 */
import { createElement } from "react"

type Props = { as?: "button" | "a" | "div" | "span" | "img"; code: string; [k: string]: any }

export default function OnClick({ as = "button", code, children, ...rest }: Props) {
  return createElement(
    as,
    {
      ...rest,
      ...(as === "button" && !rest.type ? { type: "button" } : {}),
      onClick: (e: any) => {
        try {
          // eslint-disable-next-line no-new-func
          const r = new Function("event", code).call(e.currentTarget, e.nativeEvent)
          if (r === false) e.preventDefault()
        } catch (err) {
          console.error("[onclick]", err)
        }
      },
    },
    children
  )
}
