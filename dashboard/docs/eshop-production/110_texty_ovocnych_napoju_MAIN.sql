-- 110: Nové texty ovocných nápojů + štítek + drobnost v textu kategorie — 14. 11. 2026.
-- Znění schválila Lucie 14. 11. 2026 v chatu. Důvod: konkrétní chuť místo
-- frází, vypuštěno nepravdivé „díky různým velikostem balení“ (je jen 3 l)
-- a sekce „Moderní alternativa limonád“; „bez přidaného cukru“ vždy spolu
-- s údajem o přirozeně se vyskytujících cukrech (nařízení (ES) č. 1924/2006, příloha).
-- Mění se:
--   • products.description a taste_description u 3 ovocných nápojů,
--   • třetí štítek (highlights[3]) u 3 nápojů → „bez přidaného cukru“,
--   • kategorie ovocne-napoje: první odstavec úvodu bez „citronu“ (svařák má pomeranč).
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
             p.is_active::text, p.sort_order::text, p.warnings::text,
             CASE WHEN c.slug = 'ovocne-napoje' THEN concat(p.highlights[1], '~', p.highlights[2])
                  ELSE concat(p.highlights::text, '~', p.description::text, '~', p.taste_description) END), '#' ORDER BY p.slug))
      FROM products p JOIN product_categories c ON c.id = p.category_id $q$;
  cat_sql constant text := $q$
    SELECT md5(string_agg(concat_ws('|', slug, name, image_url, sort_order::text, is_active::text, detail_sections::text,
             CASE WHEN slug = 'ovocne-napoje' THEN intro[2] ELSE intro::text END), '#' ORDER BY slug))
      FROM product_categories $q$;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  EXECUTE rest_sql INTO rest_before;
  EXECUTE cat_sql INTO cat_before;

  UPDATE products p SET description = v.description, taste_description = v.taste,
         highlights = ARRAY[p.highlights[1], p.highlights[2], 'bez přidaného cukru']::text[], updated_at = now()
    FROM (VALUES
    ('cervankove-nebe', ARRAY[
      'Jablečno-malinový nápoj s kapkou citronu. Ovocné šťávy je v něm 34 %. Bez přidaného cukru, obsahuje jen přirozeně se vyskytující cukry z ovoce.',
      '**Stačí natočit z beginy a podávat vychlazené, nejlépe s ledem.**',
      '## Pro koho je vhodný',
      '- pro děti i dospělé',
      '- místo sladkých limonád',
      '- k posezení s přáteli',
      '- jako základ míchaných nápojů'
    ]::text[],
     'Šťavnatý a ovocný. Jablko zjemňuje maliny, citron dodá svěžest.'),
    ('dum-u-jezera', ARRAY[
      'Grepový nápoj s jablkem a citronem. Svěží a výraznější, připomíná letní střik. Bez přidaného cukru, obsahuje jen přirozeně se vyskytující cukry z ovoce.',
      '**Stačí natočit z beginy a podávat vychlazené, nejlépe s ledem.**',
      '## Pro koho je vhodný',
      '- pro ty, kdo mají rádi svěží, méně sladké chutě',
      '- místo sladkých limonád',
      '- k posezení s přáteli',
      '- jako základ míchaných nápojů'
    ]::text[],
     'Výrazně citrusový a osvěžující, jablko ho zakulacuje.'),
    ('malinovy-svarak-nealko', ARRAY[
      'Svařák bez alkoholu z malin, jablek a pomeranče, s hřebíčkem, skořicí a badyánem. Ovocné šťávy je v něm 58 %. Bez přidaného cukru, obsahuje jen přirozeně se vyskytující cukry z ovoce.',
      '**Stačí ohřát a nalít do hrnku. Dá se pít i vychlazený.**',
      '## Pro koho je vhodný',
      '- pro ty, kdo mají rádi svařák, ale nechtějí alkohol',
      '- pro děti i dospělé',
      '- na zimní večery a oslavy',
      '- do kaváren a bister'
    ]::text[],
     'Ovocný a hřejivý. Maliny a jablka doplňuje pomeranč, koření mu dává vůni svařáku.')
    ) AS v(slug, description, taste), product_categories c
   WHERE p.slug = v.slug AND c.id = p.category_id AND c.slug = 'ovocne-napoje' AND array_length(p.highlights, 1) = 3;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 3 THEN
    RAISE EXCEPTION 'Čekal jsem 3 ovocné nápoje se třemi štítky, našel jsem % — zastavuji, nic se nezměnilo.', n;
  END IF;

  UPDATE product_categories
     SET intro = array_replace(intro, 'Ovocné nápoje Begina mícháme z ovocných šťáv, citronu a čisté filtrované vody. Bez přidaného cukru – obsahují jen přirozeně přítomné cukry z ovoce.', 'Ovocné nápoje Begina mícháme z ovocných šťáv a čisté filtrované vody. Bez přidaného cukru – obsahují jen přirozeně přítomné cukry z ovoce.'), updated_at = now()
   WHERE slug = 'ovocne-napoje' AND array_length(intro, 1) = 2 AND intro[1] = 'Ovocné nápoje Begina mícháme z ovocných šťáv, citronu a čisté filtrované vody. Bez přidaného cukru – obsahují jen přirozeně přítomné cukry z ovoce.';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Text kategorie ovocné nápoje nemá očekávané znění — zastavuji, nic se nezměnilo.';
  END IF;

  EXECUTE rest_sql INTO rest_after;
  EXECUTE cat_sql INTO cat_after;
  IF rest_before IS DISTINCT FROM rest_after OR cat_before IS DISTINCT FROM cat_after THEN
    RAISE EXCEPTION 'Změnilo by se něco jiného než texty ovocných nápojů — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: nové texty u 3 ovocných nápojů a text kategorie. Ostatní beze změny.';
END $$;

SELECT slug, description[1] AS uvod, taste_description, highlights FROM products
 WHERE slug IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko') ORDER BY sort_order;

COMMIT;
