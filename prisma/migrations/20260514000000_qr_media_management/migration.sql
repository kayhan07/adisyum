-- Migration: QR Menu Media Management
-- Adds image columns to products & product_categories, creates media_assets table

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_url        VARCHAR(500),
  ADD COLUMN IF NOT EXISTS thumbnail_url    VARCHAR(500),
  ADD COLUMN IF NOT EXISTS description      VARCHAR(600);

ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS image_url        VARCHAR(500),
  ADD COLUMN IF NOT EXISTS thumbnail_url    VARCHAR(500);

CREATE TABLE IF NOT EXISTS media_assets (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             VARCHAR(64)  NOT NULL,
  entity_type           VARCHAR(40)  NOT NULL,
  entity_id             VARCHAR(64)  NOT NULL DEFAULT '',
  url                   VARCHAR(500) NOT NULL,
  thumbnail_url         VARCHAR(500),
  webp_url              VARCHAR(500),
  mime_type             VARCHAR(80)  NOT NULL,
  original_name         VARCHAR(255) NOT NULL,
  size_bytes            INTEGER      NOT NULL,
  width                 INTEGER,
  height                INTEGER,
  thumb_width           INTEGER,
  thumb_height          INTEGER,
  optimized_size_bytes  INTEGER,
  sort_order            INTEGER      NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS media_assets_tenant_idx         ON media_assets (tenant_id);
CREATE INDEX IF NOT EXISTS media_assets_entity_idx         ON media_assets (tenant_id, entity_type, entity_id);
