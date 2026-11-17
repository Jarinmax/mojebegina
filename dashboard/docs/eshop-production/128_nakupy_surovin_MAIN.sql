-- 128: Nákupy surovin – nová tabulka recipe_offers (nabídky dodavatelů s odkazy, dřív Google
-- tabulka „Suroviny nákupy Begina“) + naplnění nabídkami z té tabulky (stav 17. 11. 2026).
-- Navíc: smaže staré poznámky u položek Ceníku (nahradily je nabídky) a zapíše ceny od Lucie
-- ze 17. 11. 2026: Sencha 329 Kč/kg, Meduňka 292 Kč/kg (5 kg za 1 460 Kč), Grepová šťáva 85,60 Kč/l,
-- Jablečno-malinová šťáva 47,30 Kč/l (10 l za 473 Kč včetně dopravy).
-- Receptury (množství) se nemění. Stejné DDL jako drizzle/0050_nakupy_surovin.sql.
-- Dá se spustit opakovaně: nabídky se nahrají jen do prázdné tabulky.
-- Spustit v Neon SQL Editoru na Production (větev main).
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS "recipe_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid,
	"item_name" text NOT NULL,
	"url" text,
	"pack_label" text NOT NULL,
	"pack_qty" numeric(12, 4) NOT NULL,
	"price_kc" numeric(12, 2) NOT NULL,
	"shipping_kc" numeric(12, 2) DEFAULT '0' NOT NULL,
	"is_promo" boolean DEFAULT false NOT NULL,
	"note" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_offers_pack_check" CHECK ("recipe_offers"."pack_qty" > 0),
	CONSTRAINT "recipe_offers_price_check" CHECK ("recipe_offers"."price_kc" >= 0 AND "recipe_offers"."shipping_kc" >= 0)
);
DO $$ BEGIN
  ALTER TABLE "recipe_offers" ADD CONSTRAINT "recipe_offers_ingredient_id_recipe_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."recipe_ingredients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "recipe_offers_ingredient_idx" ON "recipe_offers" USING btree ("ingredient_id");

