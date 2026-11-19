-- Doklady (Lucie 19. 11. 2026): PDF a fotky dokladů nákladů po měsících.
-- Jen přidává novou tabulku; nic nemaže. Lze spustit opakovaně.
CREATE TABLE IF NOT EXISTS "economy_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid REFERENCES "public"."economy_entries"("id") ON DELETE SET NULL,
	"month" text NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by_user_id" text,
	"uploaded_by_name" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "economy_documents_storage_key_key" UNIQUE("storage_key"),
	CONSTRAINT "economy_documents_month_check" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "economy_documents_month_idx" ON "economy_documents" USING btree ("month");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "economy_documents_entry_idx" ON "economy_documents" USING btree ("entry_id");
