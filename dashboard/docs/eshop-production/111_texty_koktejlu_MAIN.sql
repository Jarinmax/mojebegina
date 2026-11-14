-- 111: Nové texty alkoholických koktejlů + štítky + text kategorie — 14. 11. 2026.
-- Znění schválila Lucie 14. 11. 2026 v chatu. Důvod: konkrétní chuť místo
-- frází; vypuštěno „dodává každému okamžiku nádech sebevědomí a stylu“
-- (zákon č. 40/1995 Sb., § 4 písm. d) a e) — reklama na alkohol nesmí
-- vytvářet dojem společenského úspěchu ani tvrdit povzbuzující/uklidňující
-- účinek); Granátový Bond dostává popis a štítky (dosud prázdné).
-- Mění se:
--   • products.description, taste_description a highlights u 4 koktejlů,
--   • kategorie koktejly: úvod („z vodky nebo vína“, „až 14 dní“).
-- Složení, obsah alkoholu, upozornění, skladování, trvanlivost, ceny,
-- balení, fotky ani jiné produkty a kategorie se NEMĚNÍ.
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
             p.is_active::text, p.sort_order::text, p.warnings::text, p.alcohol_percent::text, p.is_age_restricted::text,
             CASE WHEN c.slug = 'koktejly' THEN ''
                  ELSE concat(p.highlights::text, '~', p.description::text, '~', p.taste_description) END), '#' ORDER BY p.slug))
      FROM products p JOIN product_categories c ON c.id = p.category_id $q$;
  cat_sql constant text := $q$
    SELECT md5(string_agg(concat_ws('|', slug, name, image_url, sort_order::text, is_active::text, detail_sections::text,
             CASE WHEN slug = 'koktejly' THEN '' ELSE intro::text END), '#' ORDER BY slug))
      FROM product_categories $q$;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  EXECUTE rest_sql INTO rest_before;
  EXECUTE cat_sql INTO cat_before;

  UPDATE products p SET description = v.description, taste_description = v.taste, highlights = v.highlights, updated_at = now()
    FROM (VALUES
    ('svarak-deluxe', ARRAY[
      'Svařák z červeného vína s pomerančovou, grepovou a citronovou šťávou. Skořice, hřebíček, badyán, kardamom, zázvor a vanilka mu dávají plnou kořeněnou vůni.',
      '**Stačí ohřát a nalít do hrnku. Dobrý je i vychlazený s ledem.**',
      '## Pro koho je vhodný',
      '- pro dospělé',
      '- na adventní večery, oslavy a zimní posezení',
      '- do kaváren a bister'
    ]::text[],
     'Plné červené víno, citrusy a koření.',
     ARRAY['bez umělých aromat a barviv', 'stačí ohřát']::text[]),
    ('lady-carneval', ARRAY[
      'Grepový koktejl s vodkou a Aperolem, dochucený citronem.',
      '**Stačí nalít do sklenice s ledem.**',
      '## Pro koho je vhodný',
      '- pro dospělé',
      '- na oslavu, zahradní párty nebo večer s přáteli',
      '- do barů, kaváren a bister'
    ]::text[],
     'Výrazně citrusový a svěží, s typickou chutí Aperolu a nasládlým dozvukem.',
     ARRAY['z čisté filtrované vody', 'ideální pro podávání s ledem']::text[]),
    ('granatovy-bond', ARRAY[
      'Ovocný koktejl s vodkou a šťávou z granátového jablka, dochucený citronem.',
      '**Stačí nalít do sklenice s ledem.**',
      '## Pro koho je vhodný',
      '- pro dospělé',
      '- na oslavu, zahradní párty nebo večer s přáteli',
      '- do barů, kaváren a bister'
    ]::text[],
     'Plný a ovocný, s výrazným granátovým jablkem a jemně nasládlým závěrem.',
     ARRAY['z čisté filtrované vody', 'ideální pro podávání s ledem', 'bez umělých aromat a barviv']::text[]),
    ('kosmopolitan', ARRAY[
      'Brusinkový koktejl s vodkou, jablečnou a citronovou šťávou. Brusinkové šťávy je v něm 27 %.',
      '**Stačí nalít do sklenice s ledem.**',
      '## Pro koho je vhodný',
      '- pro dospělé',
      '- na oslavu, zahradní párty nebo večer s přáteli',
      '- do barů, kaváren a bister'
    ]::text[],
     'Ovocný a svěží. Brusinky s citrusy a jemně nasládlým dozvukem.',
     ARRAY['z čisté filtrované vody', 'ideální pro podávání s ledem', 'bez umělých aromat a barviv']::text[])
    ) AS v(slug, description, taste, highlights), product_categories c
   WHERE p.slug = v.slug AND c.id = p.category_id AND c.slug = 'koktejly';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 4 THEN
    RAISE EXCEPTION 'Čekal jsem 4 koktejly, našel jsem % — zastavuji, nic se nezměnilo.', n;
  END IF;

  UPDATE product_categories
     SET intro = ARRAY['Alkoholické koktejly Begina jsou hotové míchané nápoje z vodky nebo vína a ovocných šťáv. Stačí nalít na led, Svařák Deluxe ohřát.', 'Vybrat si můžete průhledný sáček 500 ml se šroubovacím uzávěrem (2–3 nápoje) nebo třílitrovou beginu s kohoutkem (až 15 nápojů) – na oslavu i zahradní párty. Po otevření vydrží v lednici až 14 dní.']::text[], updated_at = now()
   WHERE slug = 'koktejly' AND array_length(intro, 1) = 2
     AND intro[1] = 'Alkoholické koktejly Begina jsou hotové míchané nápoje z destilátů a ovocných šťáv. Stačí nalít na led, Svařák Deluxe ohřát.'
     AND intro[2] = 'Vybrat si můžete průhledný sáček 500 ml se šroubovacím uzávěrem (2–3 nápoje) nebo třílitrovou beginu s kohoutkem (až 15 nápojů) – na oslavu i zahradní párty. Po otevření vydrží v lednici 14 dní.';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Text kategorie koktejly nemá očekávané znění — zastavuji, nic se nezměnilo.';
  END IF;

  EXECUTE rest_sql INTO rest_after;
  EXECUTE cat_sql INTO cat_after;
  IF rest_before IS DISTINCT FROM rest_after OR cat_before IS DISTINCT FROM cat_after THEN
    RAISE EXCEPTION 'Změnilo by se něco jiného než texty koktejlů — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: nové texty a štítky u 4 koktejlů a text kategorie. Ostatní beze změny.';
END $$;

SELECT slug, description[1] AS uvod, taste_description, highlights FROM products
 WHERE slug IN ('svarak-deluxe', 'lady-carneval', 'granatovy-bond', 'kosmopolitan') ORDER BY sort_order;

COMMIT;
