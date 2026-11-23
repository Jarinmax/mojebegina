import { describe, expect, it } from "vitest";
import { emailTemplates, mailtoHref } from "../emailTemplates";

describe("emailTemplates", () => {
  it("podpis obchodníka a odkaz na Pro kavárny", () => {
    const [po, ne] = emailTemplates("Jaroslav Blahout");
    expect(po.body).toContain("Jaroslav Blahout\nBegina · begina.cz");
    expect(po.body).toContain("https://begina.cz/pro-kavarny");
    expect(ne.subject).toBe("Begina – zkoušeli jsme vám volat");
  });
  it("mailto s diakritikou a zalomením řádků", () => {
    const href = mailtoHref("volnocaskov@gmail.com", { subject: "Begina – děkuji", body: "Dobrý den,\n\nahoj" });
    expect(href.startsWith("mailto:volnocaskov@gmail.com?subject=")).toBe(true);
    expect(href).toContain("%0A%0A");
    expect(decodeURIComponent(href.split("subject=")[1].split("&")[0])).toBe("Begina – děkuji");
  });
});
