import { model } from "@medusajs/framework/utils"

/**
 * Blog comment — guest comments with one level of threaded replies
 * (`parent_id`). Imported from mymobile.pk `comments`.
 */
export const BlogComment: any = model.define("blog_comment", {
  id: model.id({ prefix: "bcmt" }).primaryKey(),
  post_id: model.text(),
  parent_id: model.text().nullable(),
  name: model.text(),
  email: model.text().nullable(),
  content: model.text(),
  is_admin: model.boolean().default(false),
  status: model.enum(["pending", "approved", "spam"]).default("pending"),
  ip_address: model.text().nullable(),
  metadata: model.json().nullable(),
})
