-- PŘIPRAVENO, NENASAZENO — Jarda – volání a provize, část 2.
-- Nespouštět na Preview ani Production bez výslovného schválení.
-- acquired_at/acquisition_bonus_paid_at jsou nové sloupce typu
-- timestamptz, NULL u všech existujících řádků (nedá se spolehlivě
-- dopočítat zpětně, kdy byl zákazník skutečně získán — viz finální
-- zpráva). organization_owner_history je nová append-only tabulka; jak se
-- backfilluje pro existující zákazníky, viz komentář u INSERT na konci
-- tohoto souboru.
CREATE TABLE "organization_owner_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "acquired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "acquisition_bonus_paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "acquisition_bonus_paid_by_user_id" text;--> statement-breakpoint
ALTER TABLE "organization_owner_history" ADD CONSTRAINT "organization_owner_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_owner_history_one_open_period" ON "organization_owner_history" USING btree ("organization_id") WHERE "organization_owner_history"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "organization_owner_history_org_idx" ON "organization_owner_history" USING btree ("organization_id","started_at");--> statement-breakpoint

-- Backfill: pro každého existujícího zákazníka s přiřazeným obchodníkem
-- založí JEDNO otevřené období se started_at = OKAMŽIK NASAZENÍ TÉTO
-- MIGRACE (now() v okamžiku spuštění, ne domyšlené dřívější datum —
-- nevíme a nehádáme, odkdy je dnešní vlastník skutečně vlastníkem).
-- Důsledek: 3% provize se u zákazníků, kteří existovali už před nasazením
-- a od nasazení ještě nebyli přeřazeni, počítá teprve z objednávek PO
-- nasazení, ne zpětně — vědomá volba, aby se nikdy nedomýšlelo, zda a
-- odkdy u nich v minulosti k předání došlo.
INSERT INTO "organization_owner_history" ("organization_id", "owner_user_id", "started_at")
SELECT "id", "owner_user_id", now() FROM "organizations" WHERE "owner_user_id" IS NOT NULL;