import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * mymobile.pk import support:
 *   • blog_post.metadata          (legacy_id, primary category, caption, views …)
 *   • blog_category seo + metadata
 *   • blog_tag + blog_post_tags   (tag archives /blog/tag/{handle}/)
 *   • blog_comment                (guest comments + replies)
 *   • cms_page                    (privacy-policy, terms, about-us … at /{handle}/)
 *
 * Hand-written and fully guarded so `medusa db:migrate` can re-run it safely.
 */
export class Migration20261125000000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "blog_post" add column if not exists "metadata" jsonb null;`);

    this.addSql(`alter table if exists "blog_category" add column if not exists "seo_title" text null;`);
    this.addSql(`alter table if exists "blog_category" add column if not exists "seo_description" text null;`);
    this.addSql(`alter table if exists "blog_category" add column if not exists "metadata" jsonb null;`);

    this.addSql(`create table if not exists "blog_tag" ("id" text not null, "name" text not null, "handle" text not null, "description" text null, "seo_title" text null, "seo_description" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "blog_tag_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_blog_tag_handle_unique" ON "blog_tag" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_blog_tag_deleted_at" ON "blog_tag" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "blog_post_tags" ("blog_post_id" text not null, "blog_tag_id" text not null, constraint "blog_post_tags_pkey" primary key ("blog_post_id", "blog_tag_id"));`);
    this.addSql(`alter table if exists "blog_post_tags" drop constraint if exists "blog_post_tags_blog_post_id_foreign";`);
    this.addSql(`alter table if exists "blog_post_tags" add constraint "blog_post_tags_blog_post_id_foreign" foreign key ("blog_post_id") references "blog_post" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table if exists "blog_post_tags" drop constraint if exists "blog_post_tags_blog_tag_id_foreign";`);
    this.addSql(`alter table if exists "blog_post_tags" add constraint "blog_post_tags_blog_tag_id_foreign" foreign key ("blog_tag_id") references "blog_tag" ("id") on update cascade on delete cascade;`);

    this.addSql(`create table if not exists "blog_comment" ("id" text not null, "post_id" text not null, "parent_id" text null, "name" text not null, "email" text null, "content" text not null, "is_admin" boolean not null default false, "status" text check ("status" in ('pending', 'approved', 'spam')) not null default 'pending', "ip_address" text null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "blog_comment_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_blog_comment_post_id" ON "blog_comment" ("post_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_blog_comment_deleted_at" ON "blog_comment" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "cms_page" ("id" text not null, "title" text not null, "handle" text not null, "subtitle" text null, "content" text null, "status" text check ("status" in ('draft', 'published')) not null default 'published', "seo_title" text null, "seo_description" text null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cms_page_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cms_page_handle_unique" ON "cms_page" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cms_page_deleted_at" ON "cms_page" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "cms_page" cascade;`);
    this.addSql(`drop table if exists "blog_comment" cascade;`);
    this.addSql(`drop table if exists "blog_post_tags" cascade;`);
    this.addSql(`drop table if exists "blog_tag" cascade;`);
    this.addSql(`alter table if exists "blog_category" drop column if exists "metadata";`);
    this.addSql(`alter table if exists "blog_category" drop column if exists "seo_description";`);
    this.addSql(`alter table if exists "blog_category" drop column if exists "seo_title";`);
    this.addSql(`alter table if exists "blog_post" drop column if exists "metadata";`);
  }
}
