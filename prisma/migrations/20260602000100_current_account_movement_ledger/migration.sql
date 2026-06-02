CREATE TABLE IF NOT EXISTS "current_account_movements" (
  "id" UUID NOT NULL,
  "tenant_id" VARCHAR(64) NOT NULL,
  "account_id" VARCHAR(160) NOT NULL,
  "customer_id" UUID,
  "order_id" UUID,
  "payment_id" UUID,
  "reconciliation_key" VARCHAR(220) NOT NULL,
  "type" VARCHAR(32) NOT NULL,
  "method" VARCHAR(32) NOT NULL,
  "debit" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "balance_after" DECIMAL(12, 2),
  "description" TEXT,
  "created_by" VARCHAR(160),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "current_account_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "current_account_movements_tenant_id_reconciliation_key_key"
  ON "current_account_movements"("tenant_id", "reconciliation_key");
CREATE INDEX IF NOT EXISTS "current_account_movements_tenant_id_idx"
  ON "current_account_movements"("tenant_id");
CREATE INDEX IF NOT EXISTS "current_account_movements_tenant_id_account_id_idx"
  ON "current_account_movements"("tenant_id", "account_id");
CREATE INDEX IF NOT EXISTS "current_account_movements_tenant_id_created_at_idx"
  ON "current_account_movements"("tenant_id", "created_at");
