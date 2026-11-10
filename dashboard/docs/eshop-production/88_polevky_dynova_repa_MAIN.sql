-- Dýňová polévka a Rajčatová polévka s červenou řepou (10. 11. 2026).
-- DÝŇOVÁ: nové složení (dýně před vodou, procenta
-- vůči čisté hmotnosti hotové polévky 2 855 g / 3 l) a průměrné výživové
-- hodnoty na 100 ml; dosavadní vláknina se odstraňuje (výpočet ji
-- nepotvrzuje). Skladování, trvanlivost, příprava, cena ani jiné produkty
-- se NEMĚNÍ. Na webu nikde „Hokkaido“ (používá se směs druhů dýní).
--
-- INTERNÍ POZNÁMKA (nezobrazuje se zákazníkům): výpočtový odhad podle
-- receptury Polevky_kalkulace(3).xlsx a dodavatelských a databázových
-- údajů. Pro dýni použit databázový profil Hokkaido jako zástupný podklad;
-- poměr používaných druhů dýní není stanoven. Není to ověření konkrétního
-- mixu ani laboratorní rozbor. Viz VYZIVOVE_UDAJE_ZDROJE.md.
--
-- RAJČATOVÁ S ČERVENOU ŘEPOU: nové složení (procenta vůči čisté hmotnosti
-- 2 940 g / 3 l; kyselina citronová jen jako podsložka pasírovaných rajčat)
-- a výživa na 100 ml; vláknina se odstraňuje. INTERNĚ: výpočtový průměr
-- z receptury, dodavatelských údajů a databází, ne laboratorní rozbor;
-- kokosové mléko 400 ml = 359 g (vážení Jarin).
--
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production). Jedna
-- transakce: když pojistka nesedí, NEZMĚNÍ SE NIC.
BEGIN;

DO $$
DECLARE
  n int;
  rest_before text;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
  SELECT md5(string_agg(concat_ws('|', slug, ingredients, nutrition::text, storage_instructions, shelf_life_note), '#' ORDER BY slug))
    INTO rest_before FROM products WHERE slug NOT IN ('dynova-polevka', 'rajcatova-polevka-s-cervenou-repou');

  UPDATE products
     SET ingredients = 'dýně 41 %, čistá filtrovaná voda, kokosové mléko 14 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), brambory 10 %, cibule 5 %, kořen petržele, olivový olej, dýňový olej, mořská sůl, třtinový cukr, grapefruitová šťáva, lahůdkové droždí, sušený mletý zázvor, chilli, muškátový oříšek, hřebíček, antioxidant: kyselina askorbová (vitamin C), přírodní aroma',
         nutrition = '{"energy_kj": 250, "energy_kcal": 60, "fat": 3.9, "saturates": 2.5, "carbohydrate": 4.7, "sugars": 3.1, "protein": 1.0, "salt": 0.78}'::jsonb,
         nutrition_basis = '100ml',
         updated_at = now()
   WHERE slug = 'dynova-polevka'
     AND ingredients = 'čistá filtrovaná voda, dýně 39 %, kokosové mléko 15 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), brambory 9 %, cibule 4 %, olivový olej, dýňový olej, petržel kořen, mořská sůl, třtinový cukr, zázvor, lahůdkové droždí, grepová šťáva, chilli, muškátový oříšek, hřebíček, antioxidant: kyselina askorbová (vitamin C), přírodní aroma'
     AND (nutrition->>'energy_kj')::int = 283;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Dýňová polévka nemá očekávané původní složení a výživu — zastavuji, nic se nezměnilo.'; END IF;

  UPDATE products
     SET ingredients = 'čistá filtrovaná voda, pasírovaná rajčata 17 % (rajčata 99,9 %, regulátor kyselosti: kyselina citronová), brambory 14 %, kokosové mléko 12 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), červená řepa 9 %, cibule 5 %, rajčatový protlak 3 % (rajčatový protlak, jedlá sůl 1 %), kořen petržele, olivový olej, mořská sůl, třtinový cukr, antioxidant: kyselina askorbová (vitamin C), přírodní aroma',
         nutrition = '{"energy_kj": 219, "energy_kcal": 52, "fat": 2.8, "saturates": 2.1, "carbohydrate": 5.1, "sugars": 3.1, "protein": 1.1, "salt": 0.84}'::jsonb,
         nutrition_basis = '100ml',
         updated_at = now()
   WHERE slug = 'rajcatova-polevka-s-cervenou-repou'
     AND ingredients = 'čistá filtrovaná voda, pasírovaná rajčata 17 %, brambory 13 %, kokosové mléko 13 % (kokosový extrakt 85 %, pitná voda, emulgátor: E 435), červená řepa 9 %, rajčatový protlak 3 %, cibule, petržel kořen, mořská sůl, třtinový cukr, olivový olej, antioxidant: kyselina askorbová (vitamin C), přírodní aroma'
     AND (nutrition->>'energy_kj')::int = 189;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Rajčatová polévka s červenou řepou nemá očekávané původní složení a výživu — zastavuji, nic se nezměnilo.'; END IF;

  IF EXISTS (SELECT 1 FROM products p WHERE row_to_json(p)::text ILIKE '%hokkaid%') THEN
    RAISE EXCEPTION 'Někde v produktech zůstalo „Hokkaido“ — zastavuji, nic se nezměnilo.';
  END IF;
  IF rest_before IS DISTINCT FROM (SELECT md5(string_agg(concat_ws('|', slug, ingredients, nutrition::text, storage_instructions, shelf_life_note), '#' ORDER BY slug))
    FROM products WHERE slug NOT IN ('dynova-polevka', 'rajcatova-polevka-s-cervenou-repou')) THEN
    RAISE EXCEPTION 'Změnil by se jiný produkt — zastavuji, nic se nezměnilo.';
  END IF;
  RAISE NOTICE 'Hotovo: Dýňová a Rajčatová s červenou řepou mají nové složení a výživové hodnoty.';
END $$;

COMMIT;
