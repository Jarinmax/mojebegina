import { describe, expect, it } from "vitest";
import {
  REVIEW_VERIFICATION_NOTICE,
  cleanAuthorName,
  countLabel,
  defaultAuthorName,
  emailFromOptoutToken,
  formatAverage,
  optoutToken,
  orderIdFromReviewToken,
  parseReview,
  reviewRequestEmail,
  reviewSecret,
  reviewToken,
  summarize,
} from "../reviews";

const nbsp = (s: string) => s.replace(/ /g, " ");
const ORDER = "3f2b8c1e-5a47-4d1b-9c0e-7a6b5d4c3b2a";
const secret = reviewSecret({ CRON_SECRET: "tajne" })!;

describe("hodnocení produktů", () => {
  it("odkaz na formulář platí jen pro svou objednávku a jen s naším podpisem", () => {
    const token = reviewToken(ORDER, secret);
    expect(orderIdFromReviewToken(token, secret)).toBe(ORDER);
    expect(orderIdFromReviewToken(token, reviewSecret({ CRON_SECRET: "jine" })!)).toBeNull();
    expect(orderIdFromReviewToken(token.slice(0, -2) + "xx", secret)).toBeNull();
    const other = reviewToken("11111111-2222-4333-8444-555555555555", secret);
    expect(orderIdFromReviewToken(`${token.split(".")[0]}.${other.split(".")[1]}`, secret)).toBeNull();
    expect(orderIdFromReviewToken("nesmysl", secret)).toBeNull();
    // odhlašovací odkaz nejde použít jako odkaz na hodnocení a naopak
    expect(orderIdFromReviewToken(optoutToken("a@b.cz", secret), secret)).toBeNull();
    expect(emailFromOptoutToken(token, secret)).toBeNull();
    expect(reviewSecret({})).toBeNull();
  });

  it("odhlášení: e-mail malými písmeny", () => {
    expect(emailFromOptoutToken(optoutToken(" Jana@Seznam.cz ", secret), secret)).toBe("jana@seznam.cz");
  });

  it("průměr, počet a podpis", () => {
    expect(summarize([])).toBeNull();
    expect(summarize([5, 4, 4])).toEqual({ average: 4.3, count: 3 });
    expect(nbsp(formatAverage(5))).toBe("5,0");
    expect(countLabel(1)).toBe("1 hodnocení");
    expect(defaultAuthorName("Ing. Jana Nováková")).toBe("Jana N.");
    expect(defaultAuthorName("Jiří Průcha")).toBe("Jiří P.");
    expect(defaultAuthorName("")).toBe("Zákazník");
    expect(cleanAuthorName("  ", "Jana N.")).toBe("Jana N.");
    expect(cleanAuthorName(" Jana  z Prahy ", "x")).toBe("Jana z Prahy");
  });

  it("formulář: hvězdičky 1–5, text nepovinný, text bez hvězdiček je chyba", () => {
    expect(parseReview("p", "", "")).toBeNull();
    expect(parseReview("p", "5", "  Výborná.  ")).toEqual({ productId: "p", rating: 5, body: "Výborná." });
    expect(parseReview("p", "1", "")).toEqual({ productId: "p", rating: 1, body: "" });
    expect(parseReview("p", "6", "")).toHaveProperty("error");
    expect(parseReview("p", "2.5", "")).toHaveProperty("error");
    expect(parseReview("p", "", "text")).toHaveProperty("error");
    expect(parseReview("p", "4", "x".repeat(1501))).toHaveProperty("error");
  });

  it("e-mail: oslovení 5. pádem, nikdy celé jméno; podpis tým Begina; odkaz na odhlášení", () => {
    const base = { reviewUrl: "https://begina.cz/hodnoceni/t", optoutUrl: "https://begina.cz/odhlaseni/o" };
    const man = reviewRequestEmail({ ...base, customerName: "Jiří Průcha" });
    expect(man.subject).toBe("Jak vám chutná begina?");
    expect(man.text.startsWith("Dobrý den, pane Průcho,")).toBe(true);
    expect(man.text).not.toContain("Jiří");
    expect(reviewRequestEmail({ ...base, customerName: "Karolína Pospíšilová" }).greeting).toBe("Dobrý den, paní Pospíšilová,");
    // jméno, ze kterého 5. pád spolehlivě nejde (firma, jedno slovo) → neutrální oslovení
    expect(reviewRequestEmail({ ...base, customerName: "Bistro U Lípy" }).greeting).toBe("Dobrý den,");
    for (const part of ["S přátelským pozdravem", "tým Begina", "+420 774 199 975", "info@begina.cz", "www.begina.cz", base.reviewUrl, base.optoutUrl, REVIEW_VERIFICATION_NOTICE]) {
      expect(man.text).toContain(part);
    }
    expect(man.html).toContain('href="https://begina.cz/hodnoceni/t"');
    expect(man.html).toContain("Odhlásit se");
    expect(reviewRequestEmail({ ...base, customerName: null, test: true }).subject).toBe("[TEST] Jak vám chutná begina?");
  });
});
