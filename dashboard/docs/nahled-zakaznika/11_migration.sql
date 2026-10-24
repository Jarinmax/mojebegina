-- NÁHLED ZÁKAZNICKÉ KARTY: oprávnění + trvalý audit (= drizzle
-- 0025_customer_card_preview). Návrh 19. 10. 2026; spuštění NESCHVÁLENO.
-- Kontrola před: 10_before.sql, po: 12_after.sql, návrat: 19_rollback.sql.
--   user_permissions           úzká oprávnění konkrétních user_id (udělit/odebrat)
--   customer_card_preview_log  kdo, kdy a kterou organizaci otevřel v náhledu
-- Nic existujícího se nemění. Sám o sobě nikomu nic nepovolí — udělení je
-- samostatný krok (20_udelit.sql). Jedna transakce: pojistka nebo chyba →
-- nic se nezmění.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name IN ('user_permissions', 'customer_card_preview_log')) THEN
    RAISE EXCEPTION 'Tabulka user_permissions nebo customer_card_preview_log už existuje (skript už běžel?) — zastavuji.';
  END IF;

  CREATE TABLE "customer_card_preview_log" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"viewer_user_id" text NOT NULL,
  	"organization_id" uuid NOT NULL,
  	"opened_at" timestamp with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "user_permissions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"user_id" text NOT NULL,
  	"permission" text NOT NULL,
  	"granted_by_user_id" text NOT NULL,
  	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"reason" text,
  	"revoked_at" timestamp with time zone,
  	"revoked_by_user_id" text,
  	CONSTRAINT "user_permissions_permission_check" CHECK ("user_permissions"."permission" IN ('customer_card_preview')),
  	CONSTRAINT "user_permissions_revoked_by" CHECK (("user_permissions"."revoked_at" IS NULL) = ("user_permissions"."revoked_by_user_id" IS NULL))
  );

  ALTER TABLE "customer_card_preview_log" ADD CONSTRAINT "customer_card_preview_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;

  CREATE INDEX "customer_card_preview_log_org_idx" ON "customer_card_preview_log" USING btree ("organization_id","opened_at");

  CREATE INDEX "customer_card_preview_log_viewer_idx" ON "customer_card_preview_log" USING btree ("viewer_user_id","opened_at");

  CREATE UNIQUE INDEX "user_permissions_one_active" ON "user_permissions" USING btree ("user_id","permission") WHERE "user_permissions"."revoked_at" IS NULL;
END $$;
