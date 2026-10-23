-- ČTENÍ iDOKLADU — návrat migrace 0023. Jen dokud v auditu nic není
-- (auditní záznamy se nemažou). Kód se čtením iDokladu musí být předtím vrácený.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM idoklad_read_log) THEN
    RAISE EXCEPTION 'V idoklad_read_log už jsou záznamy — auditní stopa se nemaže, zastavuji.';
  END IF;
  DROP TABLE idoklad_read_log;
  RAISE NOTICE 'Návrat 0023: tabulka idoklad_read_log odstraněna.';
END $$;
