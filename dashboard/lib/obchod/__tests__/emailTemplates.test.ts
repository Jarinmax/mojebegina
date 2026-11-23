import { describe, expect, it } from "vitest";
import { emailTemplates, mailtoHref, salesPhoneFor } from "../emailTemplates";

describe("emailTemplates", () => {
  it("podpis obchodníka a odkaz na Pro kavárny", () => {
    const [po, ne] = emailTemplates("Jaroslav Blahout", salesPhoneFor("06240ac4-c050-47ea-998c-6c81389edf9f"));
    expect(po.body).toContain("Jaroslav Blahout\ntel. +420 724 223 594\nBegina · begina.cz");
    expect(emailTemplates("Jaroslav Viner", salesPhoneFor("de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c"))[0].body).toContain("Jaroslav Viner\ntel. +420 774 199 975");
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
