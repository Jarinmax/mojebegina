CREATE TABLE "invoice_number_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_serial" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_number_counters_year" CHECK ("invoice_number_counters"."year" BETWEEN 2026 AND 2099),
	CONSTRAINT "invoice_number_counters_serial" CHECK ("invoice_number_counters"."last_serial" BETWEEN 0 AND 9999)
);
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "own_invoice_documents" ADD CONSTRAINT "own_invoice_documents_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "own_invoice_documents" ADD CONSTRAINT "own_invoice_documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "own_invoice_documents" ADD CONSTRAINT "own_invoice_documents_corrects_document_id_own_invoice_documents_id_fk" FOREIGN KEY ("corrects_document_id") REFERENCES "public"."own_invoice_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "own_invoice_documents_order_idx" ON "own_invoice_documents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "own_invoice_documents_issue_idx" ON "own_invoice_documents" USING btree ("issue_date");--> statement-breakpoint
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
--> statement-breakpoint
CREATE TRIGGER own_invoice_documents_guard BEFORE UPDATE OR DELETE ON own_invoice_documents
  FOR EACH ROW EXECUTE FUNCTION own_invoice_documents_guard();
