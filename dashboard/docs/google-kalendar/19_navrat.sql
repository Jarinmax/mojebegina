-- GOOGLE KALENDÁŘ — návrat migrace 0025. Kód s Google Kalendářem musí být
-- předtím vrácený. Zastaví se, dokud existuje AKTIVNÍ propojení (revoked_at
-- IS NULL): nese šifrovaný refresh token, který by po smazání zůstal platný
-- na straně Googlu. Postup: zrušit přístup aplikace v Google účtu
-- (myaccount.google.com → Zabezpečení → Aplikace třetích stran), potom
--   UPDATE google_calendar_connections SET revoked_at = now() WHERE revoked_at IS NULL;
-- a teprve pak tento skript. lead_calendar_sync je jen odvozený stav
-- synchronizace — zdrojem pravdy zůstává leads.next_follow_up_at.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM google_calendar_connections WHERE revoked_at IS NULL) THEN
    RAISE EXCEPTION 'Google účet je stále propojený (revoked_at IS NULL) — nejdřív zrušit přístup, zastavuji.';
  END IF;
  DROP TABLE lead_calendar_sync;
  DROP TABLE google_calendar_connections;
  RAISE NOTICE 'Návrat 0025: tabulky Google Kalendáře odstraněny.';
END $$;
