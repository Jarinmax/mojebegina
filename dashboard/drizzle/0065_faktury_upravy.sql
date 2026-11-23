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
--> statement-breakpoint
ALTER TABLE "own_invoice_documents" ADD COLUMN "state" text DEFAULT 'issued' NOT NULL;--> statement-breakpoint
ALTER TABLE "own_invoice_documents" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "own_invoice_documents" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "own_invoice_documents" ADD COLUMN "paid_on" date;--> statement-breakpoint
ALTER TABLE "own_invoice_documents" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "own_invoice_documents" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "own_invoice_documents" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "own_invoice_documents" ADD COLUMN "updated_by_name" text;--> statement-breakpoint
ALTER TABLE "own_invoice_versions" ADD CONSTRAINT "own_invoice_versions_document_id_own_invoice_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."own_invoice_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "own_invoice_documents" ADD CONSTRAINT "own_invoice_documents_state" CHECK ("own_invoice_documents"."state" IN ('issued', 'cancelled'));--> statement-breakpoint
DROP TRIGGER IF EXISTS own_invoice_documents_guard ON own_invoice_documents;
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TRIGGER own_invoice_documents_guard BEFORE UPDATE OR DELETE ON own_invoice_documents
  FOR EACH ROW EXECUTE FUNCTION own_invoice_documents_guard();
