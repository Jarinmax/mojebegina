-- Objednávky: „Odesláno“ a „Faktura poslána“ (zadání Lucie 18. 11. 2026).
-- Jen přidává nullable sloupce a doplní „Faktura poslána“ u objednávek,
-- jejichž faktura už odešla e-mailem z MojeBegina (invoices.pdf_sent_at).
-- Nic se nemaže, faktury ani platby se nemění. Lze spustit opakovaně.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at timestamptz;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_by_user_id text;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_by_name text;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_sent_at timestamptz;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_sent_by_user_id text;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_sent_by_name text;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_sent_to text;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_sent_method text;
--> statement-breakpoint
UPDATE orders o
SET invoice_sent_at = i.pdf_sent_at,
    invoice_sent_method = 'email',
    invoice_sent_to = o.contact_email,
    invoice_sent_by_name = 'MojeBegina (automaticky)'
FROM invoices i
WHERE i.order_id = o.id
  AND i.document_type = 'invoice'
  AND i.doc_state = 'issued'
  AND i.pdf_sent_at IS NOT NULL
  AND o.invoice_sent_at IS NULL;
