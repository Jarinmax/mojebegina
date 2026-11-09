-- Přejmenování produktu „Rajčatová polévka“ → „Tomatová polévka“
-- (majitel 9. 11. 2026). JEN tento jeden produkt (slug rajcatova-polevka):
--   • název, popis alternativního textu fotky,
--   • v popisu: první věta „Tomatová polévka nabízí…“ a odrážka
--     „pro milovníky tomatových polévek“.
-- Beze změny: složení (pasírovaná rajčata, rajčatový protlak…), „zralých
-- rajčat“ / „kvalitní rajčata“ jako surovina, ceny, varianty, SKU, slug
-- (adresa /produkt/rajcatova-polevka dál funguje — QR kódy, odkazy),
-- historické objednávky (order_items drží název z doby objednávky).
-- „Rajčatová polévka s červenou řepou“ zůstává celá beze změny (hlídá
-- otisk řádku).
--
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production). Jedna
-- transakce: když pojistka nesedí, NEZMĚNÍ SE NIC.
BEGIN;

DO $$
DECLARE
  n int;
  pid uuid;
  repa_before text;
  keep_before text;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  SELECT md5(p::text || coalesce((SELECT string_agg(v::text, '|' ORDER BY v.sku) FROM product_variants v WHERE v.product_id = p.id), '') ||
             coalesce((SELECT string_agg(i::text, '|' ORDER BY i.url) FROM product_images i WHERE i.product_id = p.id), ''))
    INTO repa_before FROM products p WHERE slug = 'rajcatova-polevka-s-cervenou-repou';
  SELECT id, md5(coalesce(ingredients, '') || coalesce(taste_description, '') || coalesce(short_description, '') || is_active::text ||
             coalesce((SELECT string_agg(v::text, '|' ORDER BY v.sku) FROM product_variants v WHERE v.product_id = p.id), ''))
    INTO pid, keep_before FROM products p WHERE slug = 'rajcatova-polevka' AND name = 'Rajčatová polévka';
  IF pid IS NULL THEN
    RAISE EXCEPTION 'Produkt rajcatova-polevka s názvem „Rajčatová polévka“ nenalezen — zastavuji, nic se nezměnilo.';
  END IF;

  UPDATE products
     SET name = 'Tomatová polévka',
         description = array_replace(array_replace(description,
           'Rajčatová polévka nabízí plnou chuť zralých rajčat, vyvážené koření a jemně krémovou strukturu.',
           'Tomatová polévka nabízí plnou chuť zralých rajčat, vyvážené koření a jemně krémovou strukturu.'),
           '- pro milovníky rajčatových polévek', '- pro milovníky tomatových polévek'),
         updated_at = now()
   WHERE id = pid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Čekal jsem 1 produkt, změnil bych % — zastavuji.', n; END IF;

  UPDATE product_images SET alt = 'Tomatová polévka' WHERE product_id = pid AND alt = 'Rajčatová polévka';

  IF EXISTS (SELECT 1 FROM products WHERE id = pid AND (array_to_string(description, ' ') ~ 'Rajčatov|rajčatových polévek' OR
             NOT array_to_string(description, ' ') LIKE 'Tomatová polévka nabízí%' OR NOT 'pro milovníky tomatových polévek' = ANY (SELECT ltrim(d, '- ') FROM unnest(description) d))) THEN
    RAISE EXCEPTION 'Popis po úpravě nesedí — zastavuji, nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM product_images WHERE product_id = pid AND alt ILIKE '%rajčatov%') THEN
    RAISE EXCEPTION 'Popisek fotky po úpravě nesedí — zastavuji, nic se nezměnilo.';
  END IF;
  IF keep_before IS DISTINCT FROM (SELECT md5(coalesce(ingredients, '') || coalesce(taste_description, '') || coalesce(short_description, '') || is_active::text ||
             coalesce((SELECT string_agg(v::text, '|' ORDER BY v.sku) FROM product_variants v WHERE v.product_id = p.id), '')) FROM products p WHERE id = pid) THEN
    RAISE EXCEPTION 'Změnilo by se složení, cena nebo varianta — zastavuji, nic se nezměnilo.';
  END IF;
  IF repa_before IS DISTINCT FROM (SELECT md5(p::text || coalesce((SELECT string_agg(v::text, '|' ORDER BY v.sku) FROM product_variants v WHERE v.product_id = p.id), '') ||
             coalesce((SELECT string_agg(i::text, '|' ORDER BY i.url) FROM product_images i WHERE i.product_id = p.id), ''))
             FROM products p WHERE slug = 'rajcatova-polevka-s-cervenou-repou') THEN
    RAISE EXCEPTION 'Změnila by se Rajčatová polévka s červenou řepou — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: „Tomatová polévka“ (adresa /produkt/rajcatova-polevka beze změny), polévka s červenou řepou nedotčená.';
END $$;

COMMIT;

-- Kontrola po (spustit zvlášť):
-- SELECT slug, name FROM products WHERE slug LIKE 'rajcatova-polevka%';