INSERT INTO recipe_offers (ingredient_id, item_name, url, pack_label, pack_qty, price_kc, shipping_kc, is_promo, note, sort)
SELECT v.* FROM (VALUES
  ((SELECT id FROM recipe_ingredients WHERE code = 'bag-3l'), 'Bag-in-box 3 l VINIFLOW střední výpusť – Packshop', 'https://www.packshop.cz/z/bag-in-box-3-litry-sacek-quotpack-shopquot-stred-76826.html', '500 ks', 500, 6207.3, 0, false, NULL, 10),
  ((SELECT id FROM recipe_ingredients WHERE code = 'bag-3l'), 'Bag-in-box 3 l VINIFLOW střední výpusť – Packshop', 'https://www.packshop.cz/z/bag-in-box-3-litry-sacek-quotpack-shopquot-stred-76826.html', '700 ks', 700, 8351.42, 0, true, 'dnes bereme po 500 ks', 20),
  ((SELECT id FROM recipe_ingredients WHERE code = 'krabice-3l'), 'Krabice 3 l na beginy, střední výpusť (zesílená) – Packshop', 'https://www.packshop.cz/z/bag-in-box-3l-zesil-krabice-stred-vypust-76780.html', '100 ks', 100, 1367.3, 0, false, NULL, 30),
  ((SELECT id FROM recipe_ingredients WHERE code = 'kapsicka-pruhledna-250'), 'Kapsička průhledná 250 ml – obalylevne.cz', 'https://obalylevne.cz/sacek-doypack-ciry-sroubovaci-uzaver', '25 ks', 25, 140, 0, false, NULL, 40),
  ((SELECT id FROM recipe_ingredients WHERE code = 'kapsicka-pruhledna-500'), 'Kapsička průhledná 500 ml – obalylevne.cz', 'https://obalylevne.cz/sacek-doypack-ciry-sroubovaci-uzaver', '25 ks', 25, 142, 0, false, NULL, 50),
  ((SELECT id FROM recipe_ingredients WHERE code = 'kapsicka-stribrna-750'), 'Kapsička stříbrná 750 ml – obalylevne.cz', 'https://www.obalylevne.cz/sacek-doypack-stribrny-sroubovaci-uzaver', '25 ks', 25, 231, 0, false, NULL, 60),
  ((SELECT id FROM recipe_ingredients WHERE code = 'trtinovy-cukr'), 'Třtinový cukr Demerara – byliny.cz', 'https://www.byliny.cz/trtinovy-cukr-demerara/', '50 kg', 50, 2298, 0, false, NULL, 70),
  ((SELECT id FROM recipe_ingredients WHERE code = 'trtinovy-cukr'), 'Třtinový cukr tmavý jemný – fitboy.cz', 'https://www.fitboy.cz/fitboy-trtinovy-cukr-tmavy-jemny-25kg/', '25 kg', 25, 999, 109, false, NULL, 80),
  ((SELECT id FROM recipe_ingredients WHERE code = 'trtinovy-cukr'), 'Třtinový cukr Demerara – prodejnabylin.cz', 'https://www.prodejnabylin.cz/trtinovy-cukr-demerara/', '75 kg', 75, 2970, 0, true, NULL, 90),
  ((SELECT id FROM recipe_ingredients WHERE code = 'lipovy-kvet'), 'Lípa květ celý 1 kg – Allegro', 'https://allegro.cz/nabidka/kvet-lipy-cely-1000g-lipa-kvety-caj-lipa-nachlazeni-1kg-jakost-16740935867', '1 kg', 1, 1111, 0, false, NULL, 100),
  ((SELECT id FROM recipe_ingredients WHERE code = 'lipovy-kvet'), 'Lípa květ řezaný 1 kg Grešík – bytovytextil.com', 'https://www.bytovytextil.com/p/142814/lipa-kvet-rezany-1-kg-gresik-j', '1 kg', 1, 788.48, 75, false, NULL, 110),
  ((SELECT id FROM recipe_ingredients WHERE code = 'lipovy-kvet'), 'Lípa květ řezaný 1 kg Grešík – mj-krasazdravi.cz', 'https://www.mj-krasazdravi.cz/gresik-lipa-kvet-rezany-1-kg/', '1 kg', 1, 776.97, 69, false, NULL, 120),
  ((SELECT id FROM recipe_ingredients WHERE code = 'ibisek'), 'Ibišek květ 1 kg – Allegro', 'https://allegro.cz/nabidka/suseny-ibisek-1kg-ibiskovy-kvet-prirodni-malva-caj-kvalita-kol-pol-7600195677', '1 kg', 1, 188, 0, false, NULL, 130),
  ((SELECT id FROM recipe_ingredients WHERE code = 'ibisek'), 'Ibišek květ 2,5 kg – Allegro Business', 'https://business.allegro.cz/nabidka/suseny-ibisek-2-5-kg-ibiskovy-kvet-prirodni-malva-caj-kol-pol-11721207630', '2,5 kg', 2.5, 409, 0, false, NULL, 140),
  ((SELECT id FROM recipe_ingredients WHERE code = 'sencha'), 'Sencha China zelený čaj 1 kg – profikoreni.cz', 'https://www.profikoreni.cz/Sencha-China-zeleny-caj-1kg-d5386.htm', '1 kg', 1, 329, 0, false, NULL, 150),
  (NULL, 'Matcha prášek 1 kg – Allegro Business', 'https://business.allegro.cz/produkt/matcha-mary-rose-1000-g-0165f65b-dc0a-44f6-ad25-3b8a3caf848b', '1 kg', 1, 513, 0, false, NULL, 160),
  ((SELECT id FROM recipe_ingredients WHERE code = 'hermanek'), 'Heřmánek pravý květ celý 5 kg – profikoreni.cz', 'https://www.profikoreni.cz/hermanek-pravy-kvet-cely-5-kg', '5 kg', 5, 3187, 0, false, NULL, 170),
  ((SELECT id FROM recipe_ingredients WHERE code = 'hermanek'), 'Heřmánek květ 1 kg – ceskejmed.cz', 'https://eshop.ceskejmed.cz/byliny-v-kg/hermanek-kvet-1-kg/', '1 kg', 1, 597, 65, false, NULL, 180),
  ((SELECT id FROM recipe_ingredients WHERE code = 'hermanek'), 'Heřmánek čaj 1 kg – Allegro Business', 'https://business.allegro.cz/nabidka/hermanek-caj-1-kg-hermankovy-kosicek-prirodni-kvet-polsky-18618024149', '1 kg', 1, 487, 0, false, NULL, 190),
  ((SELECT id FROM recipe_ingredients WHERE code = 'jasmin'), 'Jasmín květ celý – fitboy.cz', 'https://www.fitboy.cz/fitboy-jasmin-kvet-cely-100g/', '1 kg', 1, 540, 59, false, NULL, 200),
  ((SELECT id FROM recipe_ingredients WHERE code = 'jasmin'), 'Jasmín květ celý – quicktea.cz', 'https://www.quicktea.cz/jasmin-kvet---cely/', '1 kg', 1, 579, 29, false, NULL, 210),
  ((SELECT id FROM recipe_ingredients WHERE code = 'levandule'), 'Levandule květ 1 kg – profikoreni.cz', 'https://www.profikoreni.cz/Levandule-kvet-1kg-d5863.htm', '1 kg', 1, 359, 0, false, NULL, 220),
  ((SELECT id FROM recipe_ingredients WHERE code = 'levandule'), 'Levandule květ 5 kg – profikoreni.cz', 'https://www.profikoreni.cz/Levandule-kvet-5kg-d6354.htm', '5 kg', 5, 1685, 0, false, NULL, 230),
  ((SELECT id FROM recipe_ingredients WHERE code = 'medunka'), 'Meduňka lékařská nať 5 kg – profikoreni.cz', 'https://www.profikoreni.cz/Medunka-lekarska-nat-5kg-d7330.htm', '5 kg', 5, 1460, 0, false, NULL, 240),
  ((SELECT id FROM recipe_ingredients WHERE code = 'medunka'), 'Meduňka lékařská nať 1 kg – profikoreni.cz', 'https://www.profikoreni.cz/Medunka-lekarska-nat-1kg-d7329.htm', '1 kg', 1, 311, 0, false, NULL, 250),
  ((SELECT id FROM recipe_ingredients WHERE code = 'sipek'), 'Šípková růže plod 2 kg – Allegro Business', 'https://business.allegro.cz/produkt/caj-sipkova-ruze-greenok-place-susene-ovoce-1000-g-fb7665f6-4902-49ac-b37b-a5d31503f849', '1 kg', 1, 356, 0, false, 'v tabulce bylo množství 2 kg, odkaz zní na 1 000 g – ověřit', 260),
  ((SELECT id FROM recipe_ingredients WHERE code = 'sipek'), 'Šípková růže 5 kg – Allegro Business', 'https://business.allegro.cz/nabidka/sipkova-ruze-5000g-caj-ze-susenych-sipku-odolnost-5kg-17848542458', '5 kg', 5, 909, 0, false, NULL, 270),
  ((SELECT id FROM recipe_ingredients WHERE code = 'kokosove-mleko'), 'Kokosové mléko Real Thai 1 l – Allegro Business', 'https://business.allegro.cz/nabidka/kokosove-mleko-kokosove-mleko-kokosovy-extrakt-real-thai-1000-ml-1-l-14665315513', '1 l', 1, 90, 0, false, NULL, 280),
  ((SELECT id FROM recipe_ingredients WHERE code = 'kokosove-mleko'), 'Kokosové mléko Real Thai 1 l – Allegro Business', 'https://business.allegro.cz/nabidka/kokosove-mleko-real-thai-1l-kokosove-mleko-exoticka-chut-asie-15623424122', '1 l', 1, 86, 0, false, 'v akci 76 Kč', 290),
  ((SELECT id FROM recipe_ingredients WHERE code = 'golden-nepal'), 'Černý čaj Golden Nepal – expect.cz', 'https://www.expect.cz/cerny-caj-golden-nepal/', '1 kg', 1, 1230, 85, false, NULL, 300),
  ((SELECT id FROM recipe_ingredients WHERE code = 'golden-nepal'), 'Černý čaj Golden Nepal – oriental.cz', 'https://www.oriental.cz/p/cerny-caj-golden-nepal', '1 kg', 1, 1155, 54, false, NULL, 310),
  (NULL, 'Espresso CAFFE GRAND 70/30 – kava-kromeriz.cz', 'https://www.kava-kromeriz.cz/espresso-smes-caffe-grand-smes-arabica-robusta-70-30', '1,6 kg', 1.6, 1200, 0, false, 'French press', 320),
  ((SELECT id FROM recipe_ingredients WHERE code = 'lahudkove-drozdi'), 'Droždové vločky 1 kg – Allegro Business', 'https://business.allegro.cz/produkt/drozdove-vlocky-bazar-zdrowia-1000-g-e1915877-39af-4f95-97dd-406c665bd8a2', '1 kg', 1, 298, 0, false, NULL, 330),
  ((SELECT id FROM recipe_ingredients WHERE code = 'skorice'), 'Skořice mletá 1 kg – Allegro Business', 'https://business.allegro.cz/produkt/skorice-mleta-1kg-swojska-piwniczka-cdb749e1-492e-47a8-9757-4c74ea8316c4', '1 kg', 1, 108, 0, false, NULL, 340),
  ((SELECT id FROM recipe_ingredients WHERE code = 'zensen'), 'Eleuterokok (ženšen sibiřský) kořen 1 kg – Allegro Business', 'https://business.allegro.cz/produkt/eleuterokok-koren-sibirsky-zensen-1-kg-23ffd363-a8d9-4695-b2a9-3f86c4d8e4fd', '1 kg', 1, 427, 0, false, NULL, 350),
  ((SELECT id FROM recipe_ingredients WHERE code = 'zensen'), 'Ženšen sibiřský řezaný 1 kg Herbanordpol – Allegro Business', 'https://business.allegro.cz/produkt/zensen-sibirsky-herbanordpol-rezany-1kg-33ff7df9-4a68-49c7-9ef5-689be6b139a4', '1 kg', 1, 374, 0, false, NULL, 360),
  ((SELECT id FROM recipe_ingredients WHERE code = 'chilli'), 'Chilli mleté 1 kg Agnex – Allegro Business', 'https://business.allegro.cz/produkt/paprika-chilli-1-kg-mleta-chilli-v-prasku-agnex-f3242cf4-6592-4acd-9f41-59cf619d4fd6', '1 kg', 1, 122, 0, false, NULL, 370),
  ((SELECT id FROM recipe_ingredients WHERE code = 'morska-sul'), 'Mořská sůl hrubá 2–4 mm 5 kg – profikoreni.cz', 'https://www.profikoreni.cz/morska-sul-hruba-2-4-mm-turecko-5-kg', '5 kg', 5, 130, 0, false, NULL, 380),
  ((SELECT id FROM recipe_ingredients WHERE code = 'morska-sul'), 'Mořská sůl hrubá 2–4 mm 25 kg – profikoreni.cz', 'https://www.profikoreni.cz/morska-sul-hruba-2-4-mm-turecko-25-kg', '25 kg', 25, 591, 109, false, NULL, 390),
  ((SELECT id FROM recipe_ingredients WHERE code = 'pepr-cerny'), 'Pepř černý mletý 1 kg – Allegro Business', 'https://business.allegro.cz/nabidka/pepr-cerny-mlety-1-kg-aromaticky-prirodni-15862995496', '1 kg', 1, 276, 0, false, NULL, 400),
  ((SELECT id FROM recipe_ingredients WHERE code = 'pepr-cerny'), 'Pepř černý mletý 1 kg Agnex – Allegro Business', 'https://business.allegro.cz/produkt/pepr-cerny-mlety-agnex-1000-g-6687e468-e20e-46a9-9097-3533bdee5924', '1 kg', 1, 285, 0, false, 'stejný e-shop jako papriky, majoránka, chilli, kmín', 410),
  ((SELECT id FROM recipe_ingredients WHERE code = 'kmin'), 'Kmín mletý 1 kg – Allegro Business', 'https://business.allegro.cz/nabidka/mlety-kmin-1000-g-1-kg-prirodni-aroma-kvalita-11799084467', '1 kg', 1, 98, 0, false, 'stejný e-shop jako papriky, chilli, pepř', 420),
  ((SELECT id FROM recipe_ingredients WHERE code = 'majoranka'), 'Majoránka 1 kg Agnex – Allegro Business', 'https://business.allegro.cz/produkt/majoranka-agnex-1000-g-susena-80a82c22-711b-4cb4-9895-a7dd244bbfd6', '1 kg', 1, 137, 0, false, 'stejný e-shop jako papriky, chilli, kmín', 430),
  ((SELECT id FROM recipe_ingredients WHERE code = 'libecek'), 'Libeček 200 g – profikoreni.cz', 'https://www.profikoreni.cz/Libecek-200g-d393.htm', '200 g', 0.2, 81, 0, false, NULL, 440),
  ((SELECT id FROM recipe_ingredients WHERE code = 'libecek'), 'Libeček 500 g – profikoreni.cz', 'https://www.profikoreni.cz/Libecek-500g-d733.htm', '500 g', 0.5, 164, 0, false, NULL, 450),
  (NULL, 'Nové koření celé 500 g – profikoreni.cz', 'https://www.profikoreni.cz/Nove-koreni-cele-500g-d764.htm', '500 g', 0.5, 194, 0, false, NULL, 460),
  (NULL, 'Bobkový list celý 500 g – profikoreni.cz', 'https://www.profikoreni.cz/Bobkovy-list-cely-500g-d690.htm', '500 g', 0.5, 175, 0, false, NULL, 470),
  (NULL, 'Kurkuma mletá 2 % 500 g – profikoreni.cz', 'https://www.profikoreni.cz/kurkuma-mleta-2-500g', '500 g', 0.5, 92, 0, false, NULL, 480),
  ((SELECT id FROM recipe_ingredients WHERE code = 'paprika-uzena'), 'Paprika uzená sladká 1 kg Agnex – Allegro Business', 'https://business.allegro.cz/produkt/paprika-uzena-sladka-agnex-1000-g-f6f8dc50-ac46-443a-a0c8-5a23b3ab0d05?offerId=6898027011', '1 kg', 1, 155, 0, false, NULL, 490),
  ((SELECT id FROM recipe_ingredients WHERE code = 'paprika-sladka'), 'Paprika sladká mletá 1 kg Agnex – Allegro Business', 'https://business.allegro.cz/produkt/paprika-cervena-sladka-mleta-agnex-1000-g-dab17510-0068-476d-ae55-d00a16d3fab9', '1 kg', 1, 154, 0, false, NULL, 500),
  ((SELECT id FROM recipe_ingredients WHERE code = 'paprika-sladka'), 'Paprika sladká mletá 500 g Brat – Allegro Business', 'https://business.allegro.cz/produkt/sladka-mleta-paprika-brat-500-g-f3023e09-c62a-4d0c-bc7b-1af800c22f41', '500 g', 0.5, 82, 0, false, NULL, 510),
  ((SELECT id FROM recipe_ingredients WHERE code = 'badyan'), 'Badyán mletý 1 kg – profikoreni.cz', 'https://www.profikoreni.cz/Badyan-mlety-1kg-d5313.htm', '1 kg', 1, 432, 0, false, NULL, 520),
  ((SELECT id FROM recipe_ingredients WHERE code = 'badyan'), 'Badyán mletý 500 g – profikoreni.cz (č. G00283-500)', NULL, '500 g', 0.5, 227, 0, false, 'bez dopravy; cena 16. 11. 2026', 530),
  ((SELECT id FROM recipe_ingredients WHERE code = 'muskatovy-orisek'), 'Muškátový oříšek mletý 500 g – Allegro Business', 'https://business.allegro.cz/nabidka/muskatovy-orisek-500-g-mlety-vysoka-kvalita-11799292580', '500 g', 0.5, 184, 0, false, NULL, 540),
  ((SELECT id FROM recipe_ingredients WHERE code = 'zazvor-mlety'), 'Zázvor mletý 5 kg – koreniprovareni.cz', 'https://www.koreniprovareni.cz/koreni-a-prisady/zazvor-mlety/', '5 kg', 5, 810, 78, false, NULL, 550),
  ((SELECT id FROM recipe_ingredients WHERE code = 'zazvor-mlety'), 'Zázvor mletý 5 kg – profikoreni.cz', 'https://www.profikoreni.cz/Zazvor-mlety-5-Kg-d1543.htm', '5 kg', 5, 1164, 0, false, NULL, 560),
  ((SELECT id FROM recipe_ingredients WHERE code = 'kardamom'), 'Kardamom mletý 1 kg – profikoreni.cz', 'https://www.profikoreni.cz/Kardamom-mlety-1kg-d1119.htm', '1 kg', 1, 1361, 0, false, NULL, 570),
  ((SELECT id FROM recipe_ingredients WHERE code = 'kardamom'), 'Kardamom mletý 100 g – Allegro Business', 'https://business.allegro.cz/produkt/kardamom-mlety-kol-pol-100-g-nesireny-vegansky-5efc12c5-d461-4e56-8033-fd55bf81b067', '100 g', 0.1, 126, 0, false, NULL, 580),
  ((SELECT id FROM recipe_ingredients WHERE code = 'vanilka'), 'Vanilka mletá 50 g – profikoreni.cz', 'https://www.profikoreni.cz/Vanilka-mleta-50g-d6780.htm', '50 g', 0.05, 372, 0, false, 'v tabulce zapsáno jako 0,5 kg; odkaz je 50 g', 590),
  ((SELECT id FROM recipe_ingredients WHERE code = 'vanilka'), 'Vanilka – Allegro Business', 'https://business.allegro.cz/produkt/vanilka-winoszarnia-10-g-0b3e9956-da7b-4be8-8882-216262b79869', 'ověřit balení', 0.05, 340, 0, false, 'v tabulce 6 800 Kč/kg, odkaz zní na 10 g – ověřit', 600),
  ((SELECT id FROM recipe_ingredients WHERE code = 'hrebicek'), 'Hřebíček mletý 1 kg Planteon – Allegro Business', 'https://business.allegro.cz/produkt/mlety-hrebicek-planteon-1000-g-63905bf5-a93c-4501-9804-70d1adb08e7f', '1 kg', 1, 217, 55, false, NULL, 610),
  (NULL, 'Hřebíček celý 500 g – profikoreni.cz', 'https://www.profikoreni.cz/Hrebicek-cely-500g-d717.htm', '500 g', 0.5, 305, 0, false, NULL, 620),
  ((SELECT id FROM recipe_ingredients WHERE code = 'caga'), 'Čaga granule 1 kg – Allegro Business', 'https://business.allegro.cz/produkt/caga-houbovite-sibirske-granule-100-prirodni-1kg-0f565832-39d8-4356-ae94-59d0d2f3f586', '1 kg', 1, 675, 0, false, NULL, 630),
  ((SELECT id FROM recipe_ingredients WHERE code = 'caga'), 'Čaga (rezavec šikmý) 5 kg – profikoreni.cz', 'https://www.profikoreni.cz/houba-chaga-rezavec-sikmy-caga-sibirska-5-kg', '5 kg', 5, 3879, 0, false, NULL, 640),
  ((SELECT id FROM recipe_ingredients WHERE code = 'olivovy-olej'), 'Olivový olej pomace 1 l – Allegro Business', 'https://business.allegro.cz/nabidka/olivovy-olej-pomace-1-l-pro-studene-smazeni-12305588823', '1 l', 1, 121, 0, false, NULL, 650),
  ((SELECT id FROM recipe_ingredients WHERE code = 'olivovy-olej'), 'Olivový olej z výlisků Gran Olivo 1 l – Allegro', 'https://allegro.cz/produkt/gran-olivo-olej-olivovy-z-vylisku-pomace-1-l-08782bc3-5c3e-4e3d-a5b7-017ce1d1a73d', '1 l', 1, 90, 0, false, NULL, 660),
  ((SELECT id FROM recipe_ingredients WHERE code = 'dynovy-olej'), 'Dýňový olej za studena 500 ml – Allegro Business', 'https://business.allegro.cz/nabidka/dynovy-olej-za-studena-lisovany-500-ml-8887101629', '0,5 l', 0.5, 225, 0, false, NULL, 670),
  ((SELECT id FROM recipe_ingredients WHERE code = 'dynovy-olej'), 'Dýňový olej 2 × 1 l – Allegro Business', 'https://business.allegro.cz/nabidka/dynovy-olej-2x1000-ml-lisovany-za-studena-nerafinovany-18295041061', '2 l', 2, 912, 0, false, NULL, 680),
  ((SELECT id FROM recipe_ingredients WHERE code = 'citronova-stava'), 'Citronová šťáva Sadvit 5 l – Allegro', 'https://allegro.cz/nabidka/dp-citronova-stava-sadvit-5-l-15470941028', '5 l', 5, 338, 0, false, NULL, 690),
  ((SELECT id FROM recipe_ingredients WHERE code = 'citronova-stava'), 'Citronová šťáva 100 % NFC 5 l – Allegro Business', 'https://business.allegro.cz/nabidka/citronova-stava-100-5-l-sour-citronova-stava-lisovani-nfc-citron-15403051442', '5 l', 5, 287, 0, false, 'od 2 ks doprava zdarma', 700),
  ((SELECT id FROM recipe_ingredients WHERE code = 'citronova-stava'), 'Citronová šťáva 100 % lisovaná NFC 5 l – Allegro', 'https://allegro.cz/produkt/citronova-stava-100-5-l-lisovana-nfc-e24808ab-e192-452b-ac8b-53ad9a46239f', '5 l', 5, 317, 0, false, NULL, 710),
  ((SELECT id FROM recipe_ingredients WHERE code = 'jablecna-stava'), 'Jablečná šťáva Sadvit – Allegro Business', 'https://business.allegro.cz/produkt/jablecna-stava-sadvit-5000-ml-a2dbd143-a1a2-42bc-a6a0-35aa997e4c10', '10 l', 10, 280, 55, false, NULL, 720),
  ((SELECT id FROM recipe_ingredients WHERE code = 'jablecna-stava'), 'Lisovaná šťáva z jablek 100 % NFC – Allegro Business', 'https://business.allegro.cz/nabidka/lisovana-stava-z-jablek-100-5-l-jablecny-nfc-14772454171', '10 l', 10, 312, 0, false, NULL, 730),
  ((SELECT id FROM recipe_ingredients WHERE code = 'jablecno-malinova-stava'), 'Šťáva jablko-malina 85/15 lisovaná 2 × 5 l – Allegro', 'https://allegro.cz/produkt/stava-jablko-malina-lisovana-prirodni-100-5-l-s-malinou-malinova-pro-rodinu-8971a947-7241-48ff-b276-e32f24ada163', '10 l (2 × 5 l)', 10, 418, 55, false, 'nákup Lucie 17. 11. 2026 – 473 Kč celkem', 740),
  ((SELECT id FROM recipe_ingredients WHERE code = 'jablecno-malinova-stava'), 'Šťáva jablko-malina 80/20 – Allegro Business', 'https://business.allegro.cz/nabidka/jablko-malinova-stava-5-l-prirodni-lisovana-nfc-11753392742', '10 l', 10, 574, 0, false, 'poměr 80/20', 750),
  ((SELECT id FROM recipe_ingredients WHERE code = 'jablecno-malinova-stava'), 'Šťáva jablko-malina 80/20 bag-in-box – Allegro Business', 'https://business.allegro.cz/nabidka/stava-jablko-malina-100-5-l-lisovana-bib-9565761032', '10 l', 10, 584, 0, false, 'poměr 80/20', 760),
  ((SELECT id FROM recipe_ingredients WHERE code = 'pomerancova-stava'), 'Pomerančový džus 100 % NFC Pure Press 5 l – Allegro', 'https://allegro.cz/produkt/pomerancovy-dzus-100-lisovany-nfc-5-l-pure-press-3266b0ae-189f-4ca9-b8e0-eeb79962cc9f', '5 l', 5, 313, 0, false, NULL, 770),
  ((SELECT id FROM recipe_ingredients WHERE code = 'pomerancova-stava'), 'Pomerančový džus Sadvit 100 % NFC – Allegro', 'https://allegro.cz/nabidka/sadvit-pomerancovy-dzus-100-nfc-lisovany-bez-cukru-a-konzervantu-5000-ml-17301290516', '10 l', 10, 588, 55, false, NULL, 780),
  ((SELECT id FROM recipe_ingredients WHERE code = 'pomerancova-stava'), 'Pomerančový džus z koncentrátu Purena 5 l – Allegro Business', 'https://business.allegro.cz/nabidka/pomerancovy-dzus-100-ze-zahustene-stavy-bez-pridaneho-cukru-purena-5-l-18295488649', '5 l', 5, 139, 0, false, 'z koncentrátu – ten používáme', 790),
  ((SELECT id FROM recipe_ingredients WHERE code = 'grepova-stava'), 'Grepová šťáva 100 % NFC 5 l – Allegro Business', 'https://business.allegro.cz/produkt/100-grepova-stava-5-l-prirodni-lisovana-nfc-27b4e82b-eaa5-474c-902b-d669635558e7?offerId=11750958764', '5 l', 5, 428, 0, false, 'jediná dlouhodobě dostupná (Sadvit vyprodaný)', 800),
  ((SELECT id FROM recipe_ingredients WHERE code = 'brusinkova-stava'), 'Brusinková šťáva Sadvit 100 % 1,5 l – Allegro', 'https://allegro.cz/nabidka/stava-brusinky-sadvit-100-prirodni-veganska-vysoky-obsah-vitaminu-1-5-l-17201291712', '1,5 l', 1.5, 238, 0, false, NULL, 810),
  ((SELECT id FROM recipe_ingredients WHERE code = 'granatova-stava'), 'Granátová šťáva 100 % NFC 3 l – Allegro Business', 'https://business.allegro.cz/nabidka/granatova-stava-100-3-l-granatova-prirodni-nfc-12818007606', '3 l', 3, 347, 0, false, NULL, 820),
  ((SELECT id FROM recipe_ingredients WHERE code = 'geranium-eo'), 'EO geranium bourbon Terpenic 10 ml – aromatics.cz', 'https://aromatics.cz/produkt/esencialni-olej-geranium-bourbon-vnejsi-vnitrni-uziti/', '10 ml (250 kapek)', 250, 430, 0, false, NULL, 830),
  ((SELECT id FROM recipe_ingredients WHERE code = 'geranium-eo'), 'EO geranium bourbon Terpenic 30 ml – aromatics.cz', 'https://aromatics.cz/produkt/esencialni-olej-geranium-bourbon-vnejsi-vnitrni-uziti/', '30 ml (750 kapek)', 750, 1068, 0, false, NULL, 840),
  ((SELECT id FROM recipe_ingredients WHERE code = 'mandarinka-eo'), 'EO mandarinka červená BIO Terpenic 30 ml – aromatics.cz', 'https://aromatics.cz/produkt/esencialni-olej-mandarinka-cervena-bio/', '30 ml (750 kapek)', 750, 720, 0, false, NULL, 850),
  ((SELECT id FROM recipe_ingredients WHERE code = 'mandarinka-eo'), 'EO mandarinka červená BIO Terpenic 100 ml – aromatics.cz', 'https://aromatics.cz/produkt/esencialni-olej-mandarinka-cervena-bio/', '100 ml (2 500 kapek)', 2500, 1927, 0, true, 'počítáme podle 30 ml', 860),
  ((SELECT id FROM recipe_ingredients WHERE code = 'grep-eo'), 'EO grep Terpenic 30 ml – aromatics.cz', 'https://aromatics.cz/produkt/esencialni-olej-grep-potr-kvalita/', '30 ml (750 kapek)', 750, 424, 0, false, NULL, 870),
  ((SELECT id FROM recipe_ingredients WHERE code = 'grep-eo'), 'EO grep Terpenic 100 ml – aromatics.cz', 'https://aromatics.cz/produkt/esencialni-olej-grep-potr-kvalita/', '100 ml (2 500 kapek)', 2500, 1224, 0, true, 'počítáme podle 30 ml', 880),
  (NULL, 'EO libeček Terpenic 5 ml – aromatics.cz', 'https://aromatics.cz/produkt/esencialni-olej-libecek/', '5 ml (125 kapek)', 125, 1040, 0, false, 'není na vnitřní užití', 890),
  ((SELECT id FROM recipe_ingredients WHERE code = 'koriandr-eo'), 'EO koriandr list Bewit 15 ml – bewit.love', 'https://bewit.love/produkt/bewit-koriandr-sety-esencialni-olej', '15 ml (375 kapek)', 375, 366, 0, false, NULL, 900),
  (NULL, 'EO rozmarýn cineol BIO Terpenic 30 ml – aromatics.cz', 'https://aromatics.cz/produkt/esencialni-olej-rozmaryn-bio/', '30 ml (750 kapek)', 750, 572, 0, false, NULL, 910),
  ((SELECT id FROM recipe_ingredients WHERE code = 'bazalka-eo'), 'EO bazalka pravá Bewit 15 ml – bewit.love', 'https://bewit.love/produkt/bazalka-esencialni-olej', '15 ml (375 kapek)', 375, 301, 0, false, NULL, 920),
  ((SELECT id FROM recipe_ingredients WHERE code = 'bazalka-eo'), 'EO bazalka tropická Terpenic 30 ml – aromatics.cz', 'https://aromatics.cz/produkt/esencialni-olej-bazalka-tropicka-vnejsi-vnitrni-uziti', '30 ml (750 kapek)', 750, 560, 0, true, 'jiný druh bazalky (tropická)', 930),
  ((SELECT id FROM recipe_ingredients WHERE code = 'kyselina-askorbova'), 'Kyselina L-askorbová (vitamin C) 1 kg – Allegro Business', 'https://business.allegro.cz/nabidka/vitamin-c-kyselina-l-askorbova-1-kg-100-cisty-prirodni-vitamin-v-prasku-16743492340', '1 kg', 1, 108, 65, false, NULL, 940),
  (NULL, 'Kyselina citronová 1 kg Agnex – Allegro Business', 'https://business.allegro.cz/produkt/kyselina-citronova-agnex-1-kg-fe13e882-93ef-463f-a0b0-47fb00cd3fcd', '1 kg', 1, 55, 0, false, NULL, 950),
  (NULL, 'Plastové lahve PET 0,5 l – shop-obaly.cz', 'https://www.shop-obaly.cz/lahvicka-pet-05l-rovna-transparentni-p-58.html', '221 ks', 221, 1177, 109, false, NULL, 960),
  (NULL, 'Víčka na PET lahve – shop-obaly.cz', 'https://www.shop-obaly.cz/vicko-pet-lahvicku-025l-05l-hdpe-zelene-nove-p-16787.html', 'balení', 1, 167, 0, false, 'počet kusů v tabulce chybí', 970),
  (NULL, 'Papírové kelímky 300 ml – shop-obaly.cz', 'https://www.shop-obaly.cz/kelimek-papirovy-300350ml-12oz-90mm-kraft-hnedy-logo-p-9510.html', '50 ks', 50, 90.68, 0, false, NULL, 980),
  (NULL, 'Víčka na papírové kelímky 300 ml – shop-obaly.cz', 'https://www.shop-obaly.cz/vicko-papirove-otvorem-kelimek-papirovy-20oz-90mm-bile-p-12378.html', '50 ks', 50, 72.6, 0, false, NULL, 990),
  (NULL, 'Papírové kelímky 400 ml – shop-obaly.cz', 'https://www.shop-obaly.cz/kelimek-papirovy-400450ml-16oz-90mm-kraft-hnedy-logo-p-9511.html', '50 ks', 50, 124.05, 0, false, NULL, 1000),
  (NULL, 'Papírová miska na polévku 450 ml – shop-obaly.cz', 'https://www.shop-obaly.cz/miska-papirova-polevku-450ml-110mm-kraft-hneda-p-5494.html', '50 ks', 50, 130.68, 0, false, NULL, 1010),
  (NULL, 'Víčka na papírové misky – shop-obaly.cz', 'https://www.shop-obaly.cz/vicko-misku-papirovou-350-550ml-110mm-transparentni-p-1622.html', '50 ks', 50, 91.36, 0, false, NULL, 1020),
  (NULL, 'Papírový podnos na 2 kávy – shop-obaly.cz', 'https://www.shop-obaly.cz/podnos-2ks-kavy-papirovy-210x110mm-p-11036.html', '200 ks', 200, 479.16, 0, false, NULL, 1030),
  (NULL, 'Etikety Brother QL-800 DK-22251 (s červenou) – Allegro Business', 'https://business.allegro.cz/produkt/paska-fotoenergia-pro-brother-ql-dk-22251-62-mm-x-15-24-m-cervena-a-cerna-c1ec26ef-5743-44a0-92a3-f93bb8ad8d8f', '1 role', 1, 259, 0, false, NULL, 1040),
  (NULL, 'Etikety Brother QL-800 DK-22251 (s červenou) – cdrmarket.cz', 'https://www.cdrmarket.cz/kompatibilni-role-etiket-pro-brother-dk-22251-62mm-x-15-24m-cerveno-cerny-tisk/', '1 role', 1, 329, 0, false, NULL, 1050),
  (NULL, 'Etikety Brother QL-800 DK-22251 (s červenou), termo páska s držákem – Allegro Business', NULL, '1 role (15,24 m)', 1, 260, 59, false, 'doprava Zásilkovna 59 Kč se dělí počtem rolí v objednávce; odkaz doplnit', 1060),
  (NULL, 'Etikety Brother QL-800 DK-22212 (černobílé) – Allegro Business', 'https://business.allegro.cz/nabidka/termo-paska-pro-brother-ql-dk-22212-62-mmx15-24-12418893383', '1 role', 1, 187, 0, false, NULL, 1070),
  (NULL, 'Etikety Brother QL-800 DK-22212 (černobílé) – cdrmarket.cz', 'https://www.cdrmarket.cz/kompatibilni-role-etiket-pro-brother-dk-22212-62mm-x-15-24m-plast-bila/', '1 role', 1, 199, 0, false, NULL, 1080),
  ((SELECT id FROM recipe_ingredients WHERE code = 'vodka'), 'Vodka – BILLA', NULL, '0,5 l', 0.5, 129.9, 0, false, 'kupuje se v BILLA', 1090),
  ((SELECT id FROM recipe_ingredients WHERE code = 'aperol'), 'Aperol Aperitivo 1 l – alkohol.cz', 'https://www.alkohol.cz/produkty/aperol-aperitivo-1l-11-9186/', '1 l', 1, 359, 0, false, NULL, 1100)
) AS v(ingredient_id, item_name, url, pack_label, pack_qty, price_kc, shipping_kc, is_promo, note, sort)
WHERE NOT EXISTS (SELECT 1 FROM recipe_offers);

UPDATE recipe_ingredients SET note = NULL, updated_at = now() WHERE note IS NOT NULL;
UPDATE recipe_ingredients SET price_kc = 329, updated_at = now() WHERE code = 'sencha';
UPDATE recipe_ingredients SET price_kc = 292, updated_at = now() WHERE code = 'medunka';
UPDATE recipe_ingredients SET price_kc = 85.6, updated_at = now() WHERE code = 'grepova-stava';
UPDATE recipe_ingredients SET price_kc = 47.3, updated_at = now() WHERE code = 'jablecno-malinova-stava';
COMMIT;
SELECT (SELECT count(*) FROM recipe_offers) AS nabidek,
       (SELECT count(*) FROM recipe_offers WHERE ingredient_id IS NOT NULL) AS u_surovin,
       (SELECT string_agg(code || ' ' || price_kc, ', ') FROM recipe_ingredients WHERE code IN ('sencha','medunka','grepova-stava','jablecno-malinova-stava')) AS nove_ceny;
