// Kdo smí vystavit fakturu do iDokladu: konkrétní osoba A její aktivní role.
import { describe, expect, it } from "vitest";
import { isInvoiceIssuer } from "../invoiceAuth";
import type { AuthContext, SystemRole } from "../types";

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const LUCIE = "f9f93f03-92b0-4724-becd-c0a3576b5275";

function ctx(userId: string, systemRole: SystemRole, roleSelectionRequired = false): AuthContext {
  return { userId, systemRole, grantedRoles: [systemRole], roleSelectionRequired, name: null, email: "x@begina.test" } as AuthContext;
}

describe("isInvoiceIssuer", () => {
  it("Jaroslav Viner jako ADMIN, Lucie Königsbergová jako EXECUTIVE (8. 10. 2026)", () => {
    expect(isInvoiceIssuer(ctx(VINER, "ADMIN"))).toBe(true);
    expect(isInvoiceIssuer(ctx(LUCIE, "EXECUTIVE"))).toBe(true);
  });

  it("Lucie s aktivní rolí CUSTOMER nebo před výběrem role ne", () => {
    expect(isInvoiceIssuer(ctx(LUCIE, "CUSTOMER"))).toBe(false);
    expect(isInvoiceIssuer(ctx(LUCIE, "EXECUTIVE", true))).toBe(false);
  });

  it("jiná osoba ani s rolí ADMIN/EXECUTIVE ne; nepřihlášený ne", () => {
    expect(isInvoiceIssuer(ctx("jiny", "ADMIN"))).toBe(false);
    expect(isInvoiceIssuer(ctx("jiny", "EXECUTIVE"))).toBe(false);
    expect(isInvoiceIssuer(ctx(VINER, "EXECUTIVE"))).toBe(false);
    expect(isInvoiceIssuer(null)).toBe(false);
  });
});
