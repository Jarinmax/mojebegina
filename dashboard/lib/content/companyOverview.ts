// Security Phase 8 — obsah stránky "Řízení firmy" (app/rizeni-firmy).
// Záměrně čistá data bez "server-only" a bez DB dotazu — pro první verzi
// nemá tahle stránka CMS ani editaci přes UI (viz zadání), obsah je
// strukturovaně uložený v kódu a mění se přes commit, ne přes formulář.
// Když se obsah příště změní, aktualizuj i `lastUpdated`.

export type CompanyAreaSection = {
  id: string;
  title: string;
  intro: string;
  flowLabel?: string;
  flow?: string[];
  bulletsLabel?: string;
  bullets?: string[];
  principle?: string;
};

export type AiAutomationContent = {
  principle: string;
  modelAssignments: { area: string; model: string }[];
  toReview: string[];
  futureAgents: string[];
  agentRequirements: string[];
  guardrail: string;
};

export type DocumentationContent = {
  principle: string;
  description: string;
};

export type MeetingConclusions = {
  topics: string[];
  originalNote: { label: string; text: string };
};

export type CompanyOverviewContent = {
  lastUpdated: Date;
  mapAreas: string[];
  mainFlow: string[];
  mapNotes: string[];
  areas: CompanyAreaSection[];
  aiAutomation: AiAutomationContent;
  documentation: DocumentationContent;
  meetingConclusions: MeetingConclusions;
  originalDecisions: string[];
};

