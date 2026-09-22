// Security Phase 13 — čistá rozhodovací logika pro "Nový zákazník" flow.
// Oprava mezery zjištěné při zakládání Fillette s.r.o.: createCustomerOrganization
// dřív vždy volala auth.admin.createUser bez ohledu na to, jestli e-mail
// v Neon Auth už existuje, a na existující e-mail vždy selhala
// (USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL). Email-reuse logika (Fáze 6)
// existovala jen v addOrganizationMember, která ale vyžaduje už existující
// organizaci — nešla použít na "založ NOVOU organizaci pro existující
// identitu". Tahle funkce sjednocuje obě cesty do jednoho rozhodnutí, beze
// I/O, testovatelná bez DB/Auth (stejný princip jako statusPropagation.ts).
//
// Dvě věci, které plán řeší, a proč jsou nezávislé:
//
// 1) user_activations (pozvánka/aktivace) je vlastnost IDENTITY, ne
//    jednotlivého membershipu (primární klíč je jen userId, viz
//    schema.ts) — exekuční vrstva (admin.ts) proto ve větvi "reuse_user"
//    tuhle tabulku NIKDY nezakládá ani neupravuje, ať uživatel byl, nebo
//    nebyl dřív pozvaný/aktivovaný. Typ CreateCustomerPlan pro
//    "reuse_user" ani žádné pole k jejímu ovlivnění nemá — nejde ji
//    odsud omylem zapnout.
//
// 2) systemRole (user_roles) je oddělená, explicitní tabulka, kterou
//    appka jinak NIKDY sama nezakládá (CUSTOMER dnes vzniká jen "žádný
//    řádek v user_roles = CUSTOMER" bezpečným defaultem, viz
//    authContext.ts). Pro existující identitu, co už má jinou roli (např.
//    EXECUTIVE), by bez explicitního CUSTOMER řádku zůstala bez možnosti
//    přepnout na "Zákaznický účet" u nově založené organizace — vlastnila
//    by ji v DB, ale nemohla by ji nikde vidět. `grantCustomerRole` proto
//    záleží JEN na tom, jestli CUSTOMER řádek už má (z libovolné jiné
//    organizace, viz uniqueIndex(userId, systemRole) v schema.ts) —
//    existující role (EXECUTIVE/ADMIN/EMPLOYEE) se nikdy nemažou ani
//    neupravují, jen se případně PŘIDÁ jeden nový řádek.
export type ExistingUserInfo = {
  id: string;
  hasCustomerRole: boolean;
};

export type CreateCustomerPlan =
  | { mode: "new_user" }
  | { mode: "reuse_user"; userId: string; grantCustomerRole: boolean };

export function planCustomerCreation(
  existingUser: ExistingUserInfo | null
): CreateCustomerPlan {
  if (!existingUser) {
    return { mode: "new_user" };
  }
  return {
    mode: "reuse_user",
    userId: existingUser.id,
    grantCustomerRole: !existingUser.hasCustomerRole,
  };
}
