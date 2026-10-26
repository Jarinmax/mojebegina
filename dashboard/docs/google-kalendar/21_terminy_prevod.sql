-- GOOGLE KALENDÁŘ — převod starých termínů „jen datum“ (K8) na 09:00 Europe/Prague
-- téhož dne (rozhodnutí vedení 26. 10. 2026, bod 3 a 4).
-- POŘADÍ: až PO migraci 0025 (11_migrace_0025.sql) a PŘED nasazením nového kódu.
-- Pojistky (jeden blok = jedna transakce, při zastavení se nic nezmění):
--   • tabulka lead_calendar_sync musí existovat a být PRÁZDNÁ — jakmile běží
--     nový kód, termín 13:00 v zimě (= 12:00 UTC) by šel splést se starým zápisem,
--   • záloha nesmí existovat (převod jen jednou),
--   • počet převedených řádků = počet řádků zálohy.
-- Záloha lead_follow_up_k8_backup zůstává (původní i nová hodnota) pro návrat
-- 29_terminy_navrat.sql. updated_at se záměrně NEMĚNÍ — jde o technické
-- doplnění času, ne o změnu obchodníkem.
DO $$
DECLARE
  converted integer;
  backed_up integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_calendar_sync') THEN
    RAISE EXCEPTION 'Chybí migrace 0025 (lead_calendar_sync) — nejdřív 11_migrace_0025.sql, zastavuji.';
  END IF;
  IF EXISTS (SELECT 1 FROM lead_calendar_sync) THEN
    RAISE EXCEPTION 'lead_calendar_sync už obsahuje záznamy — nový kód už běží, převod by nešel bezpečně rozlišit, zastavuji.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_follow_up_k8_backup') THEN
    RAISE EXCEPTION 'Záloha lead_follow_up_k8_backup už existuje — převod už proběhl, zastavuji.';
  END IF;

  CREATE TABLE lead_follow_up_k8_backup (
    lead_id uuid PRIMARY KEY REFERENCES leads(id),
    old_next_follow_up_at timestamptz NOT NULL,
    new_next_follow_up_at timestamptz NOT NULL,
    converted_at timestamptz NOT NULL DEFAULT now()
  );

  INSERT INTO lead_follow_up_k8_backup (lead_id, old_next_follow_up_at, new_next_follow_up_at)
  SELECT id, next_follow_up_at,
         ((next_follow_up_at AT TIME ZONE 'Europe/Prague')::date + time '09:00') AT TIME ZONE 'Europe/Prague'
    FROM leads
   WHERE next_follow_up_at IS NOT NULL
     AND (next_follow_up_at AT TIME ZONE 'UTC')::time = time '12:00';
  GET DIAGNOSTICS backed_up = ROW_COUNT;

  UPDATE leads l SET next_follow_up_at = b.new_next_follow_up_at
    FROM lead_follow_up_k8_backup b
   WHERE b.lead_id = l.id AND l.next_follow_up_at = b.old_next_follow_up_at;
  GET DIAGNOSTICS converted = ROW_COUNT;

  IF converted <> backed_up THEN
    RAISE EXCEPTION 'Převedeno % z % zálohovaných termínů — nesouhlasí, zastavuji (nic se nezměnilo).', converted, backed_up;
  END IF;
  RAISE NOTICE 'K8: převedeno % termínů na 09:00 Europe/Prague, záloha v lead_follow_up_k8_backup.', converted;
END $$;
