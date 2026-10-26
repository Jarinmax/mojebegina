-- ESHOP — zveřejnění Ovocných nápojů (po 71_ovocne_napoje.sql).
-- VYGENEROVÁNO skriptem scripts/eshop-catalog/build-ovocne-napoje.mjs — ručně neupravovat.
-- Zapíše ověřené alergeny (ALLERGENS ve skriptu), text kategorie a zapne
-- produkty. POJISTKA: dokud některý produkt nemá ověřené alergeny, skončí
-- chybou a NIC se nezmění (jedna transakce).
BEGIN;
DO $$
BEGIN
  IF (SELECT count(*) FROM "products" WHERE "slug" IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko')) <> 3 THEN
    RAISE EXCEPTION 'STOP: chybí produkty — nejdřív 71_ovocne_napoje.sql';
  END IF;
  IF EXISTS (SELECT 1 FROM "products" WHERE "slug" IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko') AND "allergens" IS NULL) THEN
    RAISE EXCEPTION 'STOP: neověřené alergeny — doplnit ALLERGENS ve skriptu a vygenerovat znovu';
  END IF;
END $$;
UPDATE "product_categories" SET "intro" = ARRAY['Poctivé ovocné prémiové nápoje Begina připravujeme z ovocných šťáv na základě čisté filtrované vody, která nechává vyniknout přirozené chuti každé ingredience. Jako česká značka si zakládáme na tom, aby každá receptura byla vyvážená a přinášela maximum chuti přímo z přírody.', 'Jsou zcela bez přidaného cukru, protože veškerá jejich sladkost pochází výhradně z ovoce. Jedinečný charakter a podmanivou vůni jim dodáváme šetrným zpracováním vybraných přírodních složek. Harmonicky vyniknou ve studené i teplé variantě a zachovávají si svou plnost, svěžest a poctivý charakter.']::text[],
  "detail_sections" = '[{"title":"Vhodné také pro gastro provozy a kanceláře","paragraphs":["Ovocné nápoje Begina jsou praktické řešení pro:","Díky bag-in-box balení lze nápoj jednoduše dávkovat bez přístupu vzduchu a zbytečného odpadu."],"bullets":["kavárny","bistra","menší restaurace","kanceláře","catering"]}]'::jsonb, "updated_at" = now()
WHERE "slug" = 'ovocne-napoje';
UPDATE "products" SET "is_active" = true, "updated_at" = now() WHERE "slug" IN ('cervankove-nebe', 'dum-u-jezera', 'malinovy-svarak-nealko');
COMMIT;
