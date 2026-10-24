-- Svařák Deluxe do prodeje (rozhodnutí majitele 15. 10. 2026). Mění JEN
-- produkt svarak-deluxe, ostatní produkty ani balení beze změny.
--
-- Klasifikace: aromatizovaný nápoj z vína (nařízení (EU) 251/2014, příl. II
-- B.1): víno 64,9 % objemu (≥ 50 %), alkohol 7,5 % obj. (4,5–14,5 %),
-- ochuceno kořením. Ne „svařené víno / Glühwein“ (to smí být jen z vína bez
-- přidané vody a šťáv). Od 8. 12. 2023 povinně složení + výživové údaje
-- (nařízení (EU) 2021/2117); prodej na dálku = údaje před nákupem.
--
-- Receptura na 3 l (majitel): červené víno 2 000 ml, pomerančová šťáva
-- 400 ml, grepová 300 ml, citronová 200 ml, voda s výluhem koření 100 ml,
-- třtinový cukr 130 g, koření (skořice, badyán, kardamom, vanilka, hřebíček,
-- zázvor), kyselina askorbová. Kyselina citronová NE. Siřičitany (víno).
-- Objem po rozpuštění cukru ≈ 3 082 ml (130 g × 0,63 ml/g), hmotnost 3 144 g.
-- Podíly (hmotnost): víno 63 %, pomeranč 13 %, grep 10 %, citron 7 %.
--
-- Výživové hodnoty na 100 ml — výpočet z receptury (čl. 31 odst. 4 písm. c)
-- nařízení 1169/2011) s tabulkovými hodnotami surovin (USDA FoodData
-- Central, SR Legacy: víno červené, pomerančová / grepová / citronová šťáva,
-- cukr 99,8 % sacharidů), alkohol z deklarovaných 7,5 % obj.
-- (5,92 g × 29 kJ / 7 kcal). Zaokrouhlení podle pokynů EU (tuky < 0,5 g,
-- nasycené < 0,1 g, sůl < 0,0125 g → 0 g):
--   energie 325 kJ / 77 kcal, tuky 0 g, nasycené 0 g, sacharidy 8,7 g,
--   cukry 6,8 g, bílkoviny 0,2 g, sůl 0 g.
--
-- Spustit celý v Neon SQL Editoru: nejdřív Preview (větev
-- preview/claude/great-bell-ffjwo3-stripe), pak main. Jeden blok = jedna
-- transakce: když cokoli nesedí, nezmění se nic.
DO $$
DECLARE
  changed int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'      -- Production main
     AND current_setting('neon.timeline_id', true) IS DISTINCT FROM '299e4791e9a0e842f491ef9cb9d822cd' -- Preview -stripe
  THEN
    RAISE EXCEPTION 'Neznámá větev databáze — zastavuji, nic se nezměnilo.';
  END IF;

  UPDATE products p
  SET allergens = ARRAY['sulphites']::text[],
      ingredients = 'červené víno 63 % (obsahuje SIŘIČITANY), pomerančová šťáva 13 %, grepová šťáva 10 %, '
                 || 'citronová šťáva 7 %, třtinový cukr, výluh koření (voda, skořice, badyán, kardamom, vanilka, '
                 || 'hřebíček, zázvor), antioxidant: kyselina askorbová (vitamin C)',
      short_description = 'Aromatizovaný nápoj z vína s pomerančovou, grepovou a citronovou šťávou a kořením.',
      nutrition = '{"energy_kj": 325, "energy_kcal": 77, "fat": 0, "saturates": 0, "carbohydrate": 8.7, "sugars": 6.8, "protein": 0.2, "salt": 0}'::jsonb,
      nutrition_basis = '100ml',
      updated_at = now()
  FROM product_categories c
  WHERE c.id = p.category_id
    AND c.slug = 'koktejly'
    AND p.slug = 'svarak-deluxe'
    AND p.allergens IS NULL
    AND p.is_age_restricted
    AND p.alcohol_percent = 7.5;
  GET DIAGNOSTICS changed = ROW_COUNT;

  IF changed <> 1 THEN
    RAISE EXCEPTION 'Čekám Svařák Deluxe (18+, 7,5 %%, neověřené alergeny), našel jsem % — zastavuji, nic se nezměnilo.', changed;
  END IF;
  RAISE NOTICE 'Hotovo: Svařák Deluxe — siřičitany, složení, výživové údaje, zákonný název; lze objednat (18+).';
END $$;

-- Návrat (Svařák znovu „Připravujeme“; složení a popis zůstanou nové):
-- UPDATE products SET allergens = NULL, updated_at = now() WHERE slug = 'svarak-deluxe';
