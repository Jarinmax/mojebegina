-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Krok 1 (drizzle 0011): produktové tabulky. Čistě přidává, nic existujícího nemění.

CREATE TABLE product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CONSTRAINT product_categories_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL,
  intro text[] NOT NULL DEFAULT '{}',
  detail_sections jsonb,
  image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES product_categories(id) ON DELETE RESTRICT,
  slug text NOT NULL UNIQUE CONSTRAINT products_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL,
  short_description text,
  description text[] NOT NULL DEFAULT '{}',
  highlights text[] NOT NULL DEFAULT '{}',
  taste_description text,
  ingredients text,
  -- NULL = zatím neznámé ("Doplníme"), '{}' = bez alergenů. Kódy = příloha II nařízení 1169/2011.
  allergens text[] CONSTRAINT products_allergens_known CHECK (allergens <@ ARRAY[
    'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk',
    'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'
  ]::text[]),
  allergen_note text,
  -- {energy_kj, energy_kcal, fat, saturates, carbohydrate, sugars, protein, salt}
  nutrition jsonb,
  nutrition_basis text CONSTRAINT products_nutrition_basis_check CHECK (nutrition_basis IN ('100g', '100ml')),
  storage_instructions text,
  shelf_life_days integer CONSTRAINT products_shelf_life_positive CHECK (shelf_life_days > 0),
  shelf_life_note text,
  alcohol_percent numeric(4,1) CONSTRAINT products_alcohol_range CHECK (alcohol_percent BETWEEN 0 AND 100),
  is_age_restricted boolean NOT NULL DEFAULT false,
  warnings text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Nad 0,5 % obj. je nápoj alkoholický → musí být 18+.
  CONSTRAINT products_alcohol_requires_age_restriction
    CHECK (alcohol_percent IS NULL OR alcohol_percent <= 0.5 OR is_age_restricted)
);
CREATE INDEX products_category_idx ON products (category_id, sort_order);

CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sku text NOT NULL UNIQUE CONSTRAINT product_variants_sku_format CHECK (sku ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label text,
  short_note text,
  package_description text,
  volume_ml integer CONSTRAINT product_variants_volume_positive CHECK (volume_ml > 0),
  servings integer CONSTRAINT product_variants_servings_positive CHECK (servings > 0),
  price_b2c_kc integer NOT NULL CONSTRAINT product_variants_price_nonnegative CHECK (price_b2c_kc >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_variants_product_idx ON product_variants (product_id, sort_order);

CREATE TABLE product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  url text NOT NULL,
  alt text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_images_product_idx ON product_images (product_id, sort_order);
