import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Banner text position + theme.
 *
 * The originally generated version of this migration was produced against a
 * whole-database snapshot and its up() DROPPED every core Medusa table
 * (api_key, product, order, tax_region …). On an existing database that was
 * harmless only because it had already been applied; on a FRESH database it
 * wiped the schema right after creating it. Reduced to the banner-only
 * statements it was meant to contain.
 */
export class Migration20260422161232 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`drop index if exists "IDX_banner_is_active";`);
    this.addSql(`drop index if exists "IDX_banner_sort_order";`);
    this.addSql(`alter table if exists "banner" add column if not exists "text_position" text not null default 'bottom-left', add column if not exists "theme" text not null default 'dark';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "banner" drop column if exists "text_position", drop column if exists "theme";`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_banner_is_active" ON "banner" (is_active) WHERE (deleted_at IS NULL);`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_banner_sort_order" ON "banner" (sort_order) WHERE (deleted_at IS NULL);`);
  }

}
