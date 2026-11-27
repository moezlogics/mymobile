import { model } from "@medusajs/framework/utils"

/**
 * Blog tag — archive at /blog/tag/{handle}/ (legacy /tag/{handle}/ also
 * resolves). Imported from mymobile.pk `tags` + `post_tags`.
 */
export const BlogTag: any = model.define("blog_tag", {
  id: model.id({ prefix: "btag" }).primaryKey(),
  name: model.text().searchable(),
  handle: model.text().unique(),
  description: model.text().nullable(),
  seo_title: model.text().nullable(),
  seo_description: model.text().nullable(),
  posts: model.manyToMany(() => require("./post").BlogPost, {
    mappedBy: "tags",
  }),
})
