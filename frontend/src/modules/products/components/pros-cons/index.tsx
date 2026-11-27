/**
 * Pros & Cons — newline-separated lists from `metadata.pros` / `metadata.cons`
 * (mymobile.pk device editor). Server component; plain semantic lists so the
 * content stays crawlable exactly like the PHP device page.
 */
const lines = (v: unknown): string[] =>
  typeof v === "string"
    ? v
        .split(/\r?\n/)
        .map((s) => s.replace(/^[-•*]\s*/, "").trim())
        .filter(Boolean)
    : []

export default function ProsCons({ metadata, title }: { metadata?: Record<string, any> | null; title: string }) {
  const pros = lines(metadata?.pros)
  const cons = lines(metadata?.cons)
  if (!pros.length && !cons.length) return null

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6" aria-label={`${title} pros and cons`}>
      {pros.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
          <h2 className="text-[16px] font-semibold text-emerald-800 mb-3">Pros</h2>
          <ul className="space-y-2">
            {pros.map((p, i) => (
              <li key={i} className="flex gap-2 text-[14px] text-ink/85 leading-snug">
                <i className="ph ph-check-circle text-emerald-600 text-[18px] shrink-0" aria-hidden />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {cons.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
          <h2 className="text-[16px] font-semibold text-rose-800 mb-3">Cons</h2>
          <ul className="space-y-2">
            {cons.map((c, i) => (
              <li key={i} className="flex gap-2 text-[14px] text-ink/85 leading-snug">
                <i className="ph ph-x-circle text-rose-600 text-[18px] shrink-0" aria-hidden />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
