-- Registr „Kontrola e-shopu – Lucie“ v /prace (8. 11. 2026): 16 karet
-- BEG-01…BEG-16 s výsledkem auditu (technický stav, co je hotové, co zbývá,
-- co Lucie otestuje, odkazy na PR a produkční stránky).
--
-- Karty jsou obyčejné úkoly work_tasks přidělené Lucii (zadal Jaroslav
-- Viner). Kontrola Lucie = stav úkolu: „Čeká na kontrolu Lucie“; schválit
-- nebo vrátit k opravě může jen ona sama v MojeBegina. Nic se nemaže.
--
-- SPUSTIT CELÝ v Neon SQL Editoru na větvi main (Production) — AŽ PO
-- nasazení úpravy /prace (Lucie musí být mezi přidělenými). Jedna
-- transakce; když registr už existuje, NEZMĚNÍ SE NIC.
BEGIN;

DO $$
DECLARE
  viner text := 'de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c';
  lucie text := 'f9f93f03-92b0-4724-becd-c0a3576b5275';
  n int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = lucie) OR NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = viner) THEN
    RAISE EXCEPTION 'Účet Lucie nebo Jarina nenalezen — zastavuji, nic se nezměnilo.';
  END IF;
  IF EXISTS (SELECT 1 FROM work_tasks WHERE title ~ '^BEG-[0-9]{2}' AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Registr Kontrola e-shopu už existuje — zastavuji, nic se nezměnilo.';
  END IF;

  WITH karty(title, description, priority) AS (
    VALUES
    ($k$BEG-01 – Nákup alkoholických koktejlů a ovocných nápojů, varianty a pokladna$k$, $k$Priorita: P0
Technický stav: NASAZENO – ČEKÁ NA KONTROLU LUCIE
Odpovědný: Claude (kód) · Jarin (data produktů)

Hotovo:
- 6 produktů (Lady Carneval, Granátový Bond, Kosmopolitan, Červánkové nebe, Dům u jezera, Malinový svařák nealko) aktivní, s vyplněnými alergeny — skript 71 spuštěn v Production 8. 11.
- Koktejly 3 l + 500 ml, ovocné nápoje 3 l; hmotnost balení 3 kg.
- Lady Carneval: upozornění E110/E124.
- Skutečná zaplacená objednávka 70000010 obsahuje Svařák Deluxe 3 l (nákup funguje).

Lucie otestuje:
- koupit 1 alkoholický koktejl (potvrzení věku 18+) a 1 ovocný nápoj až do pokladny (nemusí platit),
- výběr balení 3 l / 500 ml a cenu v košíku.

Důkaz: https://github.com/Jarinmax/mojebegina/pull/74 · skript docs/eshop-production/71_koktejly_ovocne_napoje_do_prodeje_MAIN.sql · https://begina.cz/kategorie/koktejly · https://begina.cz/kategorie/ovocne-napoje$k$, 'urgent'),
    ($k$BEG-02 – Složení produktů, alergeny a přírodní aromata$k$, $k$Priorita: P0
Technický stav: ČÁSTEČNĚ – ČEKÁ NA PODKLADY
Odpovědný: Jarin (podklady z etiket) · Claude (zápis)

Hotovo:
- Všech 28 aktivních produktů má vyplněné alergeny (v DB 0 bez alergenů).
- Svařák: „obsahuje siřičitany“ (víno); citronová a grepová šťáva 100 % bez E.
- Lady Carneval: upozornění E110/E124.

Zbývá:
- Lady Carneval má ve složení „aroma“ bez označení „přírodní“ — doložit z etikety dodavatele.
- Výživové údaje se NEPŘEPOČÍTÁVAJÍ odhadem — jen z podkladů.
- Kosmopolitan: brusinková šťáva — potvrdit, že je bez siřičitanů/E.
Lucie otestuje: složení a alergeny na stránkách produktů proti etiketám.

Důkaz: https://github.com/Jarinmax/mojebegina/pull/74 · https://begina.cz/produkt/lady-carneval$k$, 'urgent'),
    ($k$BEG-03 – Odstranění kyseliny citronové, staré šarže a trvanlivost$k$, $k$Priorita: P0
Technický stav: NEHOTOVO – ČEKÁ NA ROZHODNUTÍ A PODKLADY
Odpovědný: Jarin (receptury, šarže, odborné ověření) · Claude (zápis)

Zjištěno v Production (8. 11.):
- „kyselina citronová“ je stále ve složení 19 aktivních produktů (koktejly, ovocné nápoje, polévky, čaje).
- Dýňová polévka: „dýně Hokkaido 39 %“ — požadováno „dýně 39 %“ bez odrůdy.
- POZOR: u 6 polévek je na webu „Do 14 dnů při zachování správného uskladnění“ — podle rozhodnutí bez odborného ověření nepovoleno.

Potřebné rozhodnutí / podklady:
- od které šarže platí nové receptury bez kyseliny citronové (staré šarže na skladě?),
- povinně deklarované podsložky nakoupených surovin bez podkladu nemazat,
- zda údaj 14 dnů hned stáhnout z webu.
Lucie otestuje: po úpravě složení a skladování u polévek.

Důkaz: DB products.ingredients / shelf_life_note (audit 8. 11.) · https://begina.cz/produkt/dynova-polevka$k$, 'urgent'),
    ($k$BEG-04 – Funkčnost slevových kupónů$k$, $k$Priorita: P0
Technický stav: NASAZENO – ČEKÁ NA KONTROLU LUCIE
Odpovědný: Claude

Hotovo:
- Pole „Uplatnit slevový kupon“ v košíku i pokladně; kupony ze starého e-shopu podle e-mailu.
- Partnerská sleva podle zaplaceného zboží minulý měsíc (bez dopravy) — nabízí se automaticky s tlačítkem Uplatnit.
- Skutečné objednávky 70000009 a 70000010 mají partnerskou slevu.

Lucie otestuje: kupon ze starého e-shopu, partnerskou slevu s e-mailem partnera, neplatný kód (srozumitelná chyba).

Důkaz: https://github.com/Jarinmax/mojebegina/pull/63 · https://github.com/Jarinmax/mojebegina/pull/66 · https://begina.cz/kosik$k$, 'urgent'),
    ($k$BEG-05 – Zákaznické účty MojeBegina, historie a Objednat znovu$k$, $k$Priorita: P0
Technický stav: NASAZENO – ČEKÁ NA KONTROLU LUCIE
Odpovědný: Claude · Jarin (pozvánky zákazníkům)

Hotovo:
- „Objednat znovu“ v historii naplní košík na begina.cz, „Nový nákup v e-shopu“.
- Pokladna předvyplní firmu, IČO, DIČ, sídlo a provozovnu z karty (lze upravit).
- Objednávka se ke kartě přiřadí přes MojeBegina nebo podle e-mailu člena karty; samotné IČO nestačí.

Zbývá:
- aktivováno jen 5 ze 14 zákaznických účtů — rozeslat pozvánky (Jarin),
- historie zatím ukazuje jen zaplacené objednávky.
Lucie otestuje: (s testovacím účtem zákazníka) Objednat znovu → košík → předvyplněná pokladna.

Důkaz: https://github.com/Jarinmax/mojebegina/pull/77 · https://github.com/Jarinmax/mojebegina/pull/78 · https://moje.begina.cz/objednavky$k$, 'urgent'),
    ($k$BEG-06 – Fakturační a doručovací údaje, včetně objednávky 70000009$k$, $k$Priorita: P1
Technický stav: NASAZENO – ČEKÁ NA KONTROLU LUCIE
Odpovědný: Claude

Hotovo:
- Pokladna: úplné fakturační údaje (firma, IČO s kontrolou, DIČ), doručení na fakturační nebo jiný příjemce s telefonem; osobní odběr bez adresy.
- E-maily a detail v MojeBegina: bloky Fakturační / Doručovací / Kontakt.
- 70000009: údaje doplněny z faktur iDokladu 20260186 a 20260198 (skript 73), faktura 9260002 vystavena správně.
- Faktura: dodací adresa s provozovnou příjemce.

Lucie otestuje: objednávku na firmu s jiným příjemcem až do pokladny; e-mail na info@ — bloky čitelné na mobilu.

Důkaz: https://github.com/Jarinmax/mojebegina/pull/75 · https://github.com/Jarinmax/mojebegina/pull/76 · https://github.com/Jarinmax/mojebegina/pull/79$k$, 'normal'),
    ($k$BEG-07 – Bankovní převod jako výchozí platba$k$, $k$Priorita: P1
Technický stav: NASAZENO – ČEKÁ NA KONTROLU LUCIE
Odpovědný: Claude

Hotovo: v pokladně je bankovní převod první a předvybraný; karta online zůstává volitelná.

Lucie otestuje: otevřít pokladnu — předvybraný převod.

Důkaz: https://github.com/Jarinmax/mojebegina/pull/63 · https://begina.cz/pokladna$k$, 'normal'),
    ($k$BEG-08 – Obchodní podmínky, formulář PDF a online odstoupení$k$, $k$Priorita: P1
Technický stav: NASAZENO – ČEKÁ NA KONTROLU LUCIE
Odpovědný: Claude

Hotovo:
- Obchodní podmínky 4. znění, účinné od 8. 11. 2026; starší znění zachována.
- Formulář pro odstoupení v PDF, přikládán k potvrzení objednávky.
- Online „Odstoupit od smlouvy“ (potvrzení zákazníkovi + oznámení Begině), výjimky pro potraviny podléhající rychlé zkáze.

Lucie otestuje: stránku Obchodní podmínky, stažení PDF formuláře, online odstoupení (s testovacím e-mailem).

Důkaz: https://github.com/Jarinmax/mojebegina/pull/61 · https://github.com/Jarinmax/mojebegina/pull/68 · https://github.com/Jarinmax/mojebegina/pull/72 · https://begina.cz/obchodni-podminky · https://begina.cz/odstoupeni-od-smlouvy$k$, 'normal'),
    ($k$BEG-09 – Menší balení sirupů 700 ml a koktejlů 500 ml$k$, $k$Priorita: P1
Technický stav: BLOKOVÁNO – ČEKÁ NA POTVRZENÍ PLNĚNÍ SIRUPŮ
Odpovědný: Jarin (potvrzení plnění) · Claude

Platné zadání (8. 11. 17:47): sirupy 700 ml (jen po potvrzení skutečného plnění), koktejly 500 ml, 750 ml u koktejlů zrušeno.
Stav v Production:
- koktejly: 500 ml u všech 4 (Lady Carneval, Granátový Bond, Kosmopolitan, Svařák Deluxe) — splněno, 750 ml nikde není,
- sirupy: 7 × „750 g“ — beze změny, dokud nepotvrdíš plnění 700 ml.

Zbývá po potvrzení: štítek a texty sirupů na 700 ml (SKU, ceny, hmotnosti a historické objednávky beze změny), Informace o potravině, e-maily, MojeBegina, podklady pro etikety.
Lucie otestuje: po změně výběr balení u sirupů.

Důkaz: DB product_variants (audit 8. 11.) · https://begina.cz/kategorie/sirupy$k$, 'normal'),
    ($k$BEG-10 – Označení třílitrových balení pouze „3 l“$k$, $k$Priorita: P1
Technický stav: NEHOTOVO – ROZPOR V ZADÁNÍ
Odpovědný: Jarin (potvrzení) · Claude

Stav v Production: 28 balení má štítek „Begina 3 l“ (podle pokynu Jarina 8. 11. 14:21; PR #75 + skript 72). Staré „Rodinná zásoba / bag-in-box“ už nikde.
Nejnovější zadání (registr s Lucy GPT): pouze „3 l“.

Zbývá: po potvrzení Jarina změnit „Begina 3 l“ → „3 l“ (jedno místo v kódu + skript pro DB); historické objednávky se jen zobrazí nově.
Lucie otestuje: košík, pokladna, e-mail, MojeBegina — „Kulajda – 3 l“.

Důkaz: https://github.com/Jarinmax/mojebegina/pull/75 · skript 72_oznaceni_baleni_MAIN.sql$k$, 'normal'),
    ($k$BEG-11 – Interní oznámení objednávek na info@begina.cz$k$, $k$Priorita: P1
Technický stav: NASAZENO – OVĚŘENO NA OBJEDNÁVCE 70000010
Odpovědný: Claude

Hotovo:
- V Production jde vše Begině na info@begina.cz: oznámení nové objednávky, odstoupení, a skrytá kopie každého e-mailu zákazníkovi (potvrzení, platba, faktura, storno).
- Ověřeno: objednávka 70000010 (8. 11. 21:35) — potvrzení zákazníkovi s kopií info@, interní oznámení na info@.

Lucie otestuje: v info@ najít oznámení a kopii potvrzení objednávky 70000010.

Důkaz: https://github.com/Jarinmax/mojebegina/pull/79 · https://github.com/Jarinmax/mojebegina/pull/80 · záznam e-mailů u objednávky 70000010$k$, 'normal'),
    ($k$BEG-12 – Osobní odběr ve Viticích$k$, $k$Priorita: P1
Technický stav: NASAZENO – ČEKÁ NA KONTROLU LUCIE
Odpovědný: Claude · Jarin (Google profil)

Hotovo:
- Text osobního odběru: Zahradní Bistro Begina, Vitice 119, 281 06 Vitice, vyzvednutí po předchozí domluvě (pokladna, e-maily).
- „Zobrazit na mapě“ otevře přímo Zahradní Bistro Begina.

Zbývá (mimo web): v profilu Firma na Googlu opravit adresu „Dobré Pole, 281 61“ → Vitice 119, 281 06 Vitice (Jarin).
Lucie otestuje: osobní odběr v pokladně, odkaz na mapu v patičce.

Důkaz: https://github.com/Jarinmax/mojebegina/pull/59 · https://github.com/Jarinmax/mojebegina/pull/74 · https://begina.cz/doprava$k$, 'normal'),
    ($k$BEG-13 – Hlavní nadpis, navigace a mobilní menu$k$, $k$Priorita: P2
Technický stav: ČÁSTEČNĚ – NOVÝ ÚVOD K POSOUZENÍ, MOBILNÍ MENU OTEVŘENÉ
Odpovědný: Lucie (posouzení) · Claude

Hotovo:
- Menu s rozbalovací položkou Nápoje, plné názvy kategorií, pruh kategorií se Zmrzlinami.
- Nový úvod podle návrhu 8. 11. (fotografie polévky s bylinným nápojem, Vybrat polévku / Objevit sirupy) — k posouzení Lucií.

Zbývá:
- mobilní menu: na mobilu je menu jen vodorovně posuvný pruh (položka „O vodě“ je mimo obrazovku), chybí klasické mobilní menu,
- výměna fotky (hrnek horkého čaje místo sklenice) — čeká na novou fotografii.
Lucie posoudí: úvod na mobilu a počítači, navigaci.

Důkaz: https://github.com/Jarinmax/mojebegina/pull/59 · https://github.com/Jarinmax/mojebegina/pull/81 · https://begina.cz/$k$, 'normal'),
    ($k$BEG-14 – Patička, fakturační údaje, kontakty a mapa$k$, $k$Priorita: P2
Technický stav: NASAZENO – ČEKÁ NA KONTROLU LUCIE
Odpovědný: Claude

Hotovo: patička se dvěma bloky — provozovatel a fakturační údaje (Jaroslav Viner, IČO 74337297, telefon, info@begina.cz) a osobní odběr s odkazem na mapu; odkazy O nás, Doprava, Obchodní podmínky, GDPR, Odstoupit od smlouvy.

Lucie otestuje: patičku na mobilu i počítači, všechny odkazy.

Důkaz: https://github.com/Jarinmax/mojebegina/pull/59 · https://github.com/Jarinmax/mojebegina/pull/74 · https://begina.cz/$k$, 'normal'),
    ($k$BEG-15 – Duplicitní text na stránkách O nás a O vodě$k$, $k$Priorita: P2
Technický stav: NEHOTOVO
Odpovědný: Claude

Zjištěno v kódu: stránky O nás a O vodě končí řádkem „Provozovatel: Jaroslav Viner, sídlo …, IČO …“ a stejné údaje jsou hned pod tím v patičce — duplicita.

Zbývá: řádek provozovatele na informačních stránkách odstranit (patička zůstává).
Lucie otestuje: https://begina.cz/o-nas a https://begina.cz/o-vode bez zdvojeného provozovatele.

Důkaz: components/eshop/InfoPageView.tsx (řádek „Provozovatel“) · https://begina.cz/o-nas · https://begina.cz/o-vode$k$, 'normal'),
    ($k$BEG-16 – Závěrečná kontrola celého e-shopu$k$, $k$Priorita: P2
Technický stav: NEZAHÁJENO
Odpovědný: Lucie · Claude

Nezahájeno — navazuje na dokončení BEG-01 až BEG-15.

Lucie otestuje: celý nákup na mobilu a počítači, všechny kategorie, kontrolní body ESHOP-001 až ESHOP-163 (seznam doplní Lucy GPT).

Důkaz: —$k$, 'normal')
  ),
  ins AS (
    INSERT INTO work_tasks (title, description, assignee_user_id, created_by, priority, photo_requirement, requires_approval)
    SELECT title, description, lucie, viner, priority, 'optional', false FROM karty
    RETURNING id
  )
  INSERT INTO work_task_activity (task_id, actor_user_id, actor_name, kind)
  SELECT id, viner, 'Jaroslav Viner', 'created' FROM ins;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 16 THEN RAISE EXCEPTION 'Čekal jsem 16 karet, vzniklo by % — zastavuji.', n; END IF;
  RAISE NOTICE 'Hotovo: registr Kontrola e-shopu – Lucie má 16 karet.';
END $$;

COMMIT;

-- Kontrola po (spustit zvlášť; čekáno 16 | 16 | 5):
-- SELECT count(*), count(*) FILTER (WHERE status = 'open'), count(*) FILTER (WHERE priority = 'urgent')
-- FROM work_tasks WHERE title ~ '^BEG-[0-9]{2}';
