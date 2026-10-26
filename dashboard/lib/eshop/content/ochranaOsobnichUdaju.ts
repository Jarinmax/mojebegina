// Zásady ochrany osobních údajů (GDPR) e-shopu Begina.cz — text dodaný
// vedením 8. 10. 2026, přepsaný doslova (jen rozdělený do článků, odstavců
// a odrážek). Měnit jen podle nového znění od vedení; datum účinnosti
// v `PRIVACY_EFFECTIVE` a v čl. XIII.
import type { InfoBlock } from "../infoPages";

export const PRIVACY_EFFECTIVE = "22. září 2026";

export const PRIVACY_BLOCKS: InfoBlock[] = [
  {
    heading: "I. Správce osobních údajů",
    paragraphs: ["Správcem osobních údajů je:"],
    lines: [
      "Jaroslav Viner",
      "IČO: 74337297",
      "sídlo: Mostecká 273/21, 118 00 Praha 1",
      "e-mail: info@begina.cz",
      "telefon: +420 774 199 975",
    ],
  },
  {
    paragraphs: ["Kontaktní provozovna a korespondenční adresa:"],
    lines: ["Zahradní Bistro Begina", "Vitice 119", "281 06 Vitice, okres Kolín"],
    afterParagraphs: [
      "dále jen „správce“.",
      "Správce provozuje internetový obchod na adrese www.begina.cz.",
    ],
  },
  {
    heading: "II. Jaké osobní údaje zpracováváme",
    paragraphs: ["V souvislosti s provozem internetového obchodu můžeme zpracovávat zejména následující osobní údaje:"],
    items: [
      "jméno a příjmení,",
      "fakturační a doručovací adresu,",
      "e-mailovou adresu,",
      "telefonní číslo,",
      "údaje o objednaném zboží, ceně, platbě a způsobu dopravy,",
      "historii objednávek a reklamací,",
      "údaje uvedené v zákaznickém účtu,",
      "IČO, název podnikatele a další fakturační údaje u podnikajících zákazníků,",
      "komunikaci se zákazníkem,",
      "potvrzení dosažení věku 18 let u objednávek obsahujících alkoholické nápoje,",
      "IP adresu, technické údaje o zařízení a údaje získané prostřednictvím cookies.",
    ],
    afterParagraphs: [
      "Správce nezískává ani neuchovává celé údaje o platební kartě. Tyto údaje zpracovává příslušný poskytovatel platební brány.",
    ],
  },
  {
    heading: "III. Účely a právní důvody zpracování",
    paragraphs: ["Osobní údaje zpracováváme zejména pro následující účely:"],
  },
  {
    subheading: "1. Vyřízení objednávky a plnění kupní smlouvy",
    paragraphs: ["Údaje zpracováváme za účelem:"],
    items: [
      "přijetí a potvrzení objednávky,",
      "zpracování platby,",
      "přípravy a doručení zboží,",
      "komunikace o stavu objednávky,",
      "osobního odběru,",
      "vyřízení reklamace nebo odstoupení od smlouvy,",
      "vedení zákaznického účtu.",
    ],
    afterParagraphs: ["Právním důvodem je plnění smlouvy nebo provedení opatření před uzavřením smlouvy."],
  },
  {
    subheading: "2. Plnění právních povinností",
    paragraphs: [
      "Některé údaje zpracováváme za účelem plnění účetních, daňových, spotřebitelských a dalších zákonných povinností.",
      "Právním důvodem je plnění právní povinnosti správce.",
    ],
  },
  {
    subheading: "3. Ochrana práv a oprávněných zájmů",
    paragraphs: ["Osobní údaje můžeme zpracovávat také za účelem:"],
    items: [
      "ochrany a uplatňování právních nároků,",
      "evidence plateb a pohledávek,",
      "prevence podvodného nebo zneužívajícího jednání,",
      "zabezpečení internetového obchodu,",
      "evidence a řešení stížností,",
      "ochrany majetku a práv správce.",
    ],
    afterParagraphs: ["Právním důvodem je oprávněný zájem správce."],
  },
  {
    subheading: "4. Marketingová komunikace",
    paragraphs: [
      "Pokud zákazník udělí souhlas se zasíláním obchodních sdělení, můžeme jeho e-mailovou adresu používat k zasílání novinek, nabídek a informací o výrobcích Begina.",
      "Zákazník může souhlas kdykoliv odvolat prostřednictvím odkazu v obchodním sdělení nebo zasláním žádosti na e-mail info@begina.cz.",
      "Stávajícím zákazníkům mohou být v souladu s právními předpisy zasílány nabídky obdobných výrobků také na základě oprávněného zájmu. Zákazník může takové zasílání kdykoliv bezplatně odmítnout.",
    ],
  },
  {
    heading: "IV. Osobní údaje související s prodejem alkoholu",
    paragraphs: [
      "Při objednávce obsahující alkoholický nápoj zákazník potvrzuje, že dosáhl věku 18 let a že objednávku převezme osoba starší 18 let.",
      "Při doručení nebo osobním odběru může být příjemce vyzván k prokázání věku dokladem totožnosti.",
      "Správce ani osoba vydávající objednávku běžně nepořizují kopii dokladu totožnosti ani nezaznamenávají jeho číslo. Doklad slouží pouze k ověření věku příjemce, není-li v konkrétním případě nutné postupovat jinak podle právních předpisů.",
    ],
  },
  {
    heading: "V. Doba uchování osobních údajů",
    paragraphs: ["Osobní údaje uchováváme pouze po dobu nezbytnou pro účel, pro který byly získány, zejména:"],
    items: [
      "údaje potřebné k vyřízení objednávky po dobu trvání smluvního vztahu a následně po dobu nutnou k ochraně práv správce a zákazníka,",
      "účetní a daňové doklady po dobu stanovenou příslušnými právními předpisy, zpravidla 5 nebo 10 let podle druhu dokumentu,",
      "údaje související s reklamací po dobu jejího vyřízení a následně po dobu nezbytnou k ochraně právních nároků,",
      "údaje v zákaznickém účtu po dobu jeho existence a následně v nezbytném rozsahu podle právních předpisů,",
      "běžnou komunikaci a dotazy zpravidla nejdéle 3 roky od ukončení komunikace, pokud není nutné údaje uchovat déle,",
      "marketingové údaje do odvolání souhlasu nebo vznesení námitky, nejdéle však po dobu, po kterou trvá příslušný účel zpracování,",
      "údaje získané prostřednictvím cookies po dobu uvedenou v nastavení jednotlivých cookies.",
    ],
    afterParagraphs: [
      "Pokud vznikne právní spor, reklamace nebo jiný oprávněný důvod, mohou být nezbytné údaje uchovány až do konečného vyřešení dané záležitosti.",
    ],
  },
  {
    heading: "VI. Příjemci osobních údajů",
    paragraphs: ["Osobní údaje mohou být v nezbytném rozsahu zpřístupněny zejména:"],
    items: [
      "dopravcům zajišťujícím chlazenou přepravu,",
      "poskytovateli platební brány,",
      "poskytovateli webhostingu a technické správy internetového obchodu,",
      "poskytovatelům e-mailových, účetních a fakturačních služeb,",
      "účetní nebo daňovému poradci,",
      "poskytovatelům analytických a marketingových nástrojů, pokud k jejich použití zákazník udělil souhlas,",
      "právním nebo jiným odborným poradcům,",
      "orgánům veřejné moci, pokud jejich předání vyžadují právní předpisy.",
    ],
    afterParagraphs: ["Osobní údaje neprodáváme ani neposkytujeme třetím osobám pro jejich vlastní marketingové účely."],
  },
  {
    heading: "VII. Předávání údajů mimo Evropský hospodářský prostor",
    paragraphs: [
      "Někteří poskytovatelé technických, analytických nebo marketingových služeb mohou zpracovávat osobní údaje mimo Evropskou unii nebo Evropský hospodářský prostor.",
      "V takovém případě je předávání údajů zajištěno v souladu s právními předpisy, například na základě rozhodnutí Evropské komise o odpovídající úrovni ochrany nebo prostřednictvím standardních smluvních doložek.",
    ],
  },
  {
    heading: "VIII. Cookies",
    paragraphs: ["Internetový obchod používá soubory cookies."],
  },
  {
    subheading: "Nezbytné cookies",
    paragraphs: [
      "Nezbytné cookies zajišťují základní fungování internetového obchodu, například správné zobrazení stránek, fungování košíku, přihlášení do zákaznického účtu, zabezpečení webu a dokončení objednávky.",
      "Tyto cookies lze používat bez souhlasu návštěvníka, protože jsou nezbytné pro fungování internetového obchodu.",
    ],
  },
  {
    subheading: "Analytické a marketingové cookies",
    paragraphs: [
      "Analytické a marketingové cookies používáme pouze na základě souhlasu návštěvníka uděleného prostřednictvím cookie lišty.",
      "Návštěvník může svůj souhlas kdykoliv změnit nebo odvolat prostřednictvím nastavení cookies na internetových stránkách.",
      "Podrobnosti o jednotlivých cookies, jejich poskytovatelích a době platnosti jsou uvedeny v nastavení cookie lišty.",
    ],
  },
  {
    heading: "IX. Práva subjektu údajů",
    paragraphs: ["V souvislosti se zpracováním osobních údajů má zákazník zejména právo:"],
    items: [
      "získat potvrzení, zda jsou jeho osobní údaje zpracovávány,",
      "požadovat přístup ke svým osobním údajům,",
      "požadovat opravu nepřesných nebo neúplných údajů,",
      "požadovat výmaz osobních údajů, pokud jsou splněny zákonné podmínky,",
      "požadovat omezení zpracování,",
      "získat osobní údaje ve strukturovaném a strojově čitelném formátu, pokud jsou splněny podmínky pro přenositelnost,",
      "vznést námitku proti zpracování založenému na oprávněném zájmu,",
      "kdykoliv odvolat udělený souhlas,",
      "podat stížnost u dozorového úřadu.",
    ],
    afterParagraphs: [
      "Odvoláním souhlasu není dotčena zákonnost zpracování provedeného před jeho odvoláním.",
      "Žádost lze zaslat na e-mail info@begina.cz nebo písemně na adresu Zahradní Bistro Begina, Vitice 119, 281 06 Vitice, okres Kolín.",
      "Správce může před vyřízením žádosti požádat o přiměřené ověření totožnosti žadatele, aby osobní údaje nebyly zpřístupněny neoprávněné osobě.",
    ],
  },
  {
    heading: "X. Stížnost u dozorového úřadu",
    paragraphs: [
      "Pokud se zákazník domnívá, že jsou jeho osobní údaje zpracovávány v rozporu s právními předpisy, může podat stížnost u:",
    ],
    lines: ["Úřadu pro ochranu osobních údajů", "Pplk. Sochora 27", "170 00 Praha 7", "www.uoou.gov.cz"],
  },
  {
    heading: "XI. Automatizované rozhodování",
    paragraphs: [
      "Správce neprovádí automatizované individuální rozhodování, které by pro zákazníka mělo právní nebo obdobně významné účinky.",
      "Pokud zákazník udělí souhlas s analytickými nebo marketingovými cookies, může docházet k základnímu vyhodnocování návštěvnosti a chování na webu pro marketingové účely.",
    ],
  },
  {
    heading: "XII. Zabezpečení osobních údajů",
    paragraphs: [
      "Správce přijímá přiměřená technická a organizační opatření k ochraně osobních údajů před ztrátou, zneužitím, neoprávněným přístupem, změnou nebo zveřejněním.",
      "K osobním údajům mají přístup pouze osoby, které je potřebují pro splnění svých pracovních nebo smluvních povinností.",
    ],
  },
  {
    heading: "XIII. Závěrečná ustanovení",
    paragraphs: [
      `Tyto zásady ochrany osobních údajů jsou platné a účinné od ${PRIVACY_EFFECTIVE}.`,
      "Správce může tyto zásady aktualizovat, zejména při změně právních předpisů, používaných služeb nebo způsobu zpracování osobních údajů.",
      "Aktuální znění je vždy zveřejněno na internetové adrese www.begina.cz/gdpr/.",
    ],
  },
];
