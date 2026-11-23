// Stránky pro dotazy ve vyhledávačích a AI, llms.txt a IndexNow (20. 11. 2026).
import { describe, expect, it } from "vitest";
import { LANDING_PAGES } from "../landingPages";
import { llmsTxt } from "@/lib/site/llmsTxt";
import { deployedRecently, indexNowPayload, INDEXNOW_KEY } from "@/lib/site/indexNow";
import { faqJsonLd } from "../seo";

const allText = (page: (typeof LANDING_PAGES)[number]) =>
  [page.title, page.description, ...page.intro, ...page.benefits.flatMap((b) => [b.title, b.text]), ...page.faq.flatMap((f) => [f.question, f.answer])].join(" ");

describe("stránky pro gastro", () => {
  it("čtyři stránky ze zadání s nadpisy", () => {
    expect(LANDING_PAGES.map((p) => [p.path, p.title])).toEqual([
      ["/polevky-pro-kavarny", "Hotové polévky pro kavárny a bistra s dovozem po celé ČR"],
      ["/veganske-polevky", "Veganské polévky pro kavárny a bistra"],
      ["/bylinne-sirupy-pro-kavarny", "Bylinné sirupy pro kavárny a bary"],
      ["/caje-a-limonady-pro-gastro", "Čaje a nápoje z kohoutku pro gastro"],
    ]);
  });

  it("4–6 otázek, odkazy na produkty, bez lepku a zdravotních tvrzení, alkohol ne jako rostlinný", () => {
    for (const page of LANDING_PAGES) {
      expect(page.faq.length).toBeGreaterThanOrEqual(4);
      expect(page.faq.length).toBeLessThanOrEqual(6);
      expect(page.links.length).toBeGreaterThan(0);
      const text = allText(page);
      expect(text).not.toMatch(/lepk|bezlepk|zdrav|imunit|detox|léčí|vitamín/i);
      expect(text).not.toMatch(/koktejl[^.]*rostlinn|alkohol[^.]*rostlinn/i);
      expect(faqJsonLd(page.faq).mainEntity).toHaveLength(page.faq.length);
    }
  });

  it("údaje jako na webu", () => {
    const text = LANDING_PAGES.map(allText).join(" ");
    expect(text).toContain("31,58 Kč");
    expect(text.replace(/[\u00a0\u202f]/g, " ")).toContain("Od 3,92 Kč za nápoj (200 ml) včetně dopravy při objednávce 3 × 3 l sirupu.");
    expect(text).not.toContain("3,33 Kč");
    expect(text).toContain("14 dní");
  });
});

describe("llms.txt", () => {
  it("popis, kontakt a odkazy na hlavní stránky i stránky pro gastro", () => {
    const txt = llmsTxt();
    expect(txt.startsWith("# Begina\n")).toBe(true);
    expect(txt).toContain("info@begina.cz");
    expect(txt).toContain("https://begina.cz/pro-kavarny");
    for (const page of LANDING_PAGES) expect(txt).toContain(`https://begina.cz${page.path}`);
    expect(txt).not.toMatch(/lepk|zdrav/i);
  });
});

describe("IndexNow", () => {
  it("jen adresy begina.cz, bez duplicit, s klíčem a jeho umístěním", () => {
    const payload = indexNowPayload(["https://begina.cz/a", "https://begina.cz/a", "https://jinde.cz/b", "nesmysl"]);
    expect(payload).toEqual({ host: "begina.cz", key: INDEXNOW_KEY, keyLocation: `https://begina.cz/${INDEXNOW_KEY}.txt`, urlList: ["https://begina.cz/a"] });
  });

  it("nové nasazení = build mladší než okno", () => {
    const now = new Date("2026-11-21T05:00:00Z");
    expect(deployedRecently("2026-11-20T20:00:00Z", now, 25)).toBe(true);
    expect(deployedRecently("2026-11-19T20:00:00Z", now, 25)).toBe(false);
    expect(deployedRecently(undefined, now)).toBe(false);
  });
});
