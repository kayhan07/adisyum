ALTER TABLE "product_categories"
  ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "visible_in_pos" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "visible_in_inventory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "visible_in_production" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "branch_visibility" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "product_categories_tenant_id_active_idx" ON "product_categories"("tenant_id", "active");
CREATE INDEX IF NOT EXISTS "product_categories_tenant_id_deleted_at_idx" ON "product_categories"("tenant_id", "deleted_at");
