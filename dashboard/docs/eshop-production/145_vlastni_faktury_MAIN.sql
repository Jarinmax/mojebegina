-- 145: Vlastní fakturace (Lucie 23. 11. 2026) – číselná řada a vystavené faktury v MojeBegina (migrace 0064 + 0065).
-- Řada navazuje na poslední fakturu z iDokladu 20260214 → první vlastní faktura bude 20260215.
-- Faktury lze upravit (předchozí verze se uloží), stornovat, a smazat jen poslední neodeslanou.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;
CREATE TABLE "invoice_number_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_serial" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_number_counters_year" CHECK ("invoice_number_counters"."year" BETWEEN 2026 AND 2099),
	CONSTRAINT "invoice_number_counters_serial" CHECK ("invoice_number_counters"."last_serial" BETWEEN 0 AND 9999)
);
CREATE TABLE "own_invoice_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"kind" text NOT NULL,
	"invoice_id" uuid,
	"order_id" uuid,
	"corrects_document_id" uuid,
	"issue_date" date NOT NULL,
	"total_kc" integer NOT NULL,
	"customer_name" text NOT NULL,
	"customer_ico" text,
	"snapshot" jsonb NOT NULL,
	"pdf_base64" text,
	"pdf_sha256" text,
	"issued_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "own_invoice_documents_number_unique" UNIQUE("number"),
	CONSTRAINT "own_invoice_documents_invoice_id_unique" UNIQUE("invoice_id"),
	CONSTRAINT "own_invoice_documents_kind" CHECK ("own_invoice_documents"."kind" IN ('invoice', 'credit_note')),
	CONSTRAINT "own_invoice_documents_number" CHECK ("own_invoice_documents"."number" ~ '^20[0-9]{6}$'),
	CONSTRAINT "own_invoice_documents_credit" CHECK (("own_invoice_documents"."kind" = 'credit_note') = ("own_invoice_documents"."corrects_document_id" IS NOT NULL))
);
ALTER TABLE "own_invoice_documents" ADD CONSTRAINT "own_invoice_documents_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "own_invoice_documents" ADD CONSTRAINT "own_invoice_documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "own_invoice_documents" ADD CONSTRAINT "own_invoice_documents_corrects_document_id_own_invoice_documents_id_fk" FOREIGN KEY ("corrects_document_id") REFERENCES "public"."own_invoice_documents"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "own_invoice_documents_order_idx" ON "own_invoice_documents" USING btree ("order_id");
CREATE INDEX "own_invoice_documents_issue_idx" ON "own_invoice_documents" USING btree ("issue_date");
CREATE OR REPLACE FUNCTION own_invoice_documents_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Vystavený doklad % nelze smazat — opravuje se dobropisem.', OLD.number;
  END IF;
  IF NEW.number IS DISTINCT FROM OLD.number OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.total_kc IS DISTINCT FROM OLD.total_kc
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.corrects_document_id IS DISTINCT FROM OLD.corrects_document_id
     OR NEW.customer_name IS DISTINCT FROM OLD.customer_name OR NEW.customer_ico IS DISTINCT FROM OLD.customer_ico THEN
    RAISE EXCEPTION 'Vystavený doklad % nelze měnit — opravuje se dobropisem.', OLD.number;
  END IF;
  IF OLD.pdf_base64 IS NOT NULL AND NEW.pdf_base64 IS DISTINCT FROM OLD.pdf_base64 THEN
    RAISE EXCEPTION 'PDF vystaveného dokladu % nelze přepsat.', OLD.number;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER own_invoice_documents_guard BEFORE UPDATE OR DELETE ON own_invoice_documents
  FOR EACH ROW EXECUTE FUNCTION own_invoice_documents_guard();
CREATE TABLE "own_invoice_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"total_kc" integer NOT NULL,
	"pdf_base64" text,
	"changed_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "own_invoice_versions_doc_version" UNIQUE("document_id","version")
);
ALTER TABLE "own_invoice_documents" ADD COLUMN "state" text DEFAULT 'issued' NOT NULL;
ALTER TABLE "own_invoice_documents" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "own_invoice_documents" ADD COLUMN "sent_at" timestamp with time zone;
ALTER TABLE "own_invoice_documents" ADD COLUMN "paid_on" date;
ALTER TABLE "own_invoice_documents" ADD COLUMN "cancelled_at" timestamp with time zone;
ALTER TABLE "own_invoice_documents" ADD COLUMN "cancel_reason" text;
ALTER TABLE "own_invoice_documents" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "own_invoice_documents" ADD COLUMN "updated_by_name" text;
ALTER TABLE "own_invoice_versions" ADD CONSTRAINT "own_invoice_versions_document_id_own_invoice_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."own_invoice_documents"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "own_invoice_documents" ADD CONSTRAINT "own_invoice_documents_state" CHECK ("own_invoice_documents"."state" IN ('issued', 'cancelled'));
DROP TRIGGER IF EXISTS own_invoice_documents_guard ON own_invoice_documents;
CREATE OR REPLACE FUNCTION own_invoice_documents_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.sent_at IS NOT NULL THEN
      RAISE EXCEPTION 'Fakturu % už zákazník dostal — nelze ji smazat, jen stornovat.', OLD.number;
    END IF;
    IF EXISTS (SELECT 1 FROM own_invoice_documents d WHERE left(d.number, 4) = left(OLD.number, 4) AND d.number > OLD.number) THEN
      RAISE EXCEPTION 'Smazat lze jen poslední fakturu v řadě; % stornujte.', OLD.number;
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.number IS DISTINCT FROM OLD.number OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id OR NEW.order_id IS DISTINCT FROM OLD.order_id THEN
    RAISE EXCEPTION 'U faktury % nelze měnit číslo ani vazbu na objednávku.', OLD.number;
  END IF;
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.total_kc IS DISTINCT FROM OLD.total_kc THEN
    INSERT INTO own_invoice_versions (document_id, version, snapshot, total_kc, pdf_base64, changed_by_name)
    VALUES (OLD.id, OLD.version, OLD.snapshot, OLD.total_kc, OLD.pdf_base64, NEW.updated_by_name);
    NEW.version := OLD.version + 1;
    NEW.pdf_base64 := NULL;
    NEW.pdf_sha256 := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER own_invoice_documents_guard BEFORE UPDATE OR DELETE ON own_invoice_documents
  FOR EACH ROW EXECUTE FUNCTION own_invoice_documents_guard();
INSERT INTO invoice_number_counters (year, last_serial) VALUES (2026, 214);
COMMIT;
SELECT year, last_serial, year::text || lpad((last_serial + 1)::text, 4, '0') AS prvni_vlastni_faktura FROM invoice_number_counters;
