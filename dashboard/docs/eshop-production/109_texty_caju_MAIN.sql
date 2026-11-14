-- 109: Nové texty čajů + upozornění u čaje Šaman + štítek + drobnosti v textu kategorie — 14. 11. 2026.
-- Znění schválila Lucie 14. 11. 2026 v chatu. Důvod: konkrétní chuť místo
-- obecných frází, žádné sliby o účincích (nařízení (ES) č. 1924/2006),
-- doplněno „Pro koho je vhodný“.
-- Mění se:
--   • products.description a taste_description u 8 čajů,
--   • třetí štítek (highlights[3]) u 8 čajů → „ledový i horký“,
--   • products.warnings u čaje Šaman: „do 3 let“ → „do 12 let“ (stejně jako sirup, skript 108),
--   • kategorie caje: druhý odstavec úvodu („až 14 dní“, léto/zima).
-- Složení, výživa, skladování, trvanlivost, ceny, balení, fotky ani jiné
-- produkty a kategorie se NEMĚNÍ.
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main, jen jednou.
BEGIN;

DO $$
DECLARE
  n int;
  rest_before text;
  cat_before text;
  rest_after text;
  cat_after text;
  rest_sql constant text := $q$
    SELECT md5(string_agg(concat_ws('|', p.slug, p.name, p.short_description, p.ingredients,
             p.allergens::text, p.nutrition::text, p.storage_instructions, p.shelf_life_days::text, p.shelf_life_note,
             p.is_active::text, p.sort_order::text,
             CASE WHEN p.slug = 'bylinny-caj-saman' THEN '' ELSE p.warnings::text END,
             CASE WHEN c.slug = 'caje' THEN concat(p.highlights[1], '~', p.highlights[2])
                  ELSE concat(p.highlights::text, '~', p.description::text, '~', p.taste_description) END), '#' ORDER BY p.slug))
      FROM products p JOIN product_categories c ON c.id = p.category_id $q$;
  cat_sql constant text := $q$
    SELECT md5(string_agg(concat_ws('|', slug, name, image_url, sort_order::text, is_active::text, detail_sections::text,
             CASE WHEN slug = 'caje' THEN intro[1] ELSE intro::text END), '#' ORDER BY slug))
      FROM product_categories $q$;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  EXECUTE rest_sql INTO rest_before;
  EXECUTE cat_sql INTO cat_before;

  UPDATE products p SET description = v.description, taste_description = v.taste,
         highlights = ARRAY[p.highlights[1], p.highlights[2], 'ledový i horký']::text[], updated_at = now()
    FROM (VALUES
    ('bylinny-caj-saman', ARRAY[
      'Výrazný bylinný čaj ze šípku, čagy, ženšenu a zázvoru, lehce oslazený třtinovým cukrem.',
      '**Natočte si z beginy: s ledem jako ledový čaj, nebo ohřejte.**',
      '## Pro koho je vhodný',
      '- pro ty, kdo mají rádi výrazné bylinné chutě',
      '- především pro dospělé'
    ]::text[],
     'Plný a zemitý, šípek ho osvěží, zázvor zahřeje.'),
    ('zazvorovy-caj', ARRAY[
      'Hotový zázvorový čaj s citronem, lehce oslazený třtinovým cukrem.',
      '**Natočte si z beginy: s ledem jako ledový čaj, nebo ohřejte.**',
      '## Pro koho je vhodný',
      '- pro milovníky zázvoru',
      '- na zimu horký, na léto s ledem'
    ]::text[],
     'Výrazný zázvor a svěží citron. Horký zahřeje, s ledem osvěží.'),
    ('lipovy-caj', ARRAY[
      'Jemný čaj z lipového květu s citronem, lehce oslazený třtinovým cukrem.',
      '**Natočte si z beginy: s ledem jako ledový čaj, nebo ohřejte.**',
      '## Pro koho je vhodný',
      '- pro děti i dospělé',
      '- pro ty, kdo mají rádi jemné bylinné čaje'
    ]::text[],
     'Jemný, květový a hladký.'),
    ('hermankovy-caj', ARRAY[
      'Jemný čaj z květů heřmánku s citronem, lehce oslazený třtinovým cukrem.',
      '**Natočte si z beginy: s ledem jako ledový čaj, nebo ohřejte.**',
      '## Pro koho je vhodný',
      '- pro děti i dospělé',
      '- pro ty, kdo mají rádi jemné chutě'
    ]::text[],
     'Lehký a květový, s typickou heřmánkovou vůní.'),
    ('cerny-caj-golden-nepal', ARRAY[
      'Černý čaj Golden Nepal z nepálských hor, s citronem a lehce oslazený třtinovým cukrem. Hotový ledový čaj bez umělých aromat.',
      '**Natočte si z beginy: s ledem jako ledový čaj, nebo ohřejte.**',
      '## Pro koho je vhodný',
      '- pro milovníky černého čaje',
      '- pro dospělé, obsahuje kofein'
    ]::text[],
     'Plný černý čaj se svěžím citronem.'),
    ('jasminovy-zeleny-caj', ARRAY[
      'Zelený čaj Sencha s květy jasmínu a citronem, lehce oslazený třtinovým cukrem.',
      '**Natočte si z beginy: s ledem jako ledový čaj, nebo ohřejte.**',
      '## Pro koho je vhodný',
      '- pro milovníky zeleného čaje',
      '- pro dospělé, obsahuje kofein'
    ]::text[],
     'Jemný a svěží, s květinovou vůní jasmínu.'),
    ('ibiskovy-caj', ARRAY[
      'Sytě rubínový čaj z květů ibišku s citronem, lehce oslazený třtinovým cukrem.',
      '**Natočte si z beginy: s ledem jako ledový čaj, nebo ohřejte.**',
      '## Pro koho je vhodný',
      '- pro děti i dospělé',
      '- pro ty, kdo mají rádi svěží, ovocnější chutě'
    ]::text[],
     'Výrazný a svěží.'),
    ('medunkovy-caj-s-levanduli', ARRAY[
      'Bylinný čaj z meduňky a květů levandule s citronem, lehce oslazený třtinovým cukrem.',
      '**Natočte si z beginy: s ledem jako ledový čaj, nebo ohřejte.**',
      '## Pro koho je vhodný',
      '- pro děti i dospělé',
      '- pro ty, kdo mají rádi květinové chutě'
    ]::text[],
     'Lehký a bylinný, s květinovou vůní levandule.')
    ) AS v(slug, description, taste), product_categories c
   WHERE p.slug = v.slug AND c.id = p.category_id AND c.slug = 'caje' AND array_length(p.highlights, 1) = 3;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 8 THEN
    RAISE EXCEPTION 'Čekal jsem 8 čajů se třemi štítky, našel jsem % — zastavuji, nic se nezměnilo.', n;
  END IF;

  UPDATE products SET warnings = ARRAY['Není vhodné pro děti do 12 let, těhotné a kojící ženy.']::text[], updated_at = now()
   WHERE slug = 'bylinny-caj-saman' AND warnings = ARRAY['Není vhodné pro děti do 3 let, těhotné a kojící ženy.']::text[];
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Čaj Šaman nemá očekávané upozornění (do 3 let) — zastavuji, nic se nezměnilo.';
  END IF;

  UPDATE product_categories
     SET intro = array_replace(intro, 'Stačí natočit z beginy a pít ledové, nebo ohřát na horký čaj. Po otevření vydrží v lednici 14 dní – ideální na léto, na výlet i k vodě.', 'Stačí natočit z beginy a pít ledové, nebo ohřát na horký čaj. Po otevření vydrží v lednici až 14 dní. V létě s ledem na výlet i k vodě, v zimě ohřáté.'), updated_at = now()
   WHERE slug = 'caje' AND array_length(intro, 1) = 2 AND intro[2] = 'Stačí natočit z beginy a pít ledové, nebo ohřát na horký čaj. Po otevření vydrží v lednici 14 dní – ideální na léto, na výlet i k vodě.';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Text kategorie čaje nemá očekávané znění — zastavuji, nic se nezměnilo.';
  END IF;

  EXECUTE rest_sql INTO rest_after;
  EXECUTE cat_sql INTO cat_after;
  IF rest_before IS DISTINCT FROM rest_after OR cat_before IS DISTINCT FROM cat_after THEN
    RAISE EXCEPTION 'Změnilo by se něco jiného než texty čajů — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: nové texty u 8 čajů, upozornění u čaje Šaman, text kategorie. Ostatní beze změny.';
END $$;

SELECT slug, description[1] AS uvod, taste_description, highlights, warnings FROM products
 WHERE slug IN ('bylinny-caj-saman', 'zazvorovy-caj', 'lipovy-caj', 'hermankovy-caj', 'cerny-caj-golden-nepal', 'jasminovy-zeleny-caj', 'ibiskovy-caj', 'medunkovy-caj-s-levanduli') ORDER BY sort_order;

COMMIT;
