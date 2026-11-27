import { model } from "@medusajs/framework/utils"

/**
 * CMS page — editable static pages served at /{handle}/
 * (privacy-policy, terms-conditions, disclaimer, about-us, contact-us …).
 * Imported from mymobile.pk `pages` + the about/contact content in `settings`.
 */
export const CmsPage: any = model.define("cms_page", {
  id: model.id({ prefix: "cpage" }).primaryKey(),
  title: model.text().searchable(),
  handle: model.text().unique(),
  subtitle: model.text().nullable(),
  content: model.text().nullable(),
  status: model.enum(["draft", "published"]).default("published"),
  seo_title: model.text().nullable(),
  seo_description: model.text().nullable(),
  metadata: model.json().nullable(),
})
