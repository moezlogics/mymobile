import { model } from "@medusajs/framework/utils"
import { BlogCategory } from "./category"
import { BlogAuthor } from "./author"
import { BlogTag } from "./tag"

export const BlogPost: any = model.define("blog_post", {
  id: model.id({ prefix: "bpost" }).primaryKey(),
  title: model.text().searchable(),
  handle: model.text().unique(),
  excerpt: model.text().nullable(),
  content: model.text().nullable(), // rich HTML (from TipTap)
  featured_image: model.text().nullable(),
  featured_image_alt: model.text().nullable(),
  status: model.enum(["draft", "published"]).default("draft"),
  published_at: model.dateTime().nullable(),
  // SEO
  seo_title: model.text().nullable(),
  seo_description: model.text().nullable(),
  seo_keywords: model.text().nullable(),
  // Relations
  categories: model.manyToMany(() => BlogCategory, {
    pivotTable: "blog_post_categories",
  }),
  // Nullable so posts authored before this feature (author_id NULL) keep
  // rendering — the storefront falls back to the organization byline.
  // Legacy/extra fields (mymobile.pk import: legacy_id, primary_category_handle,
  // image_caption, views, related_manual …). Nullable so old rows keep working.
  metadata: model.json().nullable(),
  tags: model.manyToMany(() => BlogTag, {
    pivotTable: "blog_post_tags",
  }),
  author: model
    .belongsTo(() => BlogAuthor, {
      mappedBy: "posts",
    })
    .nullable(),
})
