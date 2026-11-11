-- Texty kategorií (12. 11. 2026), schválil majitel:
--   1) Polévky – 3. odstavec doplněn o výdrž po otevření (14 dní, jako na
--      etiketě) a chlazenou přepravu.
--   2) Bylinné sirupy – celý text nahrazen kratším a konkrétním (bez tvrzení
--      o konzervantech, s návodem na ředění a balením).
--   3) Čaje – ke každému z 8 čajů přidána druhá fotka (begina 3 l).
-- Nic jiného se NEMĚNÍ. SPUSTIT CELÝ v Neon SQL Editoru na větvi main
-- (Production). Jedna transakce: když pojistka nesedí, NEZMĚNÍ SE NIC.
BEGIN;

DO $$
DECLARE
  n int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  IF (SELECT intro[3] FROM product_categories WHERE slug = 'polevky') IS DISTINCT FROM
     'Z třílitrového balení s kohoutkem odeberete právě tolik, kolik potřebujete. Zbytek uložíte do chladničky a další porci máte po ruce. Méně času u plotny, více času pro Vás.' THEN
    RAISE EXCEPTION 'Text Polévek je jiný, než čekám — zastavuji, nic se nezměnilo.';
  END IF;
  IF (SELECT intro[1] FROM product_categories WHERE slug = 'sirupy') NOT LIKE 'Bylinné sirupy Begina připravujeme řemeslně%' THEN
    RAISE EXCEPTION 'Text Sirupů je jiný, než čekám — zastavuji, nic se nezměnilo.';
  END IF;

  UPDATE product_categories
     SET intro[3] = 'Z třílitrové beginy s kohoutkem si natočíte právě tolik, kolik potřebujete. Zbytek uložíte do lednice, kde po otevření vydrží 14 dní, a další porci máte po ruce. Polévky doručujeme chlazenou přepravou. Méně času u plotny, více času pro Vás.'
   WHERE slug = 'polevky';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Kategorie Polévky nenalezena — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE product_categories
     SET intro = ARRAY[
       'Bylinné sirupy Begina vaříme z bylinek, koření, třtinového cukru a čisté filtrované vody. Bez umělých aromat a barviv.',
       'Stačí zalít vodou v poměru 1 : 10 – studenou na limonádu, horkou na čaj. Hodí se i do koktejlů a do kuchyně.',
       'Vybrat si můžete stříbrný sáček 650 ml (až 32 nápojů) nebo třílitrovou beginu s kohoutkem (až 150 nápojů, nápoj už od 3,30 Kč).'
     ]
   WHERE slug = 'sirupy';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Kategorie Sirupy nenalezena — zastavuji, nic se nezměnilo.'; END IF;


  -- 3) Čaje – druhá fotka (begina 3 l, ledový i horký čaj), sort_order 1.
  IF EXISTS (SELECT 1 FROM product_images WHERE url LIKE '/eshop/caje/%-begina.jpg') THEN
    RAISE EXCEPTION 'Fotky čajů s beginou už v databázi jsou — zastavuji, nic se nezměnilo.';
  END IF;
  INSERT INTO product_images (product_id, url, alt, sort_order)
  SELECT p.id, v.url, v.alt, 1
    FROM (VALUES
    ('bylinny-caj-saman', '/eshop/caje/bylinny-caj-saman-begina.jpg', 'Bylinný čaj Šaman v begině 3 l – ledový i horký'),
    ('lipovy-caj', '/eshop/caje/lipovy-caj-begina.jpg', 'Lipový čaj v begině 3 l – ledový i horký'),
    ('zazvorovy-caj', '/eshop/caje/zazvorovy-caj-begina.jpg', 'Zázvorový čaj v begině 3 l – ledový i horký'),
    ('ibiskovy-caj', '/eshop/caje/ibiskovy-caj-begina.jpg', 'Ibiškový čaj v begině 3 l – ledový i horký'),
    ('hermankovy-caj', '/eshop/caje/hermankovy-caj-begina.jpg', 'Heřmánkový čaj v begině 3 l – ledový i horký'),
    ('medunkovy-caj-s-levanduli', '/eshop/caje/medunkovy-caj-s-levanduli-begina.jpg', 'Meduňkový čaj s levandulí v begině 3 l – ledový i horký'),
    ('cerny-caj-golden-nepal', '/eshop/caje/cerny-caj-golden-nepal-begina.jpg', 'Černý čaj Golden Nepal v begině 3 l – ledový i horký'),
    ('jasminovy-zeleny-caj', '/eshop/caje/jasminovy-zeleny-caj-begina.jpg', 'Jasmínový zelený čaj v begině 3 l – ledový i horký')
    ) AS v(slug, url, alt)
    JOIN products p ON p.slug = v.slug;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 8 THEN RAISE EXCEPTION 'Čekal jsem 8 čajů, přidal bych % — zastavuji, nic se nezměnilo.', n; END IF;

  RAISE NOTICE 'Hotovo: texty Polévek a Sirupů upraveny, 8 čajů má druhou fotku s beginou.';
END $$;

COMMIT;
