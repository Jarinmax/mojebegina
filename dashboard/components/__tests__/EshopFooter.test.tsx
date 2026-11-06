// @vitest-environment jsdom
// ESHOP 1.0 — patička: odkazy O nás, Doprava, Obchodní podmínky, GDPR jsou
// skutečné odkazy na existující stránky (dřív jen text bez odkazu).
import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import EshopFooter from "../eshop/EshopFooter";
import InfoPageView from "../eshop/InfoPageView";
import { FOOTER_LINKS, INFO_PAGES } from "@/lib/eshop/infoPages";
import { CURRENT_TERMS, LEGACY_TERMS } from "@/lib/eshop/content/termsVersions";

afterEach(() => cleanup());

const APP = path.join(__dirname, "../../app");
// Cesty informačních stránek jsou bez /eshop (lib/eshop/paths.ts); stránky leží v app/eshop.
const ESHOP_APP = path.join(APP, "eshop");

describe("patička e-shopu", () => {
  it("čtyři klikací odkazy ve správném pořadí a na správné adresy", () => {
    render(<EshopFooter />);
    const nav = screen.getByRole("navigation", { name: "Informace" });
    const links = Array.from(nav.querySelectorAll("a")).map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["O nás", "/eshop/o-nas"],
      ["Doprava", "/eshop/doprava"],
      ["Obchodní podmínky", "/eshop/obchodni-podminky"],
      ["GDPR", "/eshop/ochrana-osobnich-udaju"],
      ["Odstoupení od smlouvy", "/eshop/odstoupeni-od-smlouvy"],
    ]);
  });

  it("každý odkaz má svou stránku (app/…/page.tsx)", () => {
    for (const page of FOOTER_LINKS) {
      expect(existsSync(path.join(ESHOP_APP, page.path, "page.tsx")), page.path).toBe(true);
    }
  });

  it("dva oddělené bloky: provozovatel (fakturace) a provozovna s mapou (zadání Lucie 6. 11. 2026)", () => {
    render(<EshopFooter />);
    const operator = screen.getByRole("region", { name: "Provozovatel a fakturační údaje" });
    expect(operator.textContent).toContain("Jaroslav Viner");
    expect(operator.textContent).toContain("Mostecká 273/21, 118 00 Praha 1");
    expect(operator.textContent).toContain("IČO: 74337297");
    expect(operator.textContent).toContain("Sídlo a fakturační adresa. Osobní odběr probíhá v provozovně ve Viticích.");
    const place = screen.getByRole("region", { name: "Provozovna a osobní odběr" });
    expect(place.textContent).toContain("Zahradní Bistro Begina");
    expect(place.textContent).toContain("(areál Zahradnictví Jandl)");
    expect(place.textContent).toContain("Vitice 119, 281 06 Vitice (okr. Kolín)");
    expect(place.textContent).toContain("Zde najdete naše bistro a výdejní místo objednávek z e-shopu.");
    const map = screen.getByRole("link", { name: "Zobrazit na mapě" });
    expect(decodeURIComponent(map.getAttribute("href")!)).toContain("Zahradnictví Jandl, Vitice 119");
    expect(map.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("kontakt provozovatele zůstává (telefon, e-mail)", () => {
    render(<EshopFooter />);
    expect(screen.getByRole("link", { name: "+420 774 199 975" }).getAttribute("href")).toBe("tel:+420774199975");
    expect(screen.getByRole("link", { name: "info@begina.cz" }).getAttribute("href")).toBe("mailto:info@begina.cz");
  });
});

describe("informační stránky", () => {
  it("Doprava: způsoby doručení a platby z dat pokladny (ceny, splatnost)", () => {
    render(<InfoPageView page={INFO_PAGES.shipping} />);
    expect(screen.getByRole("heading", { level: 1, name: "Doprava a platba" })).toBeTruthy();
    expect(screen.getByText(/Osobní odběr – Zahradní Bistro Begina, Vitice 119 — zdarma\. Vyzvednutí je možné po předchozí domluvě\./)).toBeTruthy();
    expect(screen.getByText(/Chlazená přeprava — 99\s+Kč\./)).toBeTruthy();
    expect(screen.getByText(/Splatnost je 5 dní/)).toBeTruthy();
  });

  it("O nás: text z begina.cz/o-nas (dodaný 4. 10. 2026), celý a v pořadí", () => {
    render(<InfoPageView page={INFO_PAGES.about} />);
    expect(screen.getByRole("heading", { level: 1, name: "O nás" })).toBeTruthy();
    const text = document.querySelector("article")!.textContent!;
    const order = [
      "Chuť je pro mě základ.",
      "v roce 2018",
      "Bag-in-Box systém",
      "V roce 2023 jsem potkal Lucii",
      "Simon Gallery",
      "postavili značku Begina.",
      "že když něco chutná dobře, poznáš to hned.",
      "v praktickém balení pro každodenní použití.",
      "Bag-in-Box balení o objemu 3 litry.",
      "✔ profesionální příprava",
      "✔ bez lepku",
      "Jednoduchý způsob, jak mít čerstvou polévku nebo nápoj vždy po ruce.",
    ];
    const positions = order.map((part) => text.indexOf(part));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(INFO_PAGES.about.pendingNote).toBeUndefined();
  });

  it("O vodě: text z begina.cz/o-vode (dodaný 3. 10. 2026), celý a v pořadí", () => {
    render(<InfoPageView page={INFO_PAGES.water} />);
    expect(screen.getByRole("heading", { level: 1, name: "Voda je základ" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Kvalita vody je pro nás důležitá" })).toBeTruthy();
    const text = document.querySelector("article")!.textContent!;
    const order = [
      "Voda je nezbytnou součástí života.",
      "přibližně 71 % povrchu Země",
      "hydrataci buněk, trávení a vstřebávání živin.",
      "součástí zdravého životního stylu.",
      "Kvalita vody je pro nás důležitá",
      "konzistentní kvality napříč celou výrobou.",
      "nechat vyniknout chuť použitých surovin.",
    ];
    const positions = order.map((part) => text.indexOf(part));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(existsSync(path.join(ESHOP_APP, INFO_PAGES.water.path, "page.tsx"))).toBe(true);
  });

  it("GDPR: text dodaný 8. 10. 2026, celý a v pořadí (články I–XIII, odrážky, odstavce za nimi)", () => {
    const blocks = INFO_PAGES.privacy.blocks!;
    expect(blocks.filter((b) => b.heading).map((b) => b.heading!.split(".")[0])).toEqual([
      "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII",
    ]);
    // počty odrážek přesně podle dodaného znění: II, III.1, III.3, V, VI, IX
    expect(blocks.filter((b) => b.items).map((b) => b.items!.length)).toEqual([11, 7, 6, 7, 8, 9]);
    render(<InfoPageView page={INFO_PAGES.privacy} />);
    expect(screen.getByRole("heading", { level: 1, name: "Ochrana osobních údajů (GDPR)" })).toBeTruthy();
    expect(screen.getByText("Platné a účinné od 22. září 2026")).toBeTruthy();
    expect(screen.queryByText("Text připravujeme.")).toBeNull();
    const text = document.querySelector("article")!.textContent!;
    const order = [
      "Správcem osobních údajů je:",
      "IČO: 74337297",
      "Kontaktní provozovna a korespondenční adresa:",
      "dále jen „správce“.",
      "jméno a příjmení,",
      "IP adresu, technické údaje o zařízení a údaje získané prostřednictvím cookies.",
      "Správce nezískává ani neuchovává celé údaje o platební kartě.",
      "1. Vyřízení objednávky a plnění kupní smlouvy",
      "vedení zákaznického účtu.",
      "Právním důvodem je plnění smlouvy nebo provedení opatření před uzavřením smlouvy.",
      "2. Plnění právních povinností",
      "3. Ochrana práv a oprávněných zájmů",
      "Právním důvodem je oprávněný zájem správce.",
      "4. Marketingová komunikace",
      "IV. Osobní údaje související s prodejem alkoholu",
      "zpravidla 5 nebo 10 let podle druhu dokumentu",
      "až do konečného vyřešení dané záležitosti.",
      "dopravcům zajišťujícím chlazenou přepravu,",
      "Osobní údaje neprodáváme ani neposkytujeme třetím osobám",
      "standardních smluvních doložek.",
      "Nezbytné cookies",
      "Analytické a marketingové cookies",
      "podat stížnost u dozorového úřadu.",
      "Odvoláním souhlasu není dotčena zákonnost zpracování",
      "Úřadu pro ochranu osobních údajů",
      "Pplk. Sochora 27",
      "XI. Automatizované rozhodování",
      "XII. Zabezpečení osobních údajů",
      "Tyto zásady ochrany osobních údajů jsou platné a účinné od 22. září 2026.",
      "www.begina.cz/gdpr/",
    ];
    const positions = order.map((part) => text.indexOf(part));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(screen.getAllByRole("link", { name: "www.uoou.gov.cz" })).toHaveLength(1);
    // čl. XIII: celá adresa je odkaz (dnes na begina.cz, po přepnutí domény přesměrování v proxy.ts)
    expect(screen.getByRole("link", { name: "www.begina.cz/gdpr/" }).getAttribute("href")).toBe("https://www.begina.cz/gdpr/");
    expect(screen.getAllByRole("link", { name: "info@begina.cz" }).length).toBeGreaterThanOrEqual(3);
    expect(existsSync(path.join(ESHOP_APP, INFO_PAGES.privacy.path, "page.tsx"))).toBe(true);
  });
});

describe("obchodní podmínky (text dodaný 3. 10. 2026)", () => {
  const POINTS_V1 = [
    ["I", 4], ["II", 5], ["III", 5], ["IV", 7], ["V", 7], ["VI", 11], ["VII", 8],
    ["VIII", 13], ["IX", 4], ["X", 7], ["XI", 2], ["XII", 2], ["XIII", 6],
  ];

  it("1. znění (22. 9. 2026): 13 článků I–XIII s počty bodů přesně podle dodaného znění", () => {
    const blocks = LEGACY_TERMS.blocks;
    expect(blocks.map((b) => [b.heading!.split(".")[0], b.points!.length])).toEqual(POINTS_V1);
    const subItems = blocks.flatMap((b) => b.points!.map((p) => p.items?.length ?? 0)).filter(Boolean);
    expect(subItems).toEqual([6, 3, 5, 5, 7, 3, 5, 5]);
  });

  it("platné znění (3. vydání) = 1. znění s novým čl. I, VII a VIII + příloha s formulářem; nic jiného", () => {
    const blocks = INFO_PAGES.terms.blocks!;
    expect(blocks).toBe(CURRENT_TERMS.blocks);
    const articles = blocks.slice(0, 13);
    expect(articles.map((b) => [b.heading!.split(".")[0], b.points!.length])).toEqual(
      POINTS_V1.map(([h, n]) => [h, h === "I" ? 5 : h === "VII" ? 13 : h === "VIII" ? n + 1 : n])
    );
    // ostatní články beze změny proti dodanému znění
    for (const i of [1, 2, 3, 4, 5, 8, 9, 10, 11, 12]) expect(articles[i]).toEqual(LEGACY_TERMS.blocks[i]);
    expect(blocks[13].heading).toBe("Příloha: Vzorový formulář pro odstoupení od smlouvy");
    expect(blocks).toHaveLength(14);
  });

  it("stránka: nadpis, účinnost, číslované body, formulář, PDF ke stažení, odkazy na e-mail, telefon, ČOI", () => {
    render(<InfoPageView page={INFO_PAGES.terms} />);
    expect(screen.getByRole("heading", { level: 1, name: "Obchodní podmínky e-shopu Begina.cz" })).toBeTruthy();
    expect(screen.getByText(`Platné a účinné od ${CURRENT_TERMS.effectiveLabel}`)).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(14);
    expect(screen.getByText(/Prodávající není plátcem daně z přidané hodnoty\./)).toBeTruthy();
    expect(screen.getByText(`Tyto obchodní podmínky jsou platné a účinné od ${CURRENT_TERMS.effectiveLabel}.`)).toBeTruthy();
    expect(screen.getByText(/Použití formuláře není podmínkou odstoupení od smlouvy\./)).toBeTruthy();
    expect(screen.getByText("Číslo objednávky (nepovinné):")).toBeTruthy();
    const form = screen.getByRole("link", { name: "Stáhnout formulář pro odstoupení od smlouvy (PDF)" });
    expect(form.getAttribute("href")).toBe("/eshop/obchodni-podminky/formular-pro-odstoupeni-od-smlouvy.pdf");
    const pdf = screen.getByRole("link", { name: "Stáhnout obchodní podmínky včetně formuláře pro odstoupení (PDF)" });
    // bez EshopBaseProvider = moje.begina.cz (/eshop/…)
    expect(pdf.getAttribute("href")).toBe(`/eshop/obchodni-podminky/${CURRENT_TERMS.id}.pdf`);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["mailto:info@begina.cz", "tel:+420774199975", "https://www.coi.cz", "https://adr.coi.cz", "https://www.begina.cz"]));
  });
});

describe("odkazy na právní stránky ze starého webu begina.cz", () => {
  it("/gdpr, /obchodni-podminky, /doprava přesměrují na stránky e-shopu a cíle existují (proxy.ts)", async () => {
    const { route } = await import("@/lib/site/routing");
    const cases = [
      ["/gdpr", INFO_PAGES.privacy.path],
      ["/obchodni-podminky", INFO_PAGES.terms.path],
      ["/doprava", INFO_PAGES.shipping.path],
    ] as const;
    for (const [source, target] of cases) {
      // moje.begina.cz: dočasně (307) na /eshop/… — jako dosud v next.config.ts
      expect(route({ host: "moje.begina.cz", pathname: source, search: "", method: "GET" }, {})).toEqual({
        kind: "redirect",
        location: `/eshop${target}`,
        status: 307,
      });
      expect(existsSync(path.join(ESHOP_APP, target, "page.tsx"))).toBe(true);
      // zdroj nesmí přepsat existující stránku aplikace
      expect(existsSync(path.join(APP, source))).toBe(false);
    }
    // begina.cz: /gdpr → GDPR natrvalo; /obchodni-podminky a /doprava jsou přímo stránky
    expect(route({ host: "begina.cz", pathname: "/gdpr", search: "", method: "GET" }, {})).toEqual({
      kind: "redirect",
      location: `https://begina.cz${INFO_PAGES.privacy.path}`,
      status: 301,
    });
  });

  it("adresa s cestou je celá odkaz, tečka za větou do odkazu nepatří", async () => {
    const { linkify } = await import("../eshop/InfoPageView");
    render(<p>{linkify("Aktuální znění je na adrese www.begina.cz/gdpr/. Obchod: www.begina.cz.")}</p>);
    expect(screen.getByRole("link", { name: "www.begina.cz/gdpr/" }).getAttribute("href")).toBe("https://www.begina.cz/gdpr/");
    expect(screen.getByRole("link", { name: "www.begina.cz" }).getAttribute("href")).toBe("https://www.begina.cz");
  });
});
