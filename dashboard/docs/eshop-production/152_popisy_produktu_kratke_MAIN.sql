-- 152: Nové krátké popisy produktů (Lucie „ano“ 25. 11. 2026): jeden odstavec, bez procent,
-- bez seznamů „Pro koho“, „Jak ho používat“ a „Zlaté pravidlo“.
-- Spouštět v Neon → SQL Editor → větev main → Run.
DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;

UPDATE products p SET description = ARRAY[v.popis], updated_at = now()
FROM (VALUES
  ('bylinny-sirup-saman', $t$Náš nejvýraznější sirup. Šípek, čaga, ženšen a zázvor mu dávají hlubokou, kořeněnou chuť s dlouhým dozvukem. Vaříme ho z čisté filtrované vody, bez umělých aromat a barviv. Na sklenici stačí 20 ml sirupu doplnit vodou na 200 ml – horkou místo čaje, nebo studenou perlivou s ledem a citronem.$t$),
  ('zazvorovy-sirup', $t$Silný, intenzivní sirup ze zázvoru, třtinového cukru a citronové šťávy. Vaříme ho z čisté filtrované vody, bez umělých aromat a barviv. Na sklenici stačí 20 ml sirupu doplnit vodou na 200 ml – studenou perlivou na zázvorovou limonádu, horkou místo čaje.$t$),
  ('lipovy-sirup', $t$Jemný sirup z lipového květu, třtinového cukru a citronové šťávy. Vaříme ho z čisté filtrované vody, bez umělých aromat a barviv. Na sklenici stačí 20 ml sirupu doplnit vodou na 200 ml – studenou s ledem a mátou, horkou místo čaje.$t$),
  ('ibiskovy-sirup', $t$Sytě rubínový sirup z květů ibišku, třtinového cukru a citronové šťávy. Vaříme ho z čisté filtrované vody, bez umělých aromat a barviv. Na sklenici stačí 20 ml sirupu doplnit vodou na 200 ml – studenou s ledem a citronem, horkou jako ibiškový čaj.$t$),
  ('sipkovy-sirup', $t$Sirup ze šípku, třtinového cukru a citronové šťávy, s plnou šípkovou chutí. Vaříme ho z čisté filtrované vody, bez umělých aromat a barviv. Na sklenici stačí 20 ml sirupu doplnit vodou na 200 ml – horkou jako šípkový čaj, studenou s citronem.$t$),
  ('hermankovy-sirup', $t$Jemný sirup z květů heřmánku, třtinového cukru a citronové šťávy, s typickou heřmánkovou vůní. Vaříme ho z čisté filtrované vody, bez umělých aromat a barviv. Na sklenici stačí 20 ml sirupu doplnit vodou na 200 ml – horkou místo čaje, studenou s citronem.$t$),
  ('medunkovy-sirup-s-levanduli', $t$Bylinný sirup z meduňky a květů levandule, s třtinovým cukrem a citronovou šťávou. Vaříme ho z čisté filtrované vody, bez umělých aromat a barviv. Na sklenici stačí 20 ml sirupu doplnit vodou na 200 ml – studenou s ledem a citronem, horkou místo čaje.$t$),
  ('lipovy-caj', $t$Jemný čaj z lipového květu s citronem, lehce oslazený třtinovým cukrem. Vaříme ho z čisté filtrované vody, bez umělých aromat a barviv. Na zimní večery ho ohřejte, v létě si ho dejte s ledem.$t$),
  ('bylinny-caj-saman', $t$Výrazný bylinný čaj ze šípku, čagy, ženšenu a zázvoru, lehce oslazený třtinovým cukrem. Vaříme ho z čisté filtrované vody, bez umělých aromat a barviv. Na zimní večery ho ohřejte, v létě si ho dejte s ledem.$t$),
  ('zazvorovy-caj', $t$Zázvorový čaj s citronem, lehce oslazený třtinovým cukrem. Vaříme ho z čisté filtrované vody, bez umělých aromat a barviv. Horký zahřeje, s ledem osvěží.$t$),
  ('hermankovy-caj', $t$Jemný čaj z květů heřmánku s citronem, lehce oslazený třtinovým cukrem. Vaříme ho z čisté filtrované vody, bez umělých aromat a barviv. Na zimní večery ho ohřejte, v létě si ho dejte s ledem.$t$),
  ('ibiskovy-caj', $t$Sytě rubínový čaj z květů ibišku s citronem, lehce oslazený třtinovým cukrem. Vaříme ho z čisté filtrované vody, bez umělých aromat a barviv. V létě s ledem, v zimě ohřátý.$t$),
  ('medunkovy-caj-s-levanduli', $t$Bylinný čaj z meduňky a květů levandule s citronem, lehce oslazený třtinovým cukrem. Vaříme ho z čisté filtrované vody, bez umělých aromat a barviv. Na zimní večery ho ohřejte, v létě si ho dejte s ledem.$t$),
  ('cerny-caj-golden-nepal', $t$Černý čaj Golden Nepal z nepálských hor s citronem, lehce oslazený třtinovým cukrem. Vaříme ho z čisté filtrované vody, bez umělých aromat a barviv. S ledem osvěží, ohřátý zahřeje. Obsahuje kofein.$t$),
  ('jasminovy-zeleny-caj', $t$Zelený čaj Sencha s květy jasmínu a citronem, lehce oslazený třtinovým cukrem. Vaříme ho z čisté filtrované vody, bez umělých aromat a barviv. S ledem osvěží, ohřátý zahřeje. Obsahuje kofein.$t$),
  ('cervankove-nebe', $t$Jablečno-malinový nápoj s kapkou citronu. Mícháme ho z čisté filtrované vody, bez umělých aromat a barviv a bez přidaného cukru – obsahuje jen přirozeně se vyskytující cukry z ovoce. Nejlepší je vychlazený s ledem.$t$),
  ('dum-u-jezera', $t$Grepový nápoj s jablkem a citronem, svěží a méně sladký, připomíná letní střik. Mícháme ho z čisté filtrované vody, bez umělých aromat a barviv a bez přidaného cukru – obsahuje jen přirozeně se vyskytující cukry z ovoce. Nejlepší je vychlazený s ledem.$t$),
  ('malinovy-svarak-nealko', $t$Svařák bez alkoholu z malin, jablek a pomeranče, s hřebíčkem, skořicí a badyánem. Bez umělých aromat a barviv a bez přidaného cukru – obsahuje jen přirozeně se vyskytující cukry z ovoce. Stačí ohřát a nalít do hrnku, dá se pít i vychlazený.$t$),
  ('svarak-deluxe', $t$Svařák z červeného vína s pomerančovou, grepovou a citronovou šťávou. Skořice, hřebíček, badyán, kardamom, zázvor a vanilka mu dávají plnou kořeněnou vůni. Bez umělých aromat a barviv. Stačí ohřát a nalít do hrnku, dobrý je i vychlazený s ledem.$t$),
  ('lady-carneval', $t$Grepový koktejl s vodkou a Aperolem, dochucený citronem. Svěží a výrazně citrusový, s typickou chutí Aperolu. Stačí nalít do sklenice s ledem.$t$),
  ('granatovy-bond', $t$Ovocný koktejl s vodkou a šťávou z granátového jablka, dochucený citronem. Mícháme ho z čisté filtrované vody, bez umělých aromat a barviv. Stačí nalít do sklenice s ledem.$t$),
  ('kosmopolitan', $t$Brusinkový koktejl s vodkou, jablečnou a citronovou šťávou. Mícháme ho z čisté filtrované vody, bez umělých aromat a barviv. Stačí nalít do sklenice s ledem.$t$),
  ('dynova-polevka', $t$Naše nejprodávanější polévka. Plná dýně zjemněná kokosovým mlékem, výraznou chuť jí dodává zázvor, chilli, muškátový oříšek a hřebíček. Vaříme ji z čisté filtrované vody a je 100% rostlinná. Natočte si z kohoutku, ohřejte a je hotovo.$t$),
  ('rajcatova-polevka', $t$Poctivá rajská s velkým podílem rajčat. Kokosové mléko ji zjemní, libeček, kardamom a hřebíček jí dávají vlastní vůni. Vaříme ji z čisté filtrované vody a je 100% rostlinná. Natočte si z kohoutku, ohřejte a je hotovo.$t$),
  ('gulasova-polevka-z-hlivy-ustricne', $t$Sytá, pikantní gulášová polévka bez masa. Plnou chuť jí dává hlíva ústřičná, uzená paprika, majoránka a kmín. Vaříme ji z čisté filtrované vody a je 100% rostlinná. Natočte si z kohoutku, ohřejte a je hotovo.$t$),
  ('rajcatova-polevka-s-cervenou-repou', $t$Jemná rajčatová polévka, které červená řepa dává sladší chuť a sytou barvu. Brambory a kokosové mléko ji dělají krémovou. Vaříme ji z čisté filtrované vody a je 100% rostlinná. Natočte si z kohoutku, ohřejte a je hotovo.$t$),
  ('kulajda', $t$Krémová kulajda plná brambor a žampionů, provoněná koprem. Vaříme ji z čisté filtrované vody a je 100% rostlinná. Natočte si z kohoutku, ohřejte a je hotovo.$t$),
  ('spenatova-polevka', $t$Krémová špenátová polévka s bramborami a kokosovým mlékem, dochucená česnekem a majoránkou. Vaříme ji z čisté filtrované vody a je 100% rostlinná. Natočte si z kohoutku, ohřejte a je hotovo.$t$)
) AS v(slug, popis)
WHERE p.slug = v.slug
RETURNING p.name;
