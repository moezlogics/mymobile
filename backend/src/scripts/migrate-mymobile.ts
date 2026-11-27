/**
 * mymobile.pk  →  Medusa (PostgreSQL) full data migration.
 *
 *   npx medusa exec ./src/scripts/migrate-mymobile.ts
 *
 * Reads the legacy PHP site's MySQL database (LEGACY_MYSQL_URL, default
 * mysql://root@127.0.0.1:3306/mymobile) and recreates EVERYTHING in Medusa:
 *
 *   settings            → store (PKR), region Pakistan, sales channel, stock
 *                         location, shipping, publishable key, site_setting keys
 *   spec_templates      → spec_template (same keys/groups as PHP, so the spec
 *                         sheet reads the legacy `specs` JSON unchanged)
 *   device_categories   → product categories (children of "Mobile Phones")
 *   brands              → brand module (+ brand_product links)
 *   devices             → products (variants "4/128" etc. with PKR prices,
 *                         price_old → sale price list, metadata.specs, pros/cons…)
 *   device_reviews      → advanced_review (replies → owner_reply / metadata)
 *   admin_users         → blog_author
 *   categories / tags   → blog_category / blog_tag
 *   posts / post_tags   → blog_post
 *   comments            → blog_comment
 *   pages + about/contact settings → cms_page
 *   contact_queries     → contact_lead
 *   menu_items, footer_menu_items, home_sections → site_setting JSON keys
 *
 * Every created/updated timestamp, slug and SEO field is preserved — the
 * storefront rebuilds the exact legacy URLs from these handles.
 *
 * Images: legacy paths like `images/foo.webp` become
 * `${LEGACY_IMAGE_BASE}/images/foo.webp` (default `${CDN_PUBLIC_URL}/uploads`).
 * Copy the PHP `images/` folder into the CDN's UPLOAD_DIR/images first —
 * see scripts/copy-legacy-images in the repo root.
 *
 * Idempotent: rows whose handle already exists are skipped, so the script can
 * be re-run after a partial failure. For a clean re-import, reset the DB.
 */
import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createPriceListsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"
import mysql from "mysql2/promise"

// ─────────────────────────────────────────────────────────────── config ──
const MYSQL_URL = process.env.LEGACY_MYSQL_URL || "mysql://root@127.0.0.1:3306/mymobile"
const IMAGE_BASE = (
  process.env.LEGACY_IMAGE_BASE ||
  `${(process.env.CDN_PUBLIC_URL || "https://cdn.mymobile.pk").replace(/\/+$/, "")}/uploads`
).replace(/\/+$/, "")
const LEGACY_HOST_RE = /^https?:\/\/(?:www1?\.)?mymobile\.pk/i
const COUNTRY = "pk"
const CURRENCY = "pkr"

// ─────────────────────────────────────────────────────────────── helpers ──
type Row = Record<string, any>

const str = (v: any): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === "" ? null : s
}
const num = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const json = <T = any>(v: any, fallback: T): T => {
  if (v === null || v === undefined || v === "") return fallback
  if (typeof v === "object") return v as T
  try {
    return JSON.parse(String(v)) as T
  } catch {
    return fallback
  }
}
const iso = (v: any): string | null => {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(String(v).replace(" ", "T") + (String(v).includes("T") ? "" : "+05:00"))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
const idList = (v: any): number[] =>
  String(v ?? "")
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)

/** Legacy image path / URL → CDN URL. External URLs are left untouched. */
export function legacyImageUrl(p: any): string | null {
  let s = str(p)
  if (!s) return null
  if (/^https?:\/\//i.test(s)) {
    if (!LEGACY_HOST_RE.test(s)) return s
    s = s.replace(LEGACY_HOST_RE, "")
  }
  s = s.replace(/^(\.\.\/)+/, "").replace(/^\/+/, "")
  // /thumb.php?src=images/x.webp&w=200 → the original image
  const thumb = s.match(/^thumb\.php\?(.*)$/i)
  if (thumb) {
    const src = new URLSearchParams(thumb[1]).get("src")
    if (src) s = src.replace(/^\/+/, "")
  }
  return `${IMAGE_BASE}/${s}`
}

