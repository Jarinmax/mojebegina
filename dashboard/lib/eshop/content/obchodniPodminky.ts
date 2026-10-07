// Obchodní podmínky e-shopu Begina.cz — text dodaný vedením 3. 10. 2026,
// přepsaný doslova (jen rozdělený do článků a bodů). Měnit jen podle nového
// znění od vedení; datum účinnosti v `TERMS_EFFECTIVE` a v čl. XIII.
import type { InfoBlock } from "../infoPages";

export const TERMS_EFFECTIVE = "22. září 2026";

export const TERMS_BLOCKS: InfoBlock[] = [
  {
    heading: "I. Úvodní ustanovení",
    points: [
      {
        text: "Tyto obchodní podmínky upravují vzájemná práva a povinnosti mezi prodávajícím:",
        lines: [
          "Jaroslav Viner",
          "IČO: 74337297",
          "sídlo: Mostecká 273/21, 118 00 Praha 1",
          "e-mail: info@begina.cz",
          "telefon: +420 774 199 975",
          "dále jen „prodávající“,",
        ],
        after: "a kupujícím při prodeji zboží prostřednictvím internetového obchodu na adrese www.begina.cz.",
      },
      { text: "Tyto obchodní podmínky jsou nedílnou součástí kupní smlouvy." },
      {
        text: "Kupujícím může být spotřebitel nebo podnikatel. Spotřebitelem je fyzická osoba, která mimo rámec své podnikatelské činnosti nebo výkonu povolání uzavírá smlouvu s prodávajícím. Podnikatelem je osoba, která nakupuje zboží v souvislosti se svou podnikatelskou činností.",
      },
      {
        text: "Právní vztahy mezi prodávajícím a kupujícím se řídí právním řádem České republiky, zejména občanským zákoníkem a zákonem o ochraně spotřebitele.",
      },
    ],
  },
  {
    heading: "II. Informace o zboží",
    points: [
      {
        text: "Informace o zboží, jeho složení, objemu, ceně, způsobu použití, skladování a době spotřeby nebo minimální trvanlivosti jsou uvedeny u jednotlivých výrobků a na jejich obalech.",
      },
      {
        text: "Výrobky Begina jsou potraviny určené k běžné konzumaci. Nejsou léčivými přípravky ani doplňky stravy a informace uvedené na internetových stránkách nenahrazují odborné lékařské doporučení.",
      },
      {
        text: "Kupující je povinen před konzumací zkontrolovat složení výrobku, zejména s ohledem na případné alergie, intolerance nebo jiná zdravotní omezení.",
      },
      {
        text: "Osoby se zdravotními omezeními, těhotné a kojící ženy by měly vhodnost konzumace posoudit podle svého zdravotního stavu, případně ji konzultovat s lékařem.",
      },
      {
        text: "Prodávající neodpovídá za znehodnocení výrobku způsobené nesprávným skladováním, nevhodnou manipulací nebo nedodržením pokynů uvedených na obalu po převzetí zboží kupujícím.",
      },
    ],
  },
  {
    heading: "III. Prodej alkoholických nápojů",
    points: [
      { text: "Prodej alkoholických nápojů osobám mladším 18 let je zakázán." },
      {
        text: "Kupující odesláním objednávky obsahující alkoholický nápoj potvrzuje, že dosáhl věku 18 let a že objednávku převezme osoba starší 18 let.",
      },
      {
        text: "Prodávající, dopravce nebo osoba vydávající objednávku při osobním odběru jsou oprávněni při pochybnostech požadovat prokázání věku příjemce platným dokladem totožnosti.",
      },
      {
        text: "Objednávka obsahující alkoholický nápoj nesmí být předána osobě mladší 18 let ani osobě, která při pochybnostech svůj věk neprokáže.",
      },
      {
        text: "Pokud z tohoto důvodu nebude možné objednávku předat, může prodávající po kupujícím požadovat úhradu účelně vynaložených nákladů spojených s neúspěšným doručením a případným vrácením zásilky.",
      },
    ],
  },
  {
    heading: "IV. Objednávka a uzavření kupní smlouvy",
    points: [
      { text: "Kupující provádí objednávku prostřednictvím objednávkového formuláře na internetovém obchodě." },
      {
        text: "Před odesláním objednávky má kupující možnost zkontrolovat a opravit zadané údaje, zvolené výrobky, jejich množství, způsob dopravy a způsob platby.",
      },
      {
        text: "Odesláním objednávky kupující potvrzuje, že se seznámil s těmito obchodními podmínkami, souhlasí s nimi a zavazuje se objednávku zaplatit.",
      },
      { text: "Kupní smlouva vzniká potvrzením objednávky prodávajícím na e-mailovou adresu uvedenou kupujícím." },
      {
        text: "Prodávající si vyhrazuje právo objednávku nebo její část nepřijmout, zejména pokud:",
        items: [
          "objednané zboží není dostupné,",
          "došlo ke zjevné chybě v ceně nebo popisu výrobku,",
          "objednávku nelze doručit zvoleným způsobem,",
          "existuje důvodné podezření na zneužití objednávkového systému,",
          "kupující v minulosti nepřevzal nebo neuhradil objednávku,",
          "nelze zajistit splnění podmínek pro prodej alkoholických nápojů.",
        ],
      },
      {
        text: "Pokud prodávající objednávku nepřijme a kupující již zaplatil, bude uhrazená částka vrácena stejným způsobem, jakým byla přijata, není-li s kupujícím dohodnuto jinak.",
      },
      {
        text: "Kupní smlouva se uzavírá v českém jazyce. Prodávající smlouvu archivuje a na žádost kupujícího mu umožní přístup k jejímu obsahu v rozsahu stanoveném právními předpisy.",
      },
    ],
  },
  {
    heading: "V. Cena zboží a platební podmínky",
    points: [
      { text: "Prodávající není plátcem daně z přidané hodnoty." },
      {
        text: "Ceny uvedené na internetovém obchodě jsou konečné. Cena dopravy se k ceně zboží připočítává podle celkového objemu nebo hmotnosti objednávky a je kupujícímu zobrazena v košíku před odesláním objednávky.",
      },
      {
        text: "Zboží lze uhradit platební kartou prostřednictvím platební brány, případně jiným způsobem, který prodávající aktuálně nabízí v objednávkovém formuláři.",
      },
      { text: "U objednávek podnikatelů může být na základě předchozí dohody umožněna platba na fakturu." },
      {
        text: "V případě prodlení s úhradou faktury je prodávající oprávněn požadovat zákonný úrok z prodlení a náhradu účelně vynaložených nákladů spojených s uplatněním pohledávky, umožňují-li to právní předpisy.",
      },
      { text: "Prodávající neúčtuje spotřebitelům pevně stanovené poplatky za zasílání upomínek." },
      { text: "Vlastnické právo ke zboží přechází na kupujícího úplným zaplacením kupní ceny a převzetím zboží." },
    ],
  },
  {
    heading: "VI. Doprava a dodání zboží",
    points: [
      {
        text: "Všechny výrobky Begina, včetně polévek, čajů, ovocných nápojů, sirupů a alkoholických koktejlů, jsou doručovány chlazenou přepravou.",
      },
      {
        text: "Zboží může být doručeno:",
        items: [
          "prostřednictvím smluvního dopravce,",
          "rozvozem prodávajícího,",
          "osobním odběrem v provozovně Zahradní Bistro Begina, Vitice 119, 281 06 Vitice, okres Kolín, pokud je tato možnost při objednávce dostupná.",
        ],
      },
      {
        text: "Cena chlazené dopravy se stanoví podle aktuálního ceníku, celkového objemu nebo hmotnosti objednávky. Konečná cena dopravy je vždy zobrazena v košíku před dokončením objednávky.",
      },
      {
        text: "Obvyklá dodací lhůta činí do pěti pracovních dnů od přijetí platby, není-li u výrobku, v objednávkovém formuláři nebo po dohodě s kupujícím uvedeno jinak.",
      },
      {
        text: "Při osobním odběru je možné objednávku vyzvednout až poté, co kupující obdrží e-mailem, SMS zprávou nebo telefonicky informaci, že je objednávka připravena.",
      },
      { text: "Kupující je povinen objednávku při osobním odběru převzít ve sjednaném termínu." },
      {
        text: "Kupující je povinen zajistit převzetí chlazené zásilky v dohodnutém termínu a po převzetí výrobky neprodleně uložit v souladu s pokyny uvedenými na obalu.",
      },
      {
        text: "Kupujícímu se doporučuje při převzetí zkontrolovat neporušenost obalu a stav zásilky. Zjevné poškození je vhodné ihned oznámit dopravci a prodávajícímu. Neprovedení kontroly při převzetí samo o sobě nezbavuje spotřebitele jeho zákonných práv.",
      },
      { text: "Nebezpečí škody na zboží přechází na spotřebitele okamžikem, kdy zboží převezme od prodávajícího nebo dopravce." },
      {
        text: "Pokud kupující objednávku nepřevezme nebo neposkytne součinnost nezbytnou k jejímu doručení, odpovídá za znehodnocení zboží způsobené prodlením s převzetím.",
      },
      {
        text: "V případě nepřevzetí objednávky může prodávající požadovat náhradu účelně vynaložených nákladů na dopravu, vrácení zásilky a nakládání se zbožím, pokud na tuto náhradu vznikne podle právních předpisů nárok.",
      },
    ],
  },
  {
    heading: "VII. Odstoupení spotřebitele od kupní smlouvy",
    points: [
      {
        text: "Spotřebitel má při nákupu prostřednictvím internetového obchodu zpravidla právo odstoupit od kupní smlouvy bez uvedení důvodu ve lhůtě 14 dnů od převzetí zboží.",
      },
      {
        text: "Právo na odstoupení od smlouvy se nevztahuje zejména na:",
        items: [
          "zboží podléhající rychlé zkáze,",
          "zboží s krátkou dobou spotřeby,",
          "zboží upravené nebo vyrobené podle přání kupujícího,",
          "zboží v uzavřeném obalu, které spotřebitel z obalu vyňal a z hygienických nebo zdravotních důvodů je není možné vrátit,",
          "další případy uvedené v § 1837 občanského zákoníku.",
        ],
      },
      {
        text: "Vzhledem k povaze chlazených potravin se výjimka z práva na odstoupení může vztahovat na značnou část výrobků Begina. Rozhodující je povaha konkrétního výrobku, jeho trvanlivost a stav při vrácení.",
      },
      {
        text: "Pokud se na zboží právo na odstoupení vztahuje, může spotřebitel odstoupení oznámit na e-mailu info@begina.cz nebo písemně na adrese prodávajícího.",
      },
      { text: "Spotřebitel musí zboží odeslat nebo předat prodávajícímu nejpozději do 14 dnů od odstoupení od smlouvy." },
      { text: "Náklady na vrácení zboží nese spotřebitel, pokud se s prodávajícím nedohodne jinak." },
      {
        text: "Prodávající vrátí spotřebiteli přijaté peněžní prostředky, včetně nákladů na nejlevnější nabízený způsob dodání, nejpozději do 14 dnů od odstoupení od smlouvy. Prodávající není povinen vrátit peníze dříve, než obdrží vrácené zboží nebo než spotřebitel prokáže, že zboží odeslal.",
      },
      {
        text: "Spotřebitel odpovídá za snížení hodnoty vráceného zboží, které vzniklo v důsledku nakládání se zbožím jiným způsobem, než bylo nutné k seznámení se s jeho povahou a vlastnostmi.",
      },
    ],
  },
  {
    heading: "VIII. Práva z vadného plnění a reklamace",
    points: [
      {
        text: "Prodávající odpovídá kupujícímu za to, že zboží při převzetí nemá vady a odpovídá sjednanému popisu, druhu, množství a jakosti.",
      },
      {
        text: "U potravin se při posuzování vady přihlíží k jejich povaze, době spotřeby nebo minimální trvanlivosti, způsobu skladování a pokynům uvedeným na obalu.",
      },
      {
        text: "Reklamovat lze zejména:",
        items: [
          "poškozený nebo netěsnící obal,",
          "únik obsahu,",
          "nesprávně dodaný výrobek nebo množství,",
          "výrobek znehodnocený při výrobě nebo dopravě,",
          "jinou vadu, za kterou odpovídá prodávající.",
        ],
      },
      {
        text: "Práva z vadného plnění se nevztahují na poškození nebo znehodnocení způsobené zejména:",
        items: [
          "nesprávným skladováním po převzetí,",
          "nedodržením teplotního režimu,",
          "neodbornou manipulací,",
          "prodlením kupujícího s převzetím zásilky,",
          "konzumací po uplynutí doby použitelnosti,",
          "nedodržením pokynů uvedených na obalu,",
          "běžnými změnami odpovídajícími povaze potraviny.",
        ],
      },
      {
        text: "Reklamaci lze uplatnit:",
        items: [
          "e-mailem: info@begina.cz",
          "telefonicky: +420 774 199 975",
          "písemně nebo osobně: Zahradní Bistro Begina, Vitice 119, 281 06 Vitice, okres Kolín.",
        ],
      },
      {
        text: "V reklamaci kupující uvede zejména:",
        items: [
          "jméno a kontaktní údaje,",
          "číslo objednávky,",
          "název reklamovaného výrobku,",
          "popis vady,",
          "požadovaný způsob vyřízení reklamace.",
        ],
      },
      {
        text: "Pokud je to možné, doporučuje se přiložit fotografie výrobku, obalu, etikety a přepravního balení. Nepřiložení fotografie samo o sobě není důvodem k odmítnutí reklamace.",
      },
      {
        text: "Vady chlazeného zboží, poškození zásilky nebo porušení teplotního režimu je vhodné oznámit co nejdříve po převzetí, ideálně do 24 hodin, aby bylo možné zjistit příčinu vady. Tím nejsou dotčena zákonná práva spotřebitele.",
      },
      {
        text: "Prodávající při uplatnění reklamace vydá spotřebiteli písemné potvrzení obsahující datum uplatnění reklamace, její obsah, požadovaný způsob vyřízení a kontaktní údaje spotřebitele.",
      },
      {
        text: "Reklamace spotřebitele bude vyřízena bez zbytečného odkladu, nejpozději do 30 dnů od jejího uplatnění, pokud se prodávající se spotřebitelem nedohodne na delší lhůtě.",
      },
      {
        text: "Podle povahy vady a podmínek stanovených zákonem může mít kupující právo zejména na:",
        items: [
          "dodání nového zboží bez vady,",
          "doplnění chybějícího zboží,",
          "přiměřenou slevu,",
          "vrácení kupní ceny,",
          "případně jiný zákonný způsob odstranění vady.",
        ],
      },
      { text: "Poukaz na další objednávku může být jako způsob vyřízení reklamace poskytnut pouze se souhlasem kupujícího." },
      {
        text: "Po vyřízení reklamace obdrží spotřebitel písemné potvrzení o způsobu a datu jejího vyřízení, případně písemné odůvodnění zamítnutí reklamace.",
      },
    ],
  },
  {
    heading: "IX. Povinnosti kupujícího při skladování",
    points: [
      { text: "Kupující je povinen po převzetí dodržovat způsob skladování a teplotu uvedenou na obalu výrobku." },
      { text: "Po otevření musí být výrobek spotřebován ve lhůtě uvedené na obalu." },
      {
        text: "Kupující nesmí výrobek konzumovat, pokud je obal poškozený, netěsní, je neobvykle nafouknutý nebo výrobek vykazuje zjevné známky znehodnocení.",
      },
      {
        text: "Pokud kupující zjistí některou z těchto skutečností již při převzetí nebo bezprostředně po něm, doporučuje se výrobek nekonzumovat, uchovat jej pro případné posouzení a kontaktovat prodávajícího.",
      },
    ],
  },
  {
    heading: "X. Zvláštní ustanovení pro podnikatele",
    points: [
      {
        text: "Ustanovení tohoto článku se vztahují na kupující, kteří při objednávce uvedou své IČO a nakupují zboží v souvislosti se svou podnikatelskou činností.",
      },
      {
        text: "Na vztahy mezi prodávajícím a podnikatelem se nepoužijí ustanovení právních předpisů určená výhradně k ochraně spotřebitele.",
      },
      { text: "Podnikatel je povinen zásilku zkontrolovat při převzetí a zjevné vady oznámit prodávajícímu bez zbytečného odkladu." },
      { text: "Splatnost faktur vystavených podnikatelům činí standardně tři dny ode dne vystavení, pokud není dohodnuto jinak." },
      {
        text: "Prodávající je oprávněn požadovat platbu předem nebo odmítnout další dodání zboží, pokud je podnikatel v prodlení s úhradou předchozích závazků.",
      },
      {
        text: "Prodávající může s podnikatelem sjednat individuální obchodní podmínky, zejména ceny, objemové bonusy, splatnost, sezónní spolupráci nebo zvláštní způsob dopravy.",
      },
      { text: "Individuálně sjednané podmínky mají přednost před těmito obchodními podmínkami." },
    ],
  },
  {
    heading: "XI. Mimosoudní řešení spotřebitelských sporů",
    points: [
      {
        text: "Pokud mezi prodávajícím a spotřebitelem vznikne spor z kupní smlouvy, který se nepodaří vyřešit vzájemnou dohodou, může spotřebitel podat návrh na mimosoudní řešení spotřebitelského sporu.",
      },
      {
        text: "Příslušným subjektem mimosoudního řešení spotřebitelských sporů je:",
        lines: [
          "Česká obchodní inspekce",
          "Ústřední inspektorát – oddělení ADR",
          "Štěpánská 567/15",
          "120 00 Praha 2",
          "internetová adresa: www.coi.cz",
          "informace a podání návrhu: adr.coi.cz",
        ],
      },
    ],
  },
  {
    heading: "XII. Ochrana osobních údajů",
    points: [
      { text: "Prodávající zpracovává osobní údaje kupujících v souladu s platnými právními předpisy." },
      {
        text: "Podrobné informace o zpracování osobních údajů jsou uvedeny v samostatném dokumentu zveřejněném na internetovém obchodě v části „GDPR“ nebo „Ochrana osobních údajů“.",
      },
    ],
  },
  {
    heading: "XIII. Závěrečná ustanovení",
    points: [
      { text: `Tyto obchodní podmínky jsou platné a účinné od ${TERMS_EFFECTIVE}.` },
      {
        text: "Prodávající může obchodní podmínky přiměřeným způsobem měnit nebo doplňovat. Na objednávku se použije znění obchodních podmínek účinné v okamžiku jejího odeslání kupujícím.",
      },
      { text: "Aktuální obchodní podmínky jsou zveřejněny na internetovém obchodě www.begina.cz." },
      {
        text: "Obchodní podmínky platné v okamžiku uzavření kupní smlouvy budou kupujícímu zpřístupněny způsobem umožňujícím jejich uložení a opakované zobrazení, zejména zasláním společně s potvrzením objednávky nebo prostřednictvím odkazu umožňujícího jejich stažení.",
      },
      {
        text: "Pokud je některé ustanovení těchto obchodních podmínek neplatné nebo neúčinné, nemá tato skutečnost vliv na platnost ostatních ustanovení.",
      },
      { text: "Práva spotřebitele vyplývající z obecně závazných právních předpisů nejsou těmito obchodními podmínkami dotčena." },
    ],
  },
];
