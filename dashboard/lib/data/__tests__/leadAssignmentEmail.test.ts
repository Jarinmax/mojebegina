import { describe, expect, it } from "vitest";
import { buildLeadAssignmentEmail } from "../leadAssignmentEmail";

describe("e-mail obchodníkovi o přiřazeném leadu", () => {
  it("obsahuje kontakt, odkaz a slib odpovědi", () => {
    const mail = buildLeadAssignmentEmail({
      ownerName: "Jaroslav Blahout",
      assignedBy: "Lucie Königsbergová",
      displayName: "LumoKids",
      contactName: "Diana Svoboda",
      phone: "607026669",
      email: "diana@lumokids.cz",
      city: "Praha",
      sourceLabel: "web – stránka Pro kavárny a bistra",
      formNote: "Formulář „Chci ochutnávku do provozu“ vyplněn 19. 11. 2026 20:58.",
      leadUrl: "https://moje.begina.cz/rizeni-firmy/obchod/leady/abc",
      promisedReply: true,
    });
    expect(mail.subject).toBe("Nový lead pro tebe: LumoKids (Praha) – zavolej");
    expect(mail.text).toContain("Ahoj Jaroslav,");
    expect(mail.text).toContain("Telefon: 607026669");
    expect(mail.text).toContain("Kontakt: Diana Svoboda");
    expect(mail.text).toContain("do 2 pracovních dnů");
    expect(mail.html).toContain('<a href="https://moje.begina.cz/rizeni-firmy/obchod/leady/abc">');
  });
});
