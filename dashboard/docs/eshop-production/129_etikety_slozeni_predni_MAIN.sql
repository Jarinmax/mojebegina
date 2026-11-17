-- 129: Etikety v Ceníku rozdělené na dvě položky (Lucie 17. 11. 2026):
--   • „Etiketa složení“ = dosavadní položka etiketa (černobílá DK-22212), délka 12 cm
--   • „Etiketa přední“ = nová položka etiketa-predni (červeno-černá DK-22251), délka 12 cm
-- Role 15,24 m = 127 etiket po 12 cm. Ceny z nabídek v Ceníku:
--   složení 187 Kč / 127 = 1,4724 Kč (Allegro Business), přední (260 + 59 Zásilkovna) / 127 = 2,5118 Kč.
-- Přední etiketa se přidá k balením, pro která jsou přední etikety v Řízení firmy → Etikety:
--   všechny 3 l beginy (s krabicí i bez), sirupy ve stříbrné kapsičce 650 ml, koktejly 500 ml.
-- Receptury (množství) se nemění. Dá se spustit opakovaně.
-- Spustit v Neon SQL Editoru na Production (větev main).
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;

UPDATE recipe_ingredients
   SET name = 'Etiketa složení (černobílá DK-22212, 12 cm)', price_kc = 1.4724, updated_at = now()
 WHERE code = 'etiketa';

INSERT INTO recipe_ingredients (kind, code, name, price_unit, price_kc)
VALUES ('obal', 'etiketa-predni', 'Etiketa přední (červeno-černá DK-22251, 12 cm)', 'ks', 2.5118)
ON CONFLICT (code) DO NOTHING;

UPDATE recipe_offers
   SET ingredient_id = (SELECT id FROM recipe_ingredients WHERE code = 'etiketa'),
       pack_qty = 127, pack_label = '1 role 15,24 m = 127 etiket po 12 cm', updated_at = now()
 WHERE item_name LIKE 'Etikety Brother QL-800 DK-22212%';

UPDATE recipe_offers
   SET ingredient_id = (SELECT id FROM recipe_ingredients WHERE code = 'etiketa-predni'),
       pack_qty = 127, pack_label = '1 role 15,24 m = 127 etiket po 12 cm', updated_at = now()
 WHERE item_name LIKE 'Etikety Brother QL-800 DK-22251%';

UPDATE recipe_variants v
   SET packaging_codes = v.packaging_codes || ',etiketa-predni'
  FROM recipes r
 WHERE r.id = v.recipe_id
   AND v.packaging_codes NOT LIKE '%etiketa-predni%'
   AND (v.volume_ml = 3000
        OR (r.category = 'sirupy' AND v.packaging_codes LIKE '%kapsicka-stribrna-750%')
        OR (r.category = 'koktejly' AND v.volume_ml = 500));
COMMIT;
SELECT (SELECT string_agg(code || ' ' || price_kc, ', ') FROM recipe_ingredients WHERE code IN ('etiketa','etiketa-predni')) AS etikety,
       (SELECT count(*) FROM recipe_variants WHERE packaging_codes LIKE '%etiketa-predni%') AS baleni_s_predni,
       (SELECT count(*) FROM recipe_offers o JOIN recipe_ingredients i ON i.id = o.ingredient_id WHERE i.code IN ('etiketa','etiketa-predni')) AS nabidek_etiket;
