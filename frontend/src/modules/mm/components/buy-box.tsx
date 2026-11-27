"use client"

/**
 * Device page price + memory chips (PHP device.php .dp-price / .dp-variants,
 * same markup and behaviour) with the new ecommerce actions underneath:
 * quantity, Add to Cart, Buy Now.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { addToCart } from "@lib/data/cart"

export type BuyVariant = { id: string | null; label: string; price: number | null }

type Props = {
  variants: BuyVariant[]
  hasLegacyVariants: boolean
  fromPrice: number | null
  priceOld: number | null
  priceNote: string | null
  priceUsd: number | null
  purchasable: boolean
  unavailableLabel?: string
}

const fmt = (n: number | null | undefined) => (n && n > 0 ? `Rs ${Math.round(n).toLocaleString("en-US")}` : "")

export default function MmBuyBox({
  variants,
  hasLegacyVariants,
  fromPrice,
  priceOld,
  priceNote,
  priceUsd,
  purchasable,
  unavailableLabel,
}: Props) {
  const router = useRouter()
  const [sel, setSel] = useState(0)
  const [picked, setPicked] = useState(false)
  const [qty, setQty] = useState(1)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  const current = variants[sel]
  const shownPrice = picked && current?.price ? current.price : fromPrice
  const canBuy = purchasable && !!current?.id && !!current?.price

  const add = (thenCheckout: boolean) => {
    if (!canBuy || !current?.id) return
    setMsg(null)
    start(async () => {
      try {
        await addToCart({ variantId: current.id!, quantity: qty, countryCode: "pk" })
        window.dispatchEvent(new Event("mm:cart-updated"))
        if (thenCheckout) router.push("/checkout/?step=address")
        else setMsg({ ok: true, text: "Added to cart." })
      } catch (e: any) {
        setMsg({ ok: false, text: e?.message || "Could not add to cart. Please try again." })
      }
    })
  }

  const notes = [priceNote, priceUsd ? `≈ $${Math.round(priceUsd).toLocaleString("en-US")}` : null].filter(Boolean)

  return (
    <>
      <div className="dp-price">
        {fromPrice !== null ? (
          <>
            {hasLegacyVariants && !picked && <span className="from">From</span>}
            <span className="amt" id="dpPrice">
              {fmt(shownPrice)}
            </span>
            {priceOld && fromPrice && priceOld > fromPrice && <span className="was">{fmt(priceOld)}</span>}
          </>
        ) : (
          <span className="tba">Price not announced yet</span>
        )}
      </div>
      {notes.length > 0 && <p className="dp-pricenote">{notes.join(" · ")}</p>}

      {hasLegacyVariants && (
        <>
          <div className="dp-varlabel" id="variants">
            Memory
          </div>
          <div className="dp-variants" role="group" aria-label="Memory options">
            {variants.map((v, i) => (
              <button
                type="button"
                key={v.label}
                className={i === sel ? "on" : ""}
                data-price={fmt(v.price)}
                onClick={() => {
                  setSel(i)
                  setPicked(true)
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mm-buy">
        {canBuy ? (
          <div className="mm-buy-row">
            <span className="mm-buy-qty" aria-label="Quantity">
              <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                −
              </button>
              <span>{qty}</span>
              <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(10, q + 1))}>
                +
              </button>
            </span>
            <button type="button" className="mm-btn mm-btn-primary" disabled={pending} onClick={() => add(false)}>
              {pending ? "Adding…" : "Add to Cart"}
            </button>
            <button type="button" className="mm-btn mm-btn-dark" disabled={pending} onClick={() => add(true)}>
              Buy Now
            </button>
          </div>
        ) : (
          <p className="mm-buy-note">{unavailableLabel || "Not available to order online yet."}</p>
        )}
        {msg && <p className={`mm-buy-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}
      </div>
    </>
  )
}
