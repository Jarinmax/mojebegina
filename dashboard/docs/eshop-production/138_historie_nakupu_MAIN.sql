-- 138: Historie nákupů kontaktů podle faktur v iDokladu (zadání Lucie 18. 11. 2026).
-- Jen přidává novou tabulku; nic se nemaže ani nemění. Plní ji noční běh
-- /api/cron/historie-nakupu. Lze spustit opakovaně.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS lead_purchase_history (
  lead_id uuid PRIMARY KEY REFERENCES leads(id),
  matched_by text NOT NULL,
  invoices integer NOT NULL,
  total_kc numeric(12, 2) NOT NULL,
  first_day date,
  last_day date,
  items jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
SELECT count(*) AS radku FROM lead_purchase_history;
