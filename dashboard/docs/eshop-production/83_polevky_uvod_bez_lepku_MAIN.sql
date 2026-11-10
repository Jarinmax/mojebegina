-- Polévky (10. 11. 2026):
--   1) text kategorie pod nadpisem „Čerstvé polévky“ (3 odstavce, doslova
--      podle zadání Jarina; formát jako u sirupů — 1. odstavec zvýrazněný),
--   2) u všech 6 polévek se z výhod (highlights) ODSTRAŇUJE „přirozeně
--      bezlepková“ (lahůdkové droždí: dodavatel uvádí možnou kontaminaci
--      lepkem při balení; tvrzení „bez lepku“ jen podle nař. 828/2014).
-- Složení, alergeny, ceny, skladování ani trvanlivost se NEMĚNÍ (trvanlivost
-- řeší samostatný skript 82).
--
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production). Jedna
-- transakce: když pojistka nesedí, NEZMĚNÍ SE NIC.
BEGIN;

DO $$
DECLARE
  n int;
  rest_before text;
  intro_before text[];
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  SELECT md5(string_agg(concat_ws('|', slug, name, ingredients, allergens::text, nutrition::text,
           storage_instructions, shelf_life_note, is_active::text), '#' ORDER BY slug))
    INTO rest_before FROM products;

  SELECT intro INTO intro_before FROM product_categories WHERE slug = 'polevky';
  IF coalesce(cardinality(intro_before), 0) <> 0 THEN
    RAISE EXCEPTION 'Kategorie Polévky už nějaký text má — zastavuji, nic se nezměnilo.';
  END IF;

  UPDATE product_categories
     SET intro = ARRAY[
           'Čerstvé polévky Begina vaříme z čisté filtrované vody, zeleniny, hub, bylinek a koření. Všechny připravujeme z rostlinných surovin, bez masa a mléčných výrobků. Každá receptura má svou vlastní chuť — od jemných zeleninových krémů po výraznou gulášovou z hlívy ústřičné.',
           'Dobrou polévku si můžete dopřát i ve dnech, kdy na vaření nezbývá čas. Stačí ohřát a podávat doma, v práci nebo u společného stolu.',
           'Z třílitrového balení s kohoutkem odeberete právě tolik, kolik potřebujete. Zbytek uložíte do chladničky a další porci máte po ruce. Méně času u plotny, více času pro Vás.'
         ]
   WHERE slug = 'polevky';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Kategorie Polévky nenalezena — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products p
     SET highlights = array_remove(p.highlights, 'přirozeně bezlepková'),
         updated_at = now()
    FROM product_categories c
   WHERE c.id = p.category_id AND c.slug = 'polevky'
     AND 'přirozeně bezlepková' = ANY (p.highlights);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION 'Čekal jsem 6 polévek s „přirozeně bezlepková“, změnil bych % — zastavuji, nic se nezměnilo.', n; END IF;

  IF EXISTS (SELECT 1 FROM products WHERE highlights::text ILIKE '%lepk%' OR description::text ILIKE '%bezlepk%' OR description::text ILIKE '%bez lepku%') THEN
    RAISE EXCEPTION 'Tvrzení o lepku je ještě jinde v produktech — zastavuji, nic se nezměnilo.';
  END IF;

  IF rest_before IS DISTINCT FROM (SELECT md5(string_agg(concat_ws('|', slug, name, ingredients, allergens::text, nutrition::text,
           storage_instructions, shelf_life_note, is_active::text), '#' ORDER BY slug)) FROM products) THEN
    RAISE EXCEPTION 'Změnilo by se něco jiného než výhody polévek — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: text kategorie Polévky vložen, „přirozeně bezlepková“ odstraněno u 6 polévek.';
END $$;

COMMIT;
