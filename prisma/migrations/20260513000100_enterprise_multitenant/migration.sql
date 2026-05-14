-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended', 'expired', 'trial', 'demo', 'blocked');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('open', 'preparing', 'ready', 'served', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'voided', 'refunded');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('pending', 'applied', 'conflicted', 'failed');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "package_type" VARCHAR(32) NOT NULL DEFAULT 'mini',
    "status" "TenantStatus" NOT NULL DEFAULT 'trial',
    "main_branch_id" VARCHAR(64),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "package_type" VARCHAR(32) NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'trial',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "username" VARCHAR(120) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" VARCHAR(64) NOT NULL,
    "branch_id" VARCHAR(64),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "key" VARCHAR(140) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_groups" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tables" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "group_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'available',
    "seats" INTEGER NOT NULL DEFAULT 0,
    "position" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "category_id" UUID,
    "name" VARCHAR(180) NOT NULL,
    "sku" VARCHAR(80),
    "barcode" VARCHAR(80),
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vat_rate" INTEGER NOT NULL DEFAULT 10,
    "unit_type" VARCHAR(32) NOT NULL DEFAULT 'adet',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "product_id" UUID NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "table_id" UUID,
    "customer_id" UUID,
    "order_no" VARCHAR(80) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'open',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID,
    "name" VARCHAR(180) NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "order_id" UUID,
    "method" VARCHAR(32) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "phone" VARCHAR(40),
    "email" VARCHAR(180),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "phone" VARCHAR(40),
    "email" VARCHAR(180),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "type" VARCHAR(32) NOT NULL DEFAULT 'main',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_items" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "unit" VARCHAR(32) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "min_level" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "stock_item_id" UUID,
    "warehouse_id" UUID,
    "type" VARCHAR(40) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transactions" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "cash_register_id" UUID,
    "type" VARCHAR(40) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printers" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "group_id" UUID,
    "name" VARCHAR(140) NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "endpoint" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printer_groups" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "product_id" UUID,
    "source_template_id" UUID,
    "name" VARCHAR(180) NOT NULL,
    "yield_quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unit" VARCHAR(32) NOT NULL DEFAULT 'adet',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_items" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "recipe_id" UUID NOT NULL,
    "stock_item_id" UUID,
    "name" VARCHAR(180) NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "category" VARCHAR(120),
    "yield_quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unit" VARCHAR(32) NOT NULL DEFAULT 'adet',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_template_items" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "category" VARCHAR(120) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "user_id" UUID,
    "status" VARCHAR(32) NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64),
    "user_id" VARCHAR(80),
    "action" VARCHAR(120) NOT NULL,
    "entity" VARCHAR(120),
    "entity_id" VARCHAR(80),
    "ip" VARCHAR(80),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_queue" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "device_id" VARCHAR(120),
    "event_type" VARCHAR(120) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_events" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "device_id" VARCHAR(120),
    "event_id" VARCHAR(160) NOT NULL,
    "event_type" VARCHAR(120) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runtime_states" (
    "id" UUID NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "payload" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runtime_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_tenant_id_key" ON "tenants"("tenant_id");

-- CreateIndex
CREATE INDEX "tenants_tenant_id_idx" ON "tenants"("tenant_id");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE INDEX "subscriptions_tenant_id_idx" ON "subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "subscriptions_tenant_id_status_idx" ON "subscriptions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_tenant_id_ends_at_idx" ON "subscriptions"("tenant_id", "ends_at");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "users_tenant_id_active_idx" ON "users"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_username_key" ON "users"("tenant_id", "username");

-- CreateIndex
CREATE INDEX "roles_tenant_id_idx" ON "roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_name_key" ON "roles"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "permissions_tenant_id_idx" ON "permissions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_tenant_id_key_key" ON "permissions"("tenant_id", "key");

-- CreateIndex
CREATE INDEX "table_groups_tenant_id_idx" ON "table_groups"("tenant_id");

-- CreateIndex
CREATE INDEX "tables_tenant_id_idx" ON "tables"("tenant_id");

