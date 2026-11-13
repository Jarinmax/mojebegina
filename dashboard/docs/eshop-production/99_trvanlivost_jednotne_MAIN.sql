-- Trvanlivost — jednotné znění u všech produktů (11. 11. 2026, vedení):
-- „Neotevřené balení spotřebujte do data uvedeného na obalu.“ + po otevření
-- podle druhu. Bez uvádění, kolik vydrží neotevřené (datum je na etiketě).
-- Polévky už toto znění mají; čaje řeší skript 98. Tento skript: ovocné
-- nápoje (5 dnů), koktejly (14 dnů), sirupy (3 měsíce).
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production).
BEGIN;

DO $$
DECLARE
  n int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  UPDATE products SET shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 5 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 3 THEN RAISE EXCEPTION 'Ovocné nápoje: čekal jsem 3, je %', n; END IF;

  UPDATE products SET shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 14 dnů při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug IN ('granatovy-bond', 'kosmopolitan', 'lady-carneval', 'svarak-deluxe');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 4 THEN RAISE EXCEPTION 'Koktejly: čekal jsem 4, je %', n; END IF;

  UPDATE products SET shelf_life_note = 'Neotevřené balení spotřebujte do data uvedeného na obalu. Po otevření spotřebujte do 3 měsíců při dodržení podmínek skladování, nejpozději však do data uvedeného na obalu.', updated_at = now()
   WHERE slug IN ('bylinny-sirup-saman', 'hermankovy-sirup', 'ibiskovy-sirup', 'lipovy-sirup', 'medunkovy-sirup-s-levanduli', 'sipkovy-sirup', 'zazvorovy-sirup');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 7 THEN RAISE EXCEPTION 'Sirupy: čekal jsem 7, je %', n; END IF;

  RAISE NOTICE 'Hotovo: trvanlivost má u všech produktů jednotné znění.';
END $$;

COMMIT;
