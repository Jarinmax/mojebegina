-- Texty kategorií (12. 11. 2026), schválil majitel:
--   1) Polévky – 3. odstavec doplněn o výdrž po otevření (14 dní, jako na
--      etiketě) a chlazenou přepravu.
--   2) Bylinné sirupy – celý text nahrazen kratším a konkrétním (bez tvrzení
--      o konzervantech, s návodem na ředění a balením).
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

  RAISE NOTICE 'Hotovo: texty kategorií Polévky a Bylinné sirupy upraveny.';
END $$;

COMMIT;
