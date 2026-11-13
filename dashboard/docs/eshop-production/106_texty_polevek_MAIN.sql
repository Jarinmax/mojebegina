-- 106: Nové texty polévek (úvod, „Jak chutná“, „Pro koho je vhodná“) — 14. 11. 2026.
-- Znění schválila Lucie 14. 11. 2026 v chatu. Důvod: méně obecných slov,
-- konkrétní chuť, vypuštěno „Poctivá domácí polévka“ a opakování filtrované
-- vody (zůstává ve štítcích a ve složení). Popisy chuti a tipy na podávání
-- vycházejí ze složení a z údajů Lucie (dýňová = nejprodávanější, gulášová
-- lehce pikantní, polévky jsou hladké — tečou kohoutkem).
-- Mění se JEN products.description a products.taste_description u 6 polévek.
-- Složení, výživa, alergeny, skladování, trvanlivost, ceny, balení, fotky,
-- text kategorie ani jiné produkty se NEMĚNÍ.
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main, jen jednou.
BEGIN;

DO $$
DECLARE
  n int;
  rest_before text;
  rest_sql constant text := $q$
    SELECT md5(string_agg(concat_ws('|', p.slug, p.name, p.short_description, p.highlights::text, p.ingredients,
             p.allergens::text, p.nutrition::text, p.storage_instructions, p.shelf_life_days::text, p.shelf_life_note,
             p.is_active::text, p.sort_order::text,
             CASE WHEN c.slug = 'polevky' THEN '' ELSE concat(p.description::text, '~', p.taste_description) END), '#' ORDER BY p.slug))
      FROM products p JOIN product_categories c ON c.id = p.category_id $q$;
  rest_after text;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  EXECUTE rest_sql INTO rest_before;

  UPDATE products p SET description = v.description, taste_description = v.taste, updated_at = now()
    FROM (VALUES
    ('dynova-polevka', ARRAY[
      'Naše nejprodávanější polévka. Dýně je v ní 41 % a kokosové mléko ji zjemňuje. Zázvor, chilli, muškátový oříšek a hřebíček jí dodávají výraznou, zajímavou chuť.',
      '**Natočte si z kohoutku, ohřejte a je hotovo.**',
      '## Pro koho je vhodná',
      '- pro ty, kdo chtějí dýňovou s charakterem',
      '- pro vegany a vegetariány',
      '- na rychlý oběd doma i v práci'
    ]::text[],
     'Krémová a plná, s kořeněným dozvukem, který příjemně prohřeje. Tip: opražená dýňová semínka nebo kapka dýňového oleje.'),
    ('kulajda', ARRAY[
      'Krémová kulajda plná brambor a žampionů, provoněná koprem.',
      '**Natočte si z kohoutku, ohřejte a je hotovo.**',
      '## Pro koho je vhodná',
      '- pro milovníky kulajdy',
      '- pro vegany a vegetariány',
      '- na rychlý oběd doma i v práci'
    ]::text[],
     'Hebká a sytá. Voní po houbách a kopru, česnek a kmín ji doladí. Tip: čerstvý chléb.'),
    ('rajcatova-polevka', ARRAY[
      'Poctivá rajská, ve které je rajčat přes třetinu. Kokosové mléko ji zjemní, libeček, kardamom a hřebíček jí dávají vlastní vůni.',
      '**Natočte si z kohoutku, ohřejte a je hotovo.**',
      '## Pro koho je vhodná',
      '- pro milovníky rajské',
      '- pro vegany a vegetariány',
      '- na rychlý oběd doma i v práci'
    ]::text[],
     'Výrazně rajčatová, lehce nasládlá, s kořeněnou vůní. Tip: krutony, rýže nebo čerstvá bazalka.'),
    ('rajcatova-polevka-s-cervenou-repou', ARRAY[
      'Jemná rajčatová polévka, které červená řepa dává sladší chuť a sytou barvu. Brambory a kokosové mléko ji dělají krémovou.',
      '**Natočte si z kohoutku, ohřejte a je hotovo.**',
      '## Pro koho je vhodná',
      '- pro ty, kdo mají rádi jemné krémové polévky',
      '- pro vegany a vegetariány',
      '- na rychlý oběd doma i v práci'
    ]::text[],
     'Hladká a krémová, jemnější a kulatější než klasická rajská.'),
    ('gulasova-polevka-z-hlivy-ustricne', ARRAY[
      'Sytá, lehce pikantní gulášová polévka. Plnou chuť jí dává hlíva ústřičná, uzená paprika, majoránka a kmín.',
      '**Natočte si z kohoutku, ohřejte a je hotovo.**',
      '## Pro koho je vhodná',
      '- pro ty, kdo chtějí gulášovou bez masa',
      '- pro vegany a vegetariány',
      '- když chcete polévku, která zasytí'
    ]::text[],
     'Výrazná a lehce pikantní, voní po uzené paprice, česneku a majoránce. Zahřeje a zasytí. Tip: čerstvý chléb.'),
    ('spenatova-polevka', ARRAY[
      'Lahodná špenátová polévka s bramborami a kokosovým mlékem, dochucená česnekem a majoránkou.',
      '**Natočte si z kohoutku, ohřejte a je hotovo.**',
      '## Pro koho je vhodná',
      '- pro milovníky špenátu s česnekem',
      '- pro vegany a vegetariány',
      '- na rychlý oběd doma i v práci'
    ]::text[],
     'Krémová a špenátová, s česnekem v pozadí. Tip: krutony.')
    ) AS v(slug, description, taste), product_categories c
   WHERE p.slug = v.slug AND c.id = p.category_id AND c.slug = 'polevky';
  GET DIAGNOSTICS n = ROW_COUNT;

  IF n <> 6 THEN
    RAISE EXCEPTION 'Čekal jsem 6 polévek, našel jsem % — zastavuji, nic se nezměnilo.', n;
  END IF;

  EXECUTE rest_sql INTO rest_after;
  IF rest_before IS DISTINCT FROM rest_after THEN
    RAISE EXCEPTION 'Změnilo by se něco jiného než texty polévek — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: nové texty u 6 polévek. Ostatní beze změny.';
END $$;

SELECT slug, description[1] AS uvod, taste_description FROM products
 WHERE slug IN ('dynova-polevka', 'kulajda', 'rajcatova-polevka', 'rajcatova-polevka-s-cervenou-repou', 'gulasova-polevka-z-hlivy-ustricne', 'spenatova-polevka') ORDER BY sort_order;

COMMIT;
