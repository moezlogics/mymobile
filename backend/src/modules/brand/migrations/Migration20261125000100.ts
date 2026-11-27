import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/** brand.metadata — founded / country / is_featured / legacy_id (mymobile.pk import). */
export class Migration20261125000100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "brand" add column if not exists "metadata" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "brand" drop column if exists "metadata";`);
  }
}
