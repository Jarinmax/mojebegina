-- NÁVRAT: odstraní obě tabulky z 11_migration.sql. Nespouštět automaticky.
-- NEJDŘÍV nasadit kód bez náhledu (jinak tlačítko zmizí a náhled vrací 404 —
-- kód je na chybějící tabulky připravený, ale audit by se ztratil).
-- Pojistka: když audit obsahuje záznamy, skript se zastaví — nejdřív je
-- exportujte (SELECT * FROM customer_card_preview_log) a rozhodněte ručně.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_permissions') THEN
    RAISE EXCEPTION 'Tabulky náhledu neexistují — není co vracet.';
  END IF;
  IF EXISTS (SELECT 1 FROM customer_card_preview_log) THEN
    RAISE EXCEPTION 'Audit náhledů obsahuje záznamy — nejdřív je exportujte, zastavuji.';
  END IF;
  DROP TABLE customer_card_preview_log;
  DROP TABLE user_permissions;
END $$;
