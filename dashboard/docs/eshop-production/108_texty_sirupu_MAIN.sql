-- 108: Nové texty bylinných sirupů + upozornění u Šamana + drobnosti v textu kategorie — 14. 11. 2026.
-- Znění schválila Lucie 14. 11. 2026 v chatu. Důvod: konkrétní chuť místo
-- obecných frází, žádné sliby o účincích (nařízení (ES) č. 1924/2006 —
-- zdravotní tvrzení), sjednocené nadpisy, ředění „20 ml doplnit na 200 ml“.
-- Mění se:
--   • products.description a taste_description u 7 sirupů,
--   • products.warnings u Šamana: „do 3 let“ → „do 12 let“ (rozhodnutí Lucie;
--     opora: monografie EMA k Eleutherococcus senticosus — nedoporučeno do 12 let),
--   • kategorie sirupy: v úvodu „v poměru přibližně 1 : 10“, v gastro sekci
--     „Stačí zalít horkou vodou nebo studenou perlivou.“
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
    SELECT md5(string_agg(concat_ws('|', p.slug, p.name, p.short_description, p.highlights::text, p.ingredients,
             p.allergens::text, p.nutrition::text, p.storage_instructions, p.shelf_life_days::text, p.shelf_life_note,
             p.is_active::text, p.sort_order::text,
             CASE WHEN p.slug = 'bylinny-sirup-saman' THEN '' ELSE p.warnings::text END,
             CASE WHEN c.slug = 'sirupy' THEN '' ELSE concat(p.description::text, '~', p.taste_description) END), '#' ORDER BY p.slug))
      FROM products p JOIN product_categories c ON c.id = p.category_id $q$;
  cat_sql constant text := $q$
    SELECT md5(string_agg(concat_ws('|', slug, name, image_url, sort_order::text, is_active::text,
             CASE WHEN slug = 'sirupy' THEN '' ELSE concat(intro::text, '~', detail_sections::text) END), '#' ORDER BY slug))
      FROM product_categories $q$;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  EXECUTE rest_sql INTO rest_before;
  EXECUTE cat_sql INTO cat_before;

  UPDATE products p SET description = v.description, taste_description = v.taste, updated_at = now()
    FROM (VALUES
    ('bylinny-sirup-saman', ARRAY[
      'Náš nejvýraznější sirup. Šípek, čaga, ženšen a zázvor mu dávají hlubokou, kořeněnou chuť s dlouhým dozvukem. Bylinného výluhu je v něm 40 %.',
      '**Stačí smíchat s vodou: studenou na limonádu, horkou na čaj.**',
      '## Pro koho je vhodný',
      '- pro ty, kdo mají rádi výrazné bylinné chutě',
      '- především pro dospělé',
      '- do kaváren a bister',
      '## Jak ho používat',
      '- horký místo čaje',
      '- studený s perlivou vodou, ledem a citronem',
      '**Zlaté pravidlo Beginy:** na sklenici dejte přibližně **20 ml sirupu a doplňte vodou na 200 ml** (zhruba 1 : 10). Chuť si upravte podle sebe.'
    ]::text[],
     'Plný a zemitý, šípek ho osvěží, zázvor zahřeje.'),
    ('zazvorovy-sirup', ARRAY[
      'Silný, intenzivní sirup ze zázvoru, třtinového cukru a citronové šťávy. Zázvorového výluhu je v něm 39 %.',
      '**Stačí smíchat s vodou: studenou na limonádu, horkou na čaj.**',
      '## Pro koho je vhodný',
      '- pro ty, kdo mají rádi výrazné chutě',
      '- na domácí zázvorovou limonádu',
      '- do kaváren a bister',
      '## Jak ho používat',
      '- studený s perlivou vodou, ledem a citronem',
      '- horký místo čaje',
      '- do čaje, dezertů nebo jogurtu',
      '**Zlaté pravidlo Beginy:** na sklenici dejte přibližně **20 ml sirupu a doplňte vodou na 200 ml** (zhruba 1 : 10). Chuť si upravte podle sebe.'
    ]::text[],
     'Intenzivní a přímý, přesně jak to od zázvoru čekáte. Svěží, s jemně zemitým závěrem.'),
    ('lipovy-sirup', ARRAY[
      'Jemný sirup z lipového květu, třtinového cukru a citronové šťávy. Lipového výluhu je v něm 39 %.',
      '**Stačí smíchat s vodou: studenou na limonádu, horkou na čaj.**',
      '## Pro koho je vhodný',
      '- pro děti i dospělé',
      '- pro ty, kdo mají rádi jemné bylinné chutě',
      '- do kaváren a bister jako základ domácí limonády',
      '## Jak ho používat',
      '- studený s perlivou vodou, ledem a mátou',
      '- horký místo čaje',
      '**Zlaté pravidlo Beginy:** na sklenici dejte přibližně **20 ml sirupu a doplňte vodou na 200 ml** (zhruba 1 : 10). Chuť si upravte podle sebe.'
    ]::text[],
     'Jemný, květový a lehký, hebký na patře.'),
    ('ibiskovy-sirup', ARRAY[
      'Sytě rubínový sirup z květů ibišku, třtinového cukru a citronové šťávy. Ibiškového výluhu je v něm 41 %.',
      '**Stačí smíchat s vodou: studenou na limonádu, horkou na čaj.**',
      '## Pro koho je vhodný',
      '- pro děti i dospělé',
      '- pro ty, kdo mají rádi svěží, ovocnější chutě',
      '- do kaváren a bister',
      '## Jak ho používat',
      '- studený s perlivou vodou, ledem a citronem',
      '- horký jako ibiškový čaj',
      '**Zlaté pravidlo Beginy:** na sklenici dejte přibližně **20 ml sirupu a doplňte vodou na 200 ml** (zhruba 1 : 10). Chuť si upravte podle sebe.'
    ]::text[],
     'Výrazný a svěží. V karafě krásně vypadá.'),
    ('sipkovy-sirup', ARRAY[
      'Sirup ze šípku, třtinového cukru a citronové šťávy, s plnou šípkovou chutí. Šípkového výluhu je v něm 40 %.',
      '**Stačí smíchat s vodou: studenou na limonádu, horkou na čaj.**',
      '## Pro koho je vhodný',
      '- pro děti i dospělé',
      '- pro milovníky šípkového čaje',
      '- do kaváren a bister',
      '## Jak ho používat',
      '- horký jako šípkový čaj',
      '- studený s perlivou vodou a citronem',
      '- na kaši nebo do jogurtu',
      '**Zlaté pravidlo Beginy:** na sklenici dejte přibližně **20 ml sirupu a doplňte vodou na 200 ml** (zhruba 1 : 10). Chuť si upravte podle sebe.'
    ]::text[],
     'Plný a kulatý, s dlouhým dozvukem.'),
    ('hermankovy-sirup', ARRAY[
      'Jemný sirup z květů heřmánku, s třtinovým cukrem a citronovou šťávou a s typickou heřmánkovou vůní. Heřmánkového výluhu je v něm 40 %.',
      '**Stačí smíchat s vodou: studenou na limonádu, horkou na čaj.**',
      '## Pro koho je vhodný',
      '- pro děti i dospělé',
      '- pro ty, kdo mají rádi jemné chutě',
      '- do kaváren a bister',
      '## Jak ho používat',
      '- horký místo čaje',
      '- studený s perlivou vodou a citronem',
      '- na kaši nebo do jogurtu',
      '**Zlaté pravidlo Beginy:** na sklenici dejte přibližně **20 ml sirupu a doplňte vodou na 200 ml** (zhruba 1 : 10). Chuť si upravte podle sebe.'
    ]::text[],
     'Čistý, lehký a květový.'),
    ('medunkovy-sirup-s-levanduli', ARRAY[
      'Bylinný sirup z meduňky a květů levandule, s třtinovým cukrem a citronovou šťávou. Bylinného výluhu je v něm 39 %.',
      '**Stačí smíchat s vodou: studenou na limonádu, horkou na čaj.**',
      '## Pro koho je vhodný',
      '- pro děti i dospělé',
      '- pro ty, kdo mají rádi květinové chutě',
      '- do kaváren a bister',
      '## Jak ho používat',
      '- studený s perlivou vodou, ledem a citronem',
      '- horký místo čaje',
      '**Zlaté pravidlo Beginy:** na sklenici dejte přibližně **20 ml sirupu a doplňte vodou na 200 ml** (zhruba 1 : 10). Chuť si upravte podle sebe.'
    ]::text[],
     'Lehký a bylinný, s květinovou vůní levandule.')
    ) AS v(slug, description, taste), product_categories c
   WHERE p.slug = v.slug AND c.id = p.category_id AND c.slug = 'sirupy';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 7 THEN
    RAISE EXCEPTION 'Čekal jsem 7 sirupů, našel jsem % — zastavuji, nic se nezměnilo.', n;
  END IF;

  UPDATE products SET warnings = ARRAY['Není vhodné pro děti do 12 let, těhotné a kojící ženy.']::text[], updated_at = now()
   WHERE slug = 'bylinny-sirup-saman' AND warnings = ARRAY['Není vhodné pro děti do 3 let, těhotné a kojící ženy.']::text[];
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Šaman nemá očekávané upozornění (do 3 let) — zastavuji, nic se nezměnilo.';
  END IF;

  UPDATE product_categories
     SET intro = array_replace(intro,
           'Stačí zalít vodou v poměru 1 : 10 – studenou na limonádu, horkou na čaj. Hodí se i do koktejlů a do kuchyně.',
           'Stačí zalít vodou v poměru přibližně 1 : 10 – studenou na limonádu, horkou na čaj. Hodí se i do koktejlů a do kuchyně.'),
         detail_sections = jsonb_set(detail_sections, '{0,paragraphs,1}',
           to_jsonb('Stačí zalít horkou vodou nebo studenou perlivou. Díky balení s kohoutkem lze sirup jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu.'::text)),
         updated_at = now()
   WHERE slug = 'sirupy'
     AND intro[2] = 'Stačí zalít vodou v poměru 1 : 10 – studenou na limonádu, horkou na čaj. Hodí se i do koktejlů a do kuchyně.'
     AND detail_sections #>> '{0,paragraphs,1}' = 'Stačí zalít horkou nebo studenou perlivou vodou. Díky balení s kohoutkem lze sirup jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu.';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Text kategorie sirupy nemá očekávané znění — zastavuji, nic se nezměnilo.';
  END IF;

  EXECUTE rest_sql INTO rest_after;
  EXECUTE cat_sql INTO cat_after;
  IF rest_before IS DISTINCT FROM rest_after OR cat_before IS DISTINCT FROM cat_after THEN
    RAISE EXCEPTION 'Změnilo by se něco jiného než texty sirupů — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: nové texty u 7 sirupů, upozornění u Šamana, text kategorie. Ostatní beze změny.';
END $$;

SELECT slug, description[1] AS uvod, taste_description, warnings FROM products
 WHERE slug IN ('bylinny-sirup-saman', 'zazvorovy-sirup', 'lipovy-sirup', 'ibiskovy-sirup', 'sipkovy-sirup', 'hermankovy-sirup', 'medunkovy-sirup-s-levanduli') ORDER BY sort_order;

COMMIT;
