CREATE TABLE "goods_receipt_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"actor_type" text DEFAULT 'user' NOT NULL,
	"author_user_id" text,
	"author_name" text,
	"kind" text NOT NULL,
	"body" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goods_receipt_activity_actor_type_check" CHECK ("goods_receipt_activity"."actor_type" IN ('user','system')),
	CONSTRAINT "goods_receipt_activity_user_has_author" CHECK ("goods_receipt_activity"."actor_type" <> 'user' OR "goods_receipt_activity"."author_user_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_document_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"mime_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goods_receipt_document_pages_page_number_positive" CHECK ("goods_receipt_document_pages"."page_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goods_receipt_documents_kind_check" CHECK ("goods_receipt_documents"."kind" IN ('invoice','receipt','delivery_note','invoice_delivery_note'))
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"raw_description" text NOT NULL,
	"supplier_item_code" text,
	"supplier_auxiliary_code" text,
	"raw_package_quantity" numeric(14, 6) NOT NULL,
	"raw_units_per_package" numeric(14, 6) NOT NULL,
	"raw_unit" text NOT NULL,
	"normalized_quantity" numeric(14, 6) NOT NULL,
	"normalized_unit" text NOT NULL,
	"unit_price_without_vat" numeric(14, 6) NOT NULL,
	"total_without_vat_hal" bigint NOT NULL,
	"vat_hal" bigint NOT NULL,
	"total_with_vat_hal" bigint NOT NULL,
	"computed_vat_rate_percent" numeric(6, 3) NOT NULL,
	"vat_confirmed" boolean DEFAULT false NOT NULL,
	"stock_item_id" uuid,
	"line_kind" text NOT NULL,
	"mapping_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goods_receipt_lines_line_kind_check" CHECK ("goods_receipt_lines"."line_kind" IN ('stock_material','resale_goods','operating_supply','non_stock_private')),
	CONSTRAINT "goods_receipt_lines_mapping_source_check" CHECK ("goods_receipt_lines"."mapping_source" IS NULL OR "goods_receipt_lines"."mapping_source" IN ('auto','manual')),
	CONSTRAINT "goods_receipt_lines_total_consistent" CHECK ("goods_receipt_lines"."total_with_vat_hal" = "goods_receipt_lines"."total_without_vat_hal" + "goods_receipt_lines"."vat_hal"),
	CONSTRAINT "goods_receipt_lines_amounts_nonnegative" CHECK ("goods_receipt_lines"."total_without_vat_hal" >= 0 AND "goods_receipt_lines"."vat_hal" >= 0),
	CONSTRAINT "goods_receipt_lines_quantities_positive" CHECK ("goods_receipt_lines"."raw_package_quantity" > 0 AND "goods_receipt_lines"."raw_units_per_package" > 0 AND "goods_receipt_lines"."normalized_quantity" > 0),
	CONSTRAINT "goods_receipt_lines_non_stock_has_no_item" CHECK ("goods_receipt_lines"."line_kind" <> 'non_stock_private' OR "goods_receipt_lines"."stock_item_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "goods_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_name_snapshot" text NOT NULL,
	"stock_location_id" uuid NOT NULL,
	"document_number" text,
	"document_date" date,
	"due_date" date,
	"payment_method" text,
	"total_without_vat_hal" bigint,
	"total_vat_hal" bigint,
	"total_with_vat_hal" bigint,
	"status" text DEFAULT 'draft' NOT NULL,
	"extraction_status" text DEFAULT 'not_applicable' NOT NULL,
	"extraction_raw" jsonb,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by_user_id" text,
	"confirmed_at" timestamp with time zone,
	"voided_by_user_id" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goods_receipts_status_check" CHECK ("goods_receipts"."status" IN ('draft','confirmed','voided')),
	CONSTRAINT "goods_receipts_extraction_status_check" CHECK ("goods_receipts"."extraction_status" IN ('not_applicable','pending','succeeded','failed','needs_review')),
	CONSTRAINT "goods_receipts_confirmed_pair_check" CHECK (("goods_receipts"."confirmed_by_user_id" IS NULL) = ("goods_receipts"."confirmed_at" IS NULL)),
	CONSTRAINT "goods_receipts_voided_pair_check" CHECK (("goods_receipts"."voided_by_user_id" IS NULL) = ("goods_receipts"."voided_at" IS NULL)),
	CONSTRAINT "goods_receipts_voided_has_reason" CHECK ("goods_receipts"."voided_at" IS NULL OR "goods_receipts"."void_reason" IS NOT NULL),
	CONSTRAINT "goods_receipts_confirmed_status_check" CHECK ("goods_receipts"."status" <> 'confirmed' OR "goods_receipts"."confirmed_at" IS NOT NULL),
	CONSTRAINT "goods_receipts_voided_status_check" CHECK (("goods_receipts"."status" = 'voided') = ("goods_receipts"."voided_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "stock_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"canonical_unit" text NOT NULL,
	"kind" text NOT NULL,
	"linked_product_variant_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_items_kind_check" CHECK ("stock_items"."kind" IN ('ingredient','resale_goods','operating_supply')),
	CONSTRAINT "stock_items_canonical_unit_format" CHECK ("stock_items"."canonical_unit" ~ '^[a-z][a-z0-9_]*$')
);
--> statement-breakpoint
CREATE TABLE "stock_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_locations_code_format" CHECK ("stock_locations"."code" ~ '^[a-z][a-z0-9_]*$')
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_item_id" uuid NOT NULL,
	"stock_location_id" uuid NOT NULL,
	"receipt_id" uuid,
	"receipt_line_id" uuid,
	"direction" text NOT NULL,
	"quantity" numeric(14, 6) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_user_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"corrects_movement_id" uuid,
	"reason" text,
	CONSTRAINT "stock_movements_direction_check" CHECK ("stock_movements"."direction" IN ('in','out')),
	CONSTRAINT "stock_movements_quantity_positive" CHECK ("stock_movements"."quantity" > 0),
	CONSTRAINT "stock_movements_correction_has_reason" CHECK ("stock_movements"."corrects_movement_id" IS NULL OR "stock_movements"."reason" IS NOT NULL),
	CONSTRAINT "stock_movements_not_self_corrected" CHECK ("stock_movements"."corrects_movement_id" IS DISTINCT FROM "stock_movements"."id")
);
--> statement-breakpoint
CREATE TABLE "supplier_item_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_item_code" text,
	"description_normalized" text,
	"stock_item_id" uuid NOT NULL,
	"units_per_package" numeric(14, 6) NOT NULL,
	"package_unit_label" text,
	"line_kind" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_item_mappings_line_kind_check" CHECK ("supplier_item_mappings"."line_kind" IN ('stock_material','resale_goods','operating_supply','non_stock_private')),
	CONSTRAINT "supplier_item_mappings_units_positive" CHECK ("supplier_item_mappings"."units_per_package" > 0),
	CONSTRAINT "supplier_item_mappings_has_key" CHECK ("supplier_item_mappings"."supplier_item_code" IS NOT NULL OR "supplier_item_mappings"."description_normalized" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"ico" text,
	"dic" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_ico_format" CHECK ("suppliers"."ico" IS NULL OR "suppliers"."ico" ~ '^[0-9]{8}$')
);
--> statement-breakpoint
ALTER TABLE "goods_receipt_activity" ADD CONSTRAINT "goods_receipt_activity_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_document_pages" ADD CONSTRAINT "goods_receipt_document_pages_document_id_goods_receipt_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."goods_receipt_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_documents" ADD CONSTRAINT "goods_receipt_documents_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_stock_location_id_stock_locations_id_fk" FOREIGN KEY ("stock_location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_linked_product_variant_id_product_variants_id_fk" FOREIGN KEY ("linked_product_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_location_id_stock_locations_id_fk" FOREIGN KEY ("stock_location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_receipt_line_id_goods_receipt_lines_id_fk" FOREIGN KEY ("receipt_line_id") REFERENCES "public"."goods_receipt_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_corrects_movement_id_stock_movements_id_fk" FOREIGN KEY ("corrects_movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_item_mappings" ADD CONSTRAINT "supplier_item_mappings_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_item_mappings" ADD CONSTRAINT "supplier_item_mappings_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goods_receipt_activity_receipt_idx" ON "goods_receipt_activity" USING btree ("receipt_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "goods_receipt_document_pages_order_key" ON "goods_receipt_document_pages" USING btree ("document_id","page_number");--> statement-breakpoint
CREATE INDEX "goods_receipt_document_pages_sha256_idx" ON "goods_receipt_document_pages" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "goods_receipt_documents_receipt_idx" ON "goods_receipt_documents" USING btree ("receipt_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "goods_receipt_lines_position_key" ON "goods_receipt_lines" USING btree ("receipt_id","position");--> statement-breakpoint
CREATE INDEX "goods_receipt_lines_stock_item_idx" ON "goods_receipt_lines" USING btree ("stock_item_id");--> statement-breakpoint
CREATE INDEX "goods_receipts_supplier_document_idx" ON "goods_receipts" USING btree ("supplier_id","document_number");--> statement-breakpoint
CREATE UNIQUE INDEX "goods_receipts_confirmed_document_once_key" ON "goods_receipts" USING btree ("supplier_id","document_number") WHERE "goods_receipts"."status" = 'confirmed' AND "goods_receipts"."document_number" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_locations_code_key" ON "stock_locations" USING btree ("code");--> statement-breakpoint
CREATE INDEX "stock_movements_item_location_idx" ON "stock_movements" USING btree ("stock_item_id","stock_location_id");--> statement-breakpoint
CREATE INDEX "stock_movements_receipt_idx" ON "stock_movements" USING btree ("receipt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movements_corrects_once_key" ON "stock_movements" USING btree ("corrects_movement_id") WHERE "stock_movements"."corrects_movement_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_item_mappings_by_code_key" ON "supplier_item_mappings" USING btree ("supplier_id","supplier_item_code") WHERE "supplier_item_mappings"."supplier_item_code" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_item_mappings_by_description_key" ON "supplier_item_mappings" USING btree ("supplier_id","description_normalized") WHERE "supplier_item_mappings"."supplier_item_code" IS NULL AND "supplier_item_mappings"."description_normalized" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_ico_key" ON "suppliers" USING btree ("ico") WHERE "suppliers"."ico" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_name_normalized_key" ON "suppliers" USING btree ("name_normalized") WHERE "suppliers"."ico" IS NULL;

-- ===== Ruční doplňky za vygenerované tabulky (stejný postup jako
-- 0020_eshop_1_0_payments_invoicing.sql: orders_payment_vs_immutable
-- trigger, order_payment_balance view) =====

-- 1. Výchozí skladová lokace pro MVP (revize návrhu, bod 1) — "pro MVP
-- může existovat jedna výchozí lokace, ale databáze musí bez migrace
-- struktury podporovat výrobu/bistro/chladicí sklad/Farmu Hole". Další
-- lokace se přidávají obyčejným INSERTem, bez další migrace.
INSERT INTO stock_locations (code, name) VALUES ('default', 'Výchozí sklad');
--> statement-breakpoint

-- 2. Zůstatek za (stock_item_id, stock_location_id) — POHLED, ne ukládaný
-- sloupec (stejný vzor jako order_payment_balance v 0020). SUM přes
-- direction='in'/'out' z append-only stock_movements.
CREATE VIEW stock_item_balances AS
SELECT
  m.stock_item_id,
  m.stock_location_id,
  SUM(CASE WHEN m.direction = 'in' THEN m.quantity ELSE -m.quantity END) AS current_quantity
FROM stock_movements m
GROUP BY m.stock_item_id, m.stock_location_id;
--> statement-breakpoint

-- 3. Databázová pojistka proti duplicitnímu dokladu (revize návrhu, bod 6;
-- post-implementační audit, bod 7): stejný SHA-256 souboru nesmí existovat
-- mezi stránkami dvou RŮZNÝCH aktivních příjemek najednou — AKTIVNÍ =
-- 'draft' NEBO 'confirmed', jen 'voided' je vyloučené (ne jen draft proti
-- draftu: nahrání stejného souboru znovu musí být blokované i vůči už
-- POTVRZENÉ příjemce, jinak by šlo omylem vytvořit duplicitní draft ke
-- skutečně existujícímu dokladu). `status` žije na goods_receipts, ne na
-- goods_receipt_document_pages, takže to nejde vyjádřit jako jednoduchý
-- partial unique index (predikát indexu nesmí odkazovat na jinou tabulku)
-- — proto trigger, ne index. Běží při INSERT i při změně sha256 (UPDATE),
-- ne při změně čehokoli jiného na stránce.
--
-- Post-implementační audit (bod B) — samotný EXISTS/SELECT NESTAČÍ: pod
-- READ COMMITTED dvě souběžné transakce vkládající stránku se STEJNÝM
-- hashem do dvou RŮZNÝCH příjemek obě uvidí "žádná duplicita" (každá vidí
-- jen COMMITNUTÁ data, ne navzájem svůj nekomitnutý INSERT) a obě projdou
-- — prokázáno (viz skladSha256Concurrency.test.ts, reálný běh nad PGlite
-- se dvěma souběžnými připojeními). Oprava: transaction-scoped advisory
-- lock odvozený z CELÉHO SHA-256 (`hashtextextended` konzumuje celý
-- vstupní text, ne jen prefix) se získá PŘED kontrolou duplicity. Druhá
-- transakce na STEJNÝ hash čeká (blokuje), dokud první nedokončí
-- (commit/rollback) — až pak vidí jeho skutečný, pravdivý výsledek. Lock
-- je per-transakce (`_xact_`), takže se sám uvolní na commit/rollback bez
-- rizika zapomenutého odemčení.
CREATE FUNCTION goods_receipt_document_pages_unique_active_sha256() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.sha256, 0));

  IF EXISTS (
    SELECT 1
    FROM goods_receipt_document_pages p
    JOIN goods_receipt_documents d ON d.id = p.document_id
    JOIN goods_receipts r ON r.id = d.receipt_id
    WHERE p.sha256 = NEW.sha256
      AND p.id <> NEW.id
      AND r.status IN ('draft', 'confirmed')
  ) THEN
    RAISE EXCEPTION 'Stejný soubor (sha256 %) už je součástí jiné aktivní (nestornované) příjemky', NEW.sha256;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER goods_receipt_document_pages_unique_active_sha256
  BEFORE INSERT OR UPDATE OF sha256 ON goods_receipt_document_pages
  FOR EACH ROW EXECUTE FUNCTION goods_receipt_document_pages_unique_active_sha256();
--> statement-breakpoint

-- 4. Stejná pojistka ZNOVU, tentokrát při přechodu příjemky do 'confirmed'
-- (post-implementační audit, bod B: "musí pokrýt i relevantní přechody
-- stavu příjemky"). Logická analýza: samotné potvrzení NEVKLÁDÁ ani
-- nemění žádnou stránku, takže pokud trigger výš (na INSERT/UPDATE
-- stránky) korektně udržuje "nejvýš jeden aktivní vlastník hashe", pouhé
-- draft→confirmed nemůže tenhle invariant porušit — jen storno (confirmed/
-- draft→voided) hash UVOLŇUJE, nikdy nic nezabírá. Tahle druhá pojistka je
-- tedy záměrně DEFENSE-IN-DEPTH (ne oprava další prokázané díry): kryje i
-- scénář, kdy by stránka v budoucnu vznikla jinou cestou než INSERTem
-- přes appku (hromadný import, oprava dat), a znovu validuje PŘÍMO před
-- okamžikem, kdy se příjemka stane "ostrou". Používá STEJNÝ advisory lock
-- vzor (lock podle hashe, pak kontrola) nad všemi hashi vlastních stránek.
CREATE FUNCTION goods_receipts_confirm_sha256_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  dup_hash text;
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    FOR dup_hash IN
      SELECT DISTINCT p.sha256
      FROM goods_receipt_document_pages p
      JOIN goods_receipt_documents d ON d.id = p.document_id
      WHERE d.receipt_id = NEW.id
    LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended(dup_hash, 0));
      IF EXISTS (
        SELECT 1
        FROM goods_receipt_document_pages p2
        JOIN goods_receipt_documents d2 ON d2.id = p2.document_id
        JOIN goods_receipts r2 ON r2.id = d2.receipt_id
        WHERE p2.sha256 = dup_hash
          AND r2.id <> NEW.id
          AND r2.status IN ('draft', 'confirmed')
      ) THEN
        RAISE EXCEPTION 'Stejný soubor (sha256 %) je součástí jiné aktivní příjemky — potvrzení zablokováno', dup_hash;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER goods_receipts_confirm_sha256_guard
  BEFORE UPDATE OF status ON goods_receipts
  FOR EACH ROW EXECUTE FUNCTION goods_receipts_confirm_sha256_guard();
--> statement-breakpoint

-- 5. Post-implementační audit (bod A): vat_confirmed se musí vrátit na
-- false při JAKÉKOLI budoucí změně částek/údajů ovlivňujících DPH — ne jen
-- uvnitř reviewGoodsReceiptLineVat (ta explicitně nastavuje true jako
-- SOUČÁST stejného zápisu), ale i u JAKÉKOLI budoucí editační cesty, která
-- by (ještě nenapsaná) upravovala tyhle sloupce bez použití revizní
-- funkce. DB garance místo spoléhání na to, že si to zapamatuje každá
-- budoucí appková funkce.
--
-- DŮLEŽITÉ: porovnání NEW.vat_confirmed vs. OLD.vat_confirmed NESTAČÍ
-- jako signál "tohle je důvěryhodná revize" — UPDATE sloupce na STEJNOU
-- hodnotu (opětovné schválení opraveného řádku, který byl true už
-- předtím) je ze strany triggeru NEROZEZNATELNÉ od "appka ten sloupec
-- vůbec nezmínila a zdědil se z OLD". Řešení: reviewGoodsReceiptLineVat
-- explicitně nastaví per-transakční GUC flag TĚSNĚ PŘED UPDATEm, v TÉŽE
-- transakci/HTTP požadavku (jeden SQL příkaz s WITH … MATERIALIZED, aby
-- se set_config spustil jistě, i když jeho výsledek nikdo dál nečte) —
-- trigger tenhle flag čte a jen DÍKY NĚMU rozezná důvěryhodnou cestu od
-- jakékoli jiné. Ověřeno reálně nad PGlite (ne jen staticky) —
-- skladVatConfirmedReset.test.ts.
CREATE FUNCTION goods_receipt_lines_reset_vat_confirmed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.total_without_vat_hal, NEW.vat_hal, NEW.total_with_vat_hal, NEW.computed_vat_rate_percent,
      NEW.raw_package_quantity, NEW.raw_units_per_package, NEW.unit_price_without_vat)
     IS DISTINCT FROM
     (OLD.total_without_vat_hal, OLD.vat_hal, OLD.total_with_vat_hal, OLD.computed_vat_rate_percent,
      OLD.raw_package_quantity, OLD.raw_units_per_package, OLD.unit_price_without_vat)
     AND coalesce(current_setting('sklad.vat_review_in_progress', true), 'false') <> 'true'
  THEN
    NEW.vat_confirmed := false;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER goods_receipt_lines_reset_vat_confirmed
  BEFORE UPDATE ON goods_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION goods_receipt_lines_reset_vat_confirmed();