export const companyOverview: CompanyOverviewContent = {
  lastUpdated: new Date(Date.UTC(2026, 8, 20)),

  mapAreas: [
    "Produkty",
    "Obchod / CRM",
    "Objednávky",
    "Výroba",
    "Sklad",
    "Marketing",
    "Akce / Festivaly / Bistro",
    "Finance",
    "Úkoly",
    "Nápady",
    "AI / Automatizace",
  ],

  mainFlow: [
    "Marketing",
    "Leady",
    "CRM / Obchod",
    "Zákazník",
    "Objednávka",
    "Plán výroby",
    "Výroba",
    "Sklad",
    "Doprava",
    "Zákazník",
  ],

  mapNotes: [
    "Produkty a jejich receptury/náklady vstupují do výroby.",
    "Objednávka propojuje výrobu, sklad, dopravu, finance a CRM.",
    "Marketing generuje leady a ty vstupují do CRM.",
    "Data ze všech částí se sbíhají v Moje Begina. Do budoucna nad nimi mohou pracovat AI agenti.",
  ],

  areas: [
    {
      id: "produkty",
      title: "Produkty",
      intro:
        "Centrální databáze produktů — polévky, nápoje, sirupy i nové produkty na jednom místě. Každý produkt je propojen s recepturou, náklady, cenou, výrobou a skladem.",
      bulletsLabel: "Kategorie produktů",
      bullets: ["Polévky", "Nápoje", "Sirupy", "Nové produkty"],
    },
    {
      id: "obchod-crm",
      title: "Obchod / CRM",
      intro: "Obchodní cesta popisuje, jak se z kontaktu stává aktivní zákazník.",
      flowLabel: "Obchodní cesta",
      flow: ["Lead", "Kontaktován", "Schůzka", "Vzorky", "Nabídka", "První objednávka", "Aktivní zákazník"],
      bulletsLabel: "Systém má postupně hlídat",
      bullets: [
        "Koho kontaktovat",
        "Kdo čeká na nabídku",
        "Kdo dostal vzorky",
        "Kdo dlouho neobjednal",
      ],
    },
    {
      id: "objednavky",
      title: "Objednávky",
      intro: "Objednávka je centrálním bodem celého procesu.",
      flowLabel: "Objednávka propojuje",
      flow: ["Objednávka", "Výroba", "Sklad", "Doprava", "Finance", "CRM"],
      principle: "Jedna informace se zadává pouze jednou.",
    },
    {
      id: "vyroba",
      title: "Výroba",
      intro: "Výroba má postupně vycházet z objednávek a požadované skladové zásoby.",
      bulletsLabel: "Výrobní dávka může obsahovat",
      bullets: [
        "Produkt",
        "Množství",
        "Datum výroby",
        "Receptura",
        "Potřebné suroviny",
        "Výrobce",
        "Šarže",
        "Datum spotřeby",
        "Skutečně vyrobené množství",
      ],
    },
    {
      id: "sklad",
      title: "Sklad",
      intro: "Dva hlavní pohledy: sklad surovin a sklad hotových výrobků.",
      flowLabel: "Tok skladu",
      flow: ["Nákup", "Sklad surovin", "Výroba", "Sklad hotových výrobků", "Objednávka"],
    },
    {
      id: "marketing",
      title: "Marketing",
      intro: "Marketing musí být propojený s výsledkem — od aktivity až po tržbu.",
      flowLabel: "Propojení s výsledkem",
      flow: ["Aktivita", "Náklad", "Lead", "Zákazník", "Objednávka", "Tržba"],
      bulletsLabel: "Typy aktivit",
      bullets: [
        "Sociální sítě",
        "Newsletter",
        "Reklama",
        "Festival",
        "Promo",
        "Ochutnávka",
        "Spolupráce",
      ],
    },
    {
      id: "akce-festivaly-bistro",
      title: "Akce / Festivaly / Bistro",
      intro: "Postupně chceme u každé akce sledovat celý její výsledek.",
      bulletsLabel: "Co sledujeme",
      bullets: [
        "Termín",
        "Místo",
        "Produkty",
        "Množství",
        "Prodané množství",
        "Vratky",
        "Náklady",
        "Tržba",
        "Výsledek",
      ],
    },
    {
      id: "finance",
      title: "Finance",
      intro: "Manažerský přehled nad hospodařením firmy.",
      bulletsLabel: "Přehled zahrnuje",
      bullets: [
        "Příjmy",
        "Výdaje",
        "Tržby",
        "Náklady",
        "Marže",
        "Výsledky produktů",
        "Výsledky zákazníků",
        "Výsledky prodejních kanálů",
      ],
    },
    {
      id: "ukoly",
      title: "Úkoly",
      intro:
        "Úkol může být propojen se zákazníkem, objednávkou, produktem, výrobou, akcí, projektem nebo nápadem.",
    },
    {
      id: "napady",
      title: "Nápady",
      intro: "Prostor pro nápady vedení.",
      bulletsLabel: "Například",
      bullets: [
        "Polévky ve skle",
        "Zařízení pro našlehání a ohřev polévky",
        "Nové produkty",
        "Nové obchodní modely",
      ],
      flowLabel: "Proces",
      flow: ["Nápad", "Vyhodnocení", "Projekt", "Úkoly", "Realizace / výsledek"],
    },
  ],

  aiAutomation: {
    principle:
      "Nepoužívat nutně jeden AI model na všechno — pro každý typ práce ten nejvhodnější.",
    modelAssignments: [
      { area: "Programování", model: "Claude / vhodný coding model" },
      { area: "Text a rozsáhlý kontext", model: "Claude" },
      { area: "Grafika a kreativní práce", model: "ChatGPT" },
    ],
    toReview: ["Nemotron — technologie k dalšímu prověření"],
    futureAgents: ["CEO", "Obchod", "Výroba", "Marketing", "Finance"],
    agentRequirements: [
      "Oprávnění",
      "Dostupná data",
      "Model",
      "Finanční limit",
      "Tokenový limit",
      "Historie činnosti",
    ],
    guardrail: "AI agent nesmí nekontrolovaně překračovat stanovené finanční ani tokenové limity.",
  },

  documentation: {
    principle: "Kód + dokumentace",
    description:
      "Vývoj funkcionality nemá znamenat jen vznik kódu. Významné části systému mají mít dokumentaci dostupnou přímo v Moje Begina.",
  },

  meetingConclusions: {
    topics: [
      "Výsledky akcí",
      "Obchod a produkty",
      "Systém",
      "Finance",
      "Audit provozovny",
      "Zákaznický program",
      "Výroba",
      "Sklad",
      "Marketing",
      "E-shop",
      "Sociální sítě",
      "Leady",
      "CRM",
      "AI nástroje",
      "Dokumentace",
    ],
    originalNote: {
      label: "Původní zápis ze schůzky",
      text: "Proč prodej polévky: je to rychlé a levné a nejsnadnější zisk.",
    },
  },

  originalDecisions: [
    "Vytvořit doménu a systém/databázi",
    "Založit moje.begina.cz",
    "Využívat GitHub a AI coding nástroje",
    "Nastavit agentům finanční a tokenové limity",
    "Při vývoji vytvářet dokumentaci",
    "Vytvořit prostor pro Jaroslavovy nápady",
  ],
};