/** Rewrite every legacy image reference inside rich HTML to the CDN. */
export function rewriteHtml(html: any): string | null {
  const s = str(html)
  if (!s) return null
  return s
    // absolute or root-relative /images/… and ../images/…
    .replace(
      /(["'(\s,])(?:https?:\/\/(?:www1?\.)?mymobile\.pk)?(?:\.\.)?\/?(images\/[^"')\s,]+)/gi,
      (_m, pre, path) => `${pre}${IMAGE_BASE}/${path}`
    )
    // on-demand thumbs
    .replace(
      /(?:https?:\/\/(?:www1?\.)?mymobile\.pk)?\/thumb\.php\?src=([^"'&\s]+)[^"'\s]*/gi,
      (_m, src) => `${IMAGE_BASE}/${decodeURIComponent(src).replace(/^\/+/, "")}`
    )
}

const sku = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)

// ────────────────────────────────────────────────────────────────── main ──
export default async function migrateMymobile({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const storeSvc = container.resolve(Modules.STORE)
  const salesChannelSvc = container.resolve(Modules.SALES_CHANNEL)
  const regionSvc = container.resolve(Modules.REGION)
  const fulfillmentSvc = container.resolve(Modules.FULFILLMENT)
  const stockLocationSvc = container.resolve(Modules.STOCK_LOCATION)
  const apiKeySvc = container.resolve(Modules.API_KEY)
  const productSvc = container.resolve(Modules.PRODUCT)
  const brandSvc: any = container.resolve("brand")
  const blogSvc: any = container.resolve("blog")
  const reviewSvc: any = container.resolve("advanced_reviews")
  const settingsSvc: any = container.resolve("site_settings")
  const leadsSvc: any = container.resolve("contact_leads")
  const specSvc: any = container.resolve("specTemplate")

  const db = await mysql.createConnection({ uri: MYSQL_URL, dateStrings: true, charset: "utf8mb4" })
  const q = async (sql: string, params: any[] = []): Promise<Row[]> => {
    const [rows] = await db.query(sql, params)
    return rows as Row[]
  }
  const hasTable = async (t: string) =>
    (await q("SHOW TABLES LIKE ?", [t])).length > 0

  /** Preserve legacy timestamps on any Medusa table. */
  const setDates = async (table: string, id: string, created: any, updated?: any) => {
    const c = iso(created)
    const u = iso(updated) || c
    if (!c && !u) return
    await pg.raw(
      `update "${table}" set created_at = coalesce(?::timestamptz, created_at), updated_at = coalesce(?::timestamptz, updated_at) where id = ?`,
      [c, u, id]
    )
  }

  // Exact titles/descriptions as the PHP site RENDERED them (formula-computed
  // when the DB field was empty). Produced by tools/seo-snapshot.mjs.
  const seoByPath = new Map<string, { title?: string; description?: string; h1?: string }>()
  const baselineFile = process.env.SEO_BASELINE || require("path").resolve(process.cwd(), "../seo/baseline-php.json")
  try {
    const snap = JSON.parse(require("fs").readFileSync(baselineFile, "utf8"))
    for (const p of snap.pages || []) if (p.status === 200) seoByPath.set(p.path, p)
    logger.info(`[mymobile] SEO baseline: ${seoByPath.size} pages from ${baselineFile}`)
  } catch {
    logger.warn(`[mymobile] no SEO baseline at ${baselineFile} — DB meta fields used as-is`)
  }
  const seo = (path: string) => seoByPath.get(path) || {}

  logger.info(`[mymobile] legacy DB: ${MYSQL_URL.replace(/\/\/[^@]*@/, "//***@")}`)
  logger.info(`[mymobile] image base: ${IMAGE_BASE}`)

  const settings: Row = (await q("SELECT * FROM settings LIMIT 1"))[0] || {}

  // media alt-text lookup (path → alt)
  const altByPath = new Map<string, string>()
  for (const m of await q("SELECT path, filename, alt_text FROM media")) {
    const alt = str(m.alt_text)
    if (!alt) continue
    for (const k of [m.path, m.filename, `images/${m.filename}`]) {
      const key = str(k)?.replace(/^(\.\.\/)+|^\/+/g, "")
      if (key) altByPath.set(key, alt)
    }
  }
  const altFor = (p: any) => {
    const key = str(p)?.replace(LEGACY_HOST_RE, "").replace(/^(\.\.\/)+|^\/+/g, "")
    return key ? altByPath.get(key) || null : null
  }

  // ═════════════════════════════════════════════ 1. store infrastructure ══
  logger.info("[mymobile] 1/10 store, region, channel, shipping…")
  const [store] = await storeSvc.listStores()

  let [salesChannel] = await salesChannelSvc.listSalesChannels({ name: "Default Sales Channel" })
  if (!salesChannel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: "Default Sales Channel" }] },
    })
    salesChannel = result[0]
  }

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        name: str(settings.site_name) || "My Mobile",
        supported_currencies: [{ currency_code: CURRENCY, is_default: true }],
        default_sales_channel_id: salesChannel.id,
      },
    },
  })

  let [region] = await regionSvc.listRegions({ currency_code: CURRENCY })
  if (!region) {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Pakistan",
            currency_code: CURRENCY,
            countries: [COUNTRY],
            payment_providers: ["pp_system_default"],
            automatic_taxes: false,
          },
        ],
      },
    })
    region = result[0]
    await createTaxRegionsWorkflow(container).run({
      input: [{ country_code: COUNTRY, provider_id: "tp_system" }],
    })
  }

  let [stockLocation] = await stockLocationSvc.listStockLocations({ name: "Main Warehouse" })
  if (!stockLocation) {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: "Main Warehouse",
            address: {
              city: str(settings.business_city) || "Lahore",
              country_code: "PK",
              address_1: str(settings.business_address) || "",
            },
          },
        ],
      },
    })
    stockLocation = result[0]
    await updateStoresWorkflow(container).run({
      input: { selector: { id: store.id }, update: { default_location_id: stockLocation.id } },
    })
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
    })
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: stockLocation.id, add: [salesChannel.id] },
    })
  }

  let [shippingProfile] = await fulfillmentSvc.listShippingProfiles({ type: "default" })
  if (!shippingProfile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
    })
    shippingProfile = result[0]
  }

  const existingSets = await fulfillmentSvc.listFulfillmentSets({ name: "Pakistan delivery" })
  if (!existingSets.length) {
    const fulfillmentSet = await fulfillmentSvc.createFulfillmentSets({
      name: "Pakistan delivery",
      type: "shipping",
      service_zones: [{ name: "Pakistan", geo_zones: [{ country_code: COUNTRY, type: "country" }] }],
    })
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
    })
    const rules = [
      { attribute: "enabled_in_store", value: "true", operator: "eq" },
      { attribute: "is_return", value: "false", operator: "eq" },
    ] as any
    await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: "Standard Delivery",
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: fulfillmentSet.service_zones[0].id,
          shipping_profile_id: shippingProfile.id,
          type: { label: "Standard", description: "Delivery in 2-4 working days.", code: "standard" },
          prices: [
            { currency_code: CURRENCY, amount: 0 },
            { region_id: region.id, amount: 0 },
          ],
          rules,
        },
      ],
    })
  }

  const keys = await apiKeySvc.listApiKeys({ type: "publishable" })
  let publishableKey = keys[0]
  if (!publishableKey) {
    const { result } = await createApiKeysWorkflow(container).run({
      input: { api_keys: [{ title: "mymobile.pk storefront", type: "publishable", created_by: "" }] },
    })
    publishableKey = result[0]
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: { id: publishableKey.id, add: [salesChannel.id] },
    })
  }

  // ═══════════════════════════════════════════════════ 2. spec templates ══
  logger.info("[mymobile] 2/10 spec templates…")
  const templateIdByLegacy = new Map<number, string>()
  // Boolean fields per legacy template — PHP stored them as "1"/"0" strings;
  // the storefront formats real booleans as Yes/No (what PHP displayed).
  const boolKeysByTemplate = new Map<number, Set<string>>()
  for (const t of await q("SELECT * FROM spec_templates ORDER BY sort_order, id")) {
    const data = json(t.template_data, { groups: [] })
    boolKeysByTemplate.set(
      Number(t.id),
      new Set(
        (data.groups || []).flatMap((g: any) =>
          (g.fields || []).filter((f: any) => f.type === "boolean").map((f: any) => f.key)
        )
      )
    )
    const [existing] = await specSvc.listSpecTemplates({ handle: t.slug })
    let rec = existing
    if (existing) {
      // The PHP template is authoritative — it matches every stored specs blob.
      ;[rec] = await specSvc.updateSpecTemplates([{ id: existing.id, name: t.name, template_data: data }])
    } else {
      rec = await specSvc.createSpecTemplates({
        name: t.name,
        handle: t.slug,
        description: str(t.description),
        icon: str(t.icon) || "ph-device-mobile",
        is_preset: !!t.is_preset,
        sort_order: num(t.sort_order) ?? 0,
        template_data: data,
      })
    }
    templateIdByLegacy.set(Number(t.id), rec.id)
  }
  const defaultTemplateId =
    templateIdByLegacy.get(Number((await q("SELECT id FROM spec_templates WHERE is_default=1 LIMIT 1"))[0]?.id)) ||
    [...templateIdByLegacy.values()][0]

  // ══════════════════════════════════════════════════ 3. categories ══
  logger.info("[mymobile] 3/10 device categories…")
  const findCategory = async (handle: string) =>
    (await productSvc.listProductCategories({ handle }, { take: 1 }))[0]

  let root = await findCategory("mobile-phones")
  if (!root) {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: [
          {
            name: "Mobile Phones",
            handle: "mobile-phones",
            is_active: true,
            // Fallback bucket for devices without a category — never a public
            // URL (PHP had no /category/mobile-phones/).
            is_internal: true,
            metadata: { spec_template_id: defaultTemplateId, legacy_root: true },
          },
        ],
      },
    })
    root = result[0]
  }

  const categoryIdByLegacy = new Map<number, string>()
  for (const c of await q("SELECT * FROM device_categories ORDER BY sort_order, id")) {
    let cat = await findCategory(c.slug)
    if (!cat) {
      const { result } = await createProductCategoriesWorkflow(container).run({
        input: {
          product_categories: [
            {
              name: c.name,
              handle: c.slug,
              description: str(c.description) || "",
              is_active: true,
              is_internal: false,
              // Top-level on purpose: the storefront URL is /category/{handle}/
              // exactly like PHP, with no parent segment.
              rank: num(c.sort_order) ?? 0,
              metadata: {
                legacy_id: Number(c.id),
                meta_title: seo(`/category/${c.slug}/`).title || str(c.meta_title),
                meta_description: seo(`/category/${c.slug}/`).description || str(c.meta_description),
                h1: seo(`/category/${c.slug}/`).h1 || c.name,
                image: legacyImageUrl(c.image),
                is_featured: !!c.is_featured,
                spec_template_id: defaultTemplateId,
              },
            },
          ],
        },
      })
      cat = result[0]
      await setDates("product_category", cat.id, c.created_at)
    }
    categoryIdByLegacy.set(Number(c.id), cat.id)
  }

  // ═════════════════════════════════════════════════════════ 4. brands ══
  logger.info("[mymobile] 4/10 brands…")
  const brandByLegacy = new Map<number, { id: string; name: string; handle: string }>()
  for (const b of await q("SELECT * FROM brands ORDER BY sort_order, id")) {
    let [brand] = await brandSvc.listBrands({ handle: b.slug })
    if (!brand) {
      brand = await brandSvc.createBrands({
        name: b.name,
        handle: b.slug,
        logo_url: legacyImageUrl(b.logo),
        description: rewriteHtml(b.description),
        website_url: str(b.website),
        seo_title: seo(`/${b.slug}/`).title || str(b.meta_title),
        seo_description: seo(`/${b.slug}/`).description || str(b.meta_description),
        sort_order: num(b.sort_order) ?? 0,
        is_active: true,
        metadata: {
          legacy_id: Number(b.id),
          h1: seo(`/${b.slug}/`).h1 || null,
          founded: str(b.founded),
          country: str(b.country),
          is_featured: !!b.is_featured,
        },
      })
      await setDates("brand", brand.id, b.created_at)
    }
    brandByLegacy.set(Number(b.id), { id: brand.id, name: brand.name, handle: brand.handle })
  }

  // ════════════════════════════════════════════════════════ 5. devices ══
  logger.info("[mymobile] 5/10 devices → products…")
  const devices = await q("SELECT * FROM devices ORDER BY id")
  const slugById = new Map<number, string>(devices.map((d) => [Number(d.id), d.slug]))
  const productIdByLegacy = new Map<number, string>()
  const saleRows: { variant_id: string; amount: number }[] = []

  // 30-day views → "trending" rails
  const views30 = new Map<number, number>()
  for (const v of await q(
    "SELECT device_id, SUM(views) v FROM device_views WHERE day >= CURDATE() - INTERVAL 30 DAY GROUP BY device_id"
  )) views30.set(Number(v.device_id), Number(v.v))

  let created = 0
  let skipped = 0
  for (const d of devices) {
    const altPaths = [d.image, ...json<any[]>(d.gallery, []).map((g) => (typeof g === "string" ? g : g?.path || g?.url || g?.src))]
      .map(str)
      .filter(Boolean) as string[]
    const image_alts: Record<string, string> = {}
    for (const p of altPaths) {
      const a = altFor(p)
      const u = legacyImageUrl(p)
      if (a && u) image_alts[u] = a
    }
    const image_alt = (altPaths[0] && altFor(altPaths[0])) || null
    const existing = await productSvc.listProducts({ handle: d.slug }, { take: 1, select: ["id", "metadata"] })
    if (existing.length) {
      await productSvc.updateProducts(existing[0].id, {
        metadata: { ...(existing[0].metadata || {}), image_alts, image_alt },
      })
      productIdByLegacy.set(Number(d.id), existing[0].id)
      skipped++
      continue
    }

    const brand = d.brand_id ? brandByLegacy.get(Number(d.brand_id)) : undefined
    const specs = json<Record<string, any>>(d.specs, {})
    const boolKeys = boolKeysByTemplate.get(Number(d.template_id)) || new Set<string>()
    for (const k of boolKeys) {
      const v = specs[k]
      if (v === undefined || v === null || v === "") continue
      const s = String(v).trim().toLowerCase()
      if (["1", "yes", "true", "on"].includes(s)) specs[k] = true
      else if (["0", "no", "false", "off"].includes(s)) specs[k] = false
    }
    const gallery = json<any[]>(d.gallery, [])
      .map((g) => (typeof g === "string" ? g : g?.path || g?.url || g?.src))
      .filter(Boolean)
    const imagePaths = [d.image, ...gallery].map(str).filter(Boolean) as string[]
    const images = [...new Set(imagePaths)].map((p) => ({ url: legacyImageUrl(p)! }))

    const legacyVariants = json<{ label?: string; price?: any }[]>(d.variants, []).filter(
      (v) => str(v?.label)
    )
    const basePrice = num(d.price)
    const oldPrice = num(d.price_old)
    const available = d.availability === "available"

    const variantDefs = legacyVariants.length
      ? legacyVariants.map((v) => ({ label: String(v.label).trim(), price: num(v.price) ?? basePrice }))
      : [{ label: "Standard", price: basePrice }]
    // Option values must be unique.
    const seen = new Set<string>()
    const uniqueVariants = variantDefs.filter((v) => (seen.has(v.label) ? false : (seen.add(v.label), true)))

    const categoryIds = [
      ...new Set(
        [num(d.category_id), ...idList(d.additional_categories)]
          .map((id) => (id ? categoryIdByLegacy.get(id) : undefined))
          .filter(Boolean) as string[]
      ),
    ]
    if (!categoryIds.length) categoryIds.push(root.id)

    const metadata: Record<string, any> = {
      legacy_source: "mymobile.pk",
      image_alts,
      image_alt,
      legacy_id: Number(d.id),
      brand: brand?.name ?? null,
      brand_handle: brand?.handle ?? null,
      specs,
      model_no: str(d.model_no),
      availability: d.availability,
      release_date: str(d.release_date) || str(specs.release_date),
      short_desc: str(d.short_desc),
      pros: str(d.pros),
      cons: str(d.cons),
      price_note: str(d.price_note),
      price_usd: num(d.price_usd),
      price_old: oldPrice,
      // Plain numbers for cards/feeds/JSON API that don't need a region context.
      price: basePrice,
      price_from:
        uniqueVariants
          .map((v) => v.price)
          .filter((p): p is number => typeof p === "number" && p > 0)
          .sort((a, b) => a - b)[0] ?? basePrice,
      variants_legacy: legacyVariants,
      meta_title: seo(`/products/${d.slug}/`).title || str(d.meta_title),
      meta_description: seo(`/products/${d.slug}/`).description || str(d.meta_description),
      is_featured: !!d.is_featured,
      views: num(d.views) ?? 0,
      views_30d: views30.get(Number(d.id)) ?? 0,
      rating_sum: num(d.rating_sum) ?? 0,
      rating_count: num(d.rating_count) ?? 0,
      ai_score: num(d.ai_score),
      ai_score_json: json(d.ai_score_json, null),
      predecessor_handle: d.predecessor_device_id ? slugById.get(Number(d.predecessor_device_id)) ?? null : null,
      spin: json(d.spin, null),
      legacy_template_id: num(d.template_id),
      is_upcoming: d.availability === "coming_soon" || d.availability === "rumored",
    }
    if (d.availability === "coming_soon" && metadata.release_date) {
      metadata.launch_date = metadata.release_date
    }

    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: d.name,
            handle: d.slug,
            subtitle: str(d.short_desc) ?? undefined,
            description: rewriteHtml(d.description) ?? undefined,
            status: d.status === "active" ? ProductStatus.PUBLISHED : ProductStatus.DRAFT,
            thumbnail: images[0]?.url,
            images,
            category_ids: categoryIds,
            shipping_profile_id: shippingProfile.id,
            sales_channels: [{ id: salesChannel.id }],
            metadata,
            options: [{ title: "Variant", values: uniqueVariants.map((v) => v.label) }],
            variants: uniqueVariants.map((v) => ({
              title: v.label,
              sku: sku(`${d.slug}-${v.label}`),
              options: { Variant: v.label },
              // Upcoming / discontinued phones stay visible but not buyable.
              manage_inventory: !available,
              allow_backorder: false,
              prices:
                v.price && v.price > 0
                  ? [
                      {
                        currency_code: CURRENCY,
                        // price_old is the "was" price of the headline variant
                        amount:
                          oldPrice && basePrice && oldPrice > basePrice && v.price === basePrice
                            ? oldPrice
                            : v.price,
                      },
                    ]
                  : [],
            })),
          },
        ],
      },
    })
    const product = result[0]
    productIdByLegacy.set(Number(d.id), product.id)

    if (oldPrice && basePrice && oldPrice > basePrice) {
      const v = (product.variants || []).find((pv: any) => {
        const def = uniqueVariants.find((u) => u.label === pv.title)
        return def?.price === basePrice
      })
      if (v) saleRows.push({ variant_id: v.id, amount: basePrice })
    }

    if (brand) {
      await brandSvc.createBrandProducts({ product_id: product.id, brand_id: brand.id })
    }
    await setDates("product", product.id, d.created_at, d.updated_at)
    created++
    if (created % 25 === 0) logger.info(`[mymobile]   … ${created} products`)
  }
  logger.info(`[mymobile]   products created=${created} skipped(existing)=${skipped}`)

  if (saleRows.length) {
    await createPriceListsWorkflow(container).run({
      input: {
        price_lists_data: [
          {
            title: "mymobile.pk price drops",
            description: "Imported from devices.price_old (was-price → current price)",
            type: "sale",
            status: "active",
            prices: saleRows.map((r) => ({ variant_id: r.variant_id, amount: r.amount, currency_code: CURRENCY })),
          } as any,
        ],
      },
    })
  }

  // ════════════════════════════════════════════════════════ 6. reviews ══
  logger.info("[mymobile] 6/10 device reviews…")
  const existingReviewLegacy = new Set<number>(
    (await pg.raw(`select (metadata->>'legacy_id')::int as id from advanced_review where metadata ? 'legacy_id'`)).rows.map(
      (r: any) => r.id
    )
  )
  const reviews = await q("SELECT * FROM device_reviews ORDER BY parent_id IS NOT NULL, id")
  const reviewIdByLegacy = new Map<number, string>()
  const replyBuckets = new Map<number, Row[]>()
  let reviewCount = 0
  for (const r of reviews) {
    if (r.parent_id) {
      const list = replyBuckets.get(Number(r.parent_id)) || []
      list.push(r)
      replyBuckets.set(Number(r.parent_id), list)
      continue
    }
    if (existingReviewLegacy.has(Number(r.id))) continue
    const productId = productIdByLegacy.get(Number(r.device_id))
    if (!productId) continue
    const rec = await reviewSvc.createAdvancedReviews({
      product_id: productId,
      guest_name: str(r.name) || "Guest",
      guest_email: str(r.email),
      rating: Math.max(1, Math.min(5, Number(r.rating) || 5)),
      content: str(r.message) || "",
      status: r.status === "approved" ? "approved" : r.status === "spam" ? "flagged" : "pending",
      is_verified: false,
      photos: [],
      metadata: {
        legacy_id: Number(r.id),
        title: str(r.title),
        helpful: num(r.helpful) ?? 0,
        is_admin: !!r.is_admin,
        ip_address: str(r.ip_address),
      },
    })
    reviewIdByLegacy.set(Number(r.id), rec.id)
    await setDates("advanced_review", rec.id, r.created_at)
    reviewCount++
  }
  // Threaded replies: the first admin reply becomes owner_reply (rendered by
  // the storefront), every reply is also kept in metadata.replies.
  for (const [parentLegacy, replies] of replyBuckets) {
    const reviewId = reviewIdByLegacy.get(parentLegacy)
    if (!reviewId) continue
    const parent = await reviewSvc.retrieveAdvancedReview(reviewId)
    const adminReply = replies.find((x) => x.is_admin && x.status === "approved")
    await reviewSvc.updateAdvancedReviews({
      id: reviewId,
      owner_reply: adminReply ? str(adminReply.message) : parent.owner_reply ?? null,
      metadata: {
        ...(parent.metadata || {}),
        replies: replies.map((x) => ({
          legacy_id: Number(x.id),
          name: str(x.name),
          message: str(x.message),
          is_admin: !!x.is_admin,
          status: x.status,
          created_at: iso(x.created_at),
        })),
      },
    })
  }
  logger.info(`[mymobile]   reviews created=${reviewCount}`)

  // ═══════════════════════════════════════════════════════════ 7. blog ══
  logger.info("[mymobile] 7/10 blog authors, categories, tags, posts, comments…")
  const authorByLegacy = new Map<number, string>()
  for (const a of await q("SELECT * FROM admin_users ORDER BY id")) {
    const handle = str(a.slug) || str(a.username)!
    let [author] = await blogSvc.listBlogAuthors({ handle })
    if (!author) {
      author = await blogSvc.createBlogAuthors({
        name: str(a.display_name) || a.username,
        handle,
        role: str(a.job_title),
        bio: str(a.bio),
        avatar_url: legacyImageUrl(a.profile_pic),
        twitter_url: str(a.twitter_url),
        facebook_url: str(a.facebook_url),
        linkedin_url: str(a.linkedin_url),
        website_url: str(a.website_url),
      })
      await setDates("blog_author", author.id, a.created_at)
    }
    authorByLegacy.set(Number(a.id), author.id)
  }

  const blogCatByLegacy = new Map<number, { id: string; handle: string }>()
  for (const c of await q("SELECT * FROM categories ORDER BY sort_order, id")) {
    let [cat] = await blogSvc.listBlogCategories({ handle: c.slug })
    if (!cat) {
      cat = await blogSvc.createBlogCategories({
        name: c.name,
        handle: c.slug,
        description: rewriteHtml(c.description),
        seo_title: str(c.meta_title),
        seo_description: str(c.meta_description),
        metadata: { legacy_id: Number(c.id), image: legacyImageUrl(c.image), sort_order: num(c.sort_order) ?? 0 },
      })
    }
    blogCatByLegacy.set(Number(c.id), { id: cat.id, handle: cat.handle })
  }

  const tagByLegacy = new Map<number, string>()
  for (const t of await q("SELECT * FROM tags ORDER BY id")) {
    let [tag] = await blogSvc.listBlogTags({ handle: t.slug })
    if (!tag) {
      tag = await blogSvc.createBlogTags({
        name: t.name,
        handle: t.slug,
        description: rewriteHtml(t.description),
        seo_title: str(t.meta_title),
        seo_description: str(t.meta_description),
      })
    }
    tagByLegacy.set(Number(t.id), tag.id)
  }

  const postTags = new Map<number, number[]>()
  for (const pt of await q("SELECT * FROM post_tags")) {
    const list = postTags.get(Number(pt.post_id)) || []
    list.push(Number(pt.tag_id))
    postTags.set(Number(pt.post_id), list)
  }
  const postViews = new Map<number, number>()
  for (const v of await q(
    "SELECT post_id, SUM(views) v FROM post_views WHERE day >= CURDATE() - INTERVAL 30 DAY GROUP BY post_id"
  )) postViews.set(Number(v.post_id), Number(v.v))

  const postIdByLegacy = new Map<number, string>()
  for (const p of await q("SELECT * FROM posts ORDER BY id")) {
    let [post] = await blogSvc.listBlogPosts({ handle: p.slug })
    if (!post) {
      const catIds = [num(p.category_id), ...idList(p.additional_categories)]
        .map((id) => (id ? blogCatByLegacy.get(id)?.id : undefined))
        .filter(Boolean) as string[]
      const primary = p.category_id ? blogCatByLegacy.get(Number(p.category_id)) : undefined
      const postSeo = seo(primary ? `/blog/${primary.handle}/${p.slug}/` : `/blog/${p.slug}/`)
      post = await blogSvc.createBlogPosts({
        title: p.title,
        handle: p.slug,
        excerpt: str(p.excerpt),
        content: rewriteHtml(p.description),
        featured_image: legacyImageUrl(p.image),
        featured_image_alt: altFor(p.image) || str(p.image_caption) || p.title,
        status: p.status === "active" ? "published" : "draft",
        published_at: iso(p.posted_date),
        seo_title: postSeo.title || str(p.meta_title),
        seo_description: postSeo.description || str(p.meta_description),
        author_id: p.author_id ? authorByLegacy.get(Number(p.author_id)) ?? null : null,
        categories: [...new Set(catIds)],
        tags: (postTags.get(Number(p.id)) || []).map((t) => tagByLegacy.get(t)).filter(Boolean),
        metadata: {
          legacy_id: Number(p.id),
          // URL is /blog/{primary_category_handle}/{slug}/ when set
          primary_category_handle: primary?.handle ?? null,
          image_caption: str(p.image_caption),
          is_featured: !!p.is_featured,
          views: num(p.views) ?? 0,
          views_30d: postViews.get(Number(p.id)) ?? 0,
          related_manual: str(p.related_manual),
          related_off: !!p.related_off,
        },
      })
      await setDates("blog_post", post.id, p.posted_date, p.updated_at)
    }
    postIdByLegacy.set(Number(p.id), post.id)
  }

  const commentIdByLegacy = new Map<number, string>()
  const existingComments = new Set<number>(
    (await pg.raw(`select (metadata->>'legacy_id')::int as id from blog_comment where metadata ? 'legacy_id'`)).rows.map(
      (r: any) => r.id
    )
  )
  for (const c of await q("SELECT * FROM comments ORDER BY parent_id IS NOT NULL, id")) {
    if (existingComments.has(Number(c.id))) continue
    const postId = postIdByLegacy.get(Number(c.post_id))
    if (!postId) continue
    const rec = await blogSvc.createBlogComments({
      post_id: postId,
      parent_id: c.parent_id ? commentIdByLegacy.get(Number(c.parent_id)) ?? null : null,
      name: str(c.name) || "Guest",
      email: str(c.email),
      content: str(c.message) || "",
      is_admin: !!c.is_admin,
      status: c.status === "approved" ? "approved" : "pending",
      ip_address: str(c.ip_address),
      metadata: { legacy_id: Number(c.id) },
    })
    commentIdByLegacy.set(Number(c.id), rec.id)
    await setDates("blog_comment", rec.id, c.created_at)
  }

  // ══════════════════════════════════════════════════════ 8. CMS pages ══
  logger.info("[mymobile] 8/10 pages…")
  const upsertPage = async (data: Record<string, any>, created?: any, updated?: any) => {
    const [existing] = await blogSvc.listCmsPages({ handle: data.handle })
    if (existing) return
    const s = seo(`/${data.handle}/`)
    data.seo_title = s.title || data.seo_title || null
    data.seo_description = s.description || data.seo_description || null
    const rec = await blogSvc.createCmsPages(data)
    await setDates("cms_page", rec.id, created, updated)
  }
  for (const p of await q("SELECT * FROM pages WHERE status <> 'trash'")) {
    await upsertPage(
      {
        title: p.title,
        handle: p.slug,
        content: rewriteHtml(p.content),
        status: p.status === "publish" ? "published" : "draft",
        seo_title: str(p.meta_title),
        seo_description: str(p.meta_description),
        metadata: { legacy_id: Number(p.id) },
      },
      p.created_at,
      p.updated_at
    )
  }
  await upsertPage({
    title: str(settings.about_page_title) || "About Us",
    handle: str(settings.about_page_slug) || "about-us",
    subtitle: str(settings.about_page_subtitle),
    content: rewriteHtml(settings.about_page_content),
    status: "published",
    seo_title: str(settings.about_meta_title),
    seo_description: str(settings.about_meta_description),
    metadata: { kind: "about" },
  })
  await upsertPage({
    title: str(settings.contact_page_title) || "Contact Us",
    handle: str(settings.contact_page_slug) || "contact-us",
    subtitle: str(settings.contact_page_subtitle),
    content: rewriteHtml(settings.contact_page_content),
    status: "published",
    seo_title: str(settings.contact_meta_title),
    seo_description: str(settings.contact_meta_description),
    metadata: { kind: "contact" },
  })

  // ═══════════════════════════════════════════════════ 9. site settings ══
  logger.info("[mymobile] 9/10 site settings, menus, home sections…")
  const menu = async (table: string) =>
    (await hasTable(table)) ? await q(`SELECT id, label, url, parent_id, sort_order FROM ${table} ORDER BY sort_order, id`) : []
  const homeSections = (await hasTable("home_sections"))
    ? (await q("SELECT * FROM home_sections ORDER BY sort_order, id")).map((h) => ({
        ...h,
        brand_handle: h.brand_id ? brandByLegacy.get(Number(h.brand_id))?.handle ?? null : null,
        category_handle: null as string | null,
      }))
    : []
  // resolve category handles for home sections
  const catHandleByLegacy = new Map<number, string>()
  for (const c of await q("SELECT id, slug FROM device_categories")) catHandleByLegacy.set(Number(c.id), c.slug)
  for (const h of homeSections as any[]) {
    h.category_handle = h.category_id ? catHandleByLegacy.get(Number(h.category_id)) ?? null : null
  }

  const headCode = [str(settings.google_analytics), str(settings.search_console)].filter(Boolean).join("\n")
  const settingMap: Record<string, any> = {
    site_name: str(settings.site_name),
    site_tagline: str(settings.tagline),
    site_logo_url: legacyImageUrl(settings.site_logo),
    site_favicon_url: legacyImageUrl(settings.site_favicon),
    site_logo_width_desktop: str(settings.logo_width_desktop),
    site_logo_width_mobile: str(settings.logo_width_mobile),
    contact_email: str(settings.contact_email),
    contact_phone: str(settings.contact_phone),
    whatsapp_number: str(settings.contact_whatsapp),
    contact_address: [settings.business_address, settings.business_city, settings.business_state, settings.business_postal, settings.business_country]
      .map(str)
      .filter(Boolean)
      .join(", ") || null,
    social_facebook: str(settings.facebook_url),
    social_instagram: str(settings.instagram_url),
    social_tiktok: str(settings.tiktok_url),
    social_youtube: str(settings.youtube_url),
    social_twitter: str(settings.twitter_url),
    social_linkedin: str(settings.linkedin_url),
    // Exact rendered strings from the PHP site win over the raw settings.
    seo_home_title: seo("/").title || str(settings.homepage_title),
    seo_home_description:
      seo("/").description || str(settings.homepage_description) || str(settings.seo_description),
    seo_home_keywords: str(settings.seo_keywords),
    seo_default_og_image: legacyImageUrl(settings.homepage_featured_image),
    page_home_content: rewriteHtml(settings.homepage_content),
    page_home_content_title: str(settings.homepage_content_title),
    seo_brands_title: seo("/brands/").title || str(settings.brands_page_title),
    seo_brands_description: seo("/brands/").description || str(settings.brands_meta_description),
    seo_blog_title: seo("/blog/").title || null,
    seo_blog_description: seo("/blog/").description || null,
    seo_blog_heading: seo("/blog/").h1 || null,
    seo_store_title: str(settings.devices_page_title),
    seo_store_description: str(settings.devices_meta_description),
    seo_compare_title: seo("/compare/").title || str(settings.compare_meta_title),
    seo_compare_description: seo("/compare/").description || str(settings.compare_meta_description),
    // LocalBusiness JSON-LD profile (PHP emitted LocalBusiness site-wide).
    business_type: "electronics",
    business_country: str(settings.business_country) || "PK",
    business_locality: str(settings.business_city),
    business_region: str(settings.business_state),
    business_postal_code: str(settings.business_postal),
    business_opening_hours: str(settings.opening_hours),
    head_code: headCode || null,
    theme_primary: str(settings.theme_primary),
    theme_header_bg: str(settings.theme_header_bg),
    theme_browser_bar: str(settings.theme_browser_bar),
    price_disclaimer: str(settings.price_disclaimer),
    about_page_slug: str(settings.about_page_slug) || "about-us",
    contact_page_slug: str(settings.contact_page_slug) || "contact-us",
    business_geo: JSON.stringify({ lat: str(settings.geo_latitude), lng: str(settings.geo_longitude) }),
    google_maps_url: str(settings.google_maps_url),
    area_served: str(settings.area_served),
    banner_desktop_json: str(settings.banner_desktop),
    banner_mobile_json: str(settings.banner_mobile),
    footer_col1: str(settings.footer_col1),
    footer_col2: str(settings.footer_col2),
    footer_col3: str(settings.footer_col3),
    menu_main_json: JSON.stringify(await menu("menu_items")),
    menu_footer_json: JSON.stringify(await menu("footer_menu_items")),
    home_sections_json: JSON.stringify(homeSections),
    legacy_settings_json: JSON.stringify(settings),
  }
  for (const [key, value] of Object.entries(settingMap)) {
    if (value === null || value === undefined || value === "") continue
    const [existing] = await settingsSvc.listSiteSettings({ key })
    if (existing) await settingsSvc.updateSiteSettings({ id: existing.id, value: String(value) })
    else await settingsSvc.createSiteSettings({ key, value: String(value) })
  }

  // ═══════════════════════════════════════════════════ 10. contact leads ══
  logger.info("[mymobile] 10/10 contact queries…")
  const leadCount = Number((await pg.raw(`select count(*)::int c from contact_lead`)).rows[0].c)
  if (leadCount === 0) {
    for (const c of await q("SELECT * FROM contact_queries ORDER BY id")) {
      const rec = await leadsSvc.createContactLeads({
        name: str(c.name) || "—",
        email: str(c.email) || "—",
        subject: str(c.subject),
        message: str(c.message) || "",
        status: ["new", "read", "archived"].includes(c.status) ? c.status : "new",
      })
      await setDates("contact_lead", rec.id, c.created_at)
    }
  }

  await db.end()
  logger.info("────────────────────────────────────────────────────────────")
  logger.info(`[mymobile] DONE. Publishable key (put in frontend/.env NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY):`)
  logger.info(`[mymobile]   ${publishableKey.token}`)
  logger.info(`[mymobile] Sales channel: ${salesChannel.id}   Region: ${region.id}`)
}