-- CreateIndex
CREATE INDEX "tables_tenant_id_status_idx" ON "tables"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "product_categories_tenant_id_idx" ON "product_categories"("tenant_id");

-- CreateIndex
CREATE INDEX "products_tenant_id_idx" ON "products"("tenant_id");

-- CreateIndex
CREATE INDEX "products_tenant_id_created_at_idx" ON "products"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "products_tenant_id_active_idx" ON "products"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "product_variants_tenant_id_idx" ON "product_variants"("tenant_id");

-- CreateIndex
CREATE INDEX "product_variants_tenant_id_product_id_idx" ON "product_variants"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "orders_tenant_id_idx" ON "orders"("tenant_id");

-- CreateIndex
CREATE INDEX "orders_tenant_id_created_at_idx" ON "orders"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_tenant_id_status_idx" ON "orders"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenant_id_order_no_key" ON "orders"("tenant_id", "order_no");

-- CreateIndex
CREATE INDEX "order_items_tenant_id_idx" ON "order_items"("tenant_id");

-- CreateIndex
CREATE INDEX "order_items_tenant_id_order_id_idx" ON "order_items"("tenant_id", "order_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_idx" ON "payments"("tenant_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_created_at_idx" ON "payments"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_tenant_id_status_idx" ON "payments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "customers_tenant_id_idx" ON "customers"("tenant_id");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_idx" ON "suppliers"("tenant_id");

-- CreateIndex
CREATE INDEX "warehouses_tenant_id_idx" ON "warehouses"("tenant_id");

-- CreateIndex
CREATE INDEX "stock_items_tenant_id_idx" ON "stock_items"("tenant_id");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_idx" ON "stock_movements"("tenant_id");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_created_at_idx" ON "stock_movements"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "cash_registers_tenant_id_idx" ON "cash_registers"("tenant_id");

-- CreateIndex
CREATE INDEX "cash_transactions_tenant_id_idx" ON "cash_transactions"("tenant_id");

-- CreateIndex
CREATE INDEX "cash_transactions_tenant_id_created_at_idx" ON "cash_transactions"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "printers_tenant_id_idx" ON "printers"("tenant_id");

-- CreateIndex
CREATE INDEX "printer_groups_tenant_id_idx" ON "printer_groups"("tenant_id");

-- CreateIndex
CREATE INDEX "recipes_tenant_id_idx" ON "recipes"("tenant_id");

-- CreateIndex
CREATE INDEX "recipes_tenant_id_product_id_idx" ON "recipes"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "recipe_items_tenant_id_idx" ON "recipe_items"("tenant_id");

-- CreateIndex
CREATE INDEX "recipe_items_tenant_id_recipe_id_idx" ON "recipe_items"("tenant_id", "recipe_id");

-- CreateIndex
CREATE INDEX "recipe_templates_category_idx" ON "recipe_templates"("category");

-- CreateIndex
CREATE INDEX "recipe_template_items_template_id_idx" ON "recipe_template_items"("template_id");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_idx" ON "expenses"("tenant_id");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_created_at_idx" ON "expenses"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "shifts_tenant_id_idx" ON "shifts"("tenant_id");

-- CreateIndex
CREATE INDEX "shifts_tenant_id_status_idx" ON "shifts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "reports_tenant_id_idx" ON "reports"("tenant_id");

-- CreateIndex
CREATE INDEX "reports_tenant_id_created_at_idx" ON "reports"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "sync_queue_tenant_id_idx" ON "sync_queue"("tenant_id");

-- CreateIndex
CREATE INDEX "sync_queue_tenant_id_status_idx" ON "sync_queue"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "sync_queue_tenant_id_created_at_idx" ON "sync_queue"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "offline_events_tenant_id_idx" ON "offline_events"("tenant_id");

-- CreateIndex
CREATE INDEX "offline_events_tenant_id_status_idx" ON "offline_events"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "offline_events_tenant_id_event_id_key" ON "offline_events"("tenant_id", "event_id");

-- CreateIndex
CREATE INDEX "runtime_states_tenant_id_idx" ON "runtime_states"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "runtime_states_tenant_id_key_key" ON "runtime_states"("tenant_id", "key");
