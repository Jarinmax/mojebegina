// Security Phase 6 — čistá validace pro správu existující organizace,
// oddělená od lib/data/admin.ts stejně jako createCustomerValidation.ts:
// žádné I/O, testovatelné proti syntetickým datům.

const ICO_RE = /^\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type UpdateOrganizationInput = {
  name: string;
  ico: string;
  registeredAddress: string;
  status: string;
};

export type UpdateOrganizationValue = {
  name: string;
  ico: string;
  registeredAddress: string;
  status: string | null;
};

// IČO je teď editovatelné (ADMIN musí umět opravit chybu při založení) —
// stejná kontrola tvaru jako při vytvoření organizace ve Fázi 5. Ověření
// proti ARES je samostatná, pozdější fáze.
export function validateUpdateOrganizationInput(
  input: UpdateOrganizationInput
): { ok: true; value: UpdateOrganizationValue } | { ok: false; error: string } {
  const name = input.name.trim();
  const ico = input.ico.trim();
  const registeredAddress = input.registeredAddress.trim();
  const status = input.status.trim();

  if (!name) return { ok: false, error: "Vyplňte název firmy." };
  if (!ICO_RE.test(ico)) return { ok: false, error: "IČO musí mít přesně 8 číslic." };
  if (!registeredAddress) return { ok: false, error: "Vyplňte adresu sídla." };

  return {
    ok: true,
    value: { name, ico, registeredAddress, status: status || null },
  };
}

export type AddMemberInput = {
  name: string;
  email: string;
  role: string;
};

export type AddMemberValue = {
  name: string;
  email: string;
  role: "owner" | "member";
};

export function validateAddMemberInput(
  input: AddMemberInput
): { ok: true; value: AddMemberValue } | { ok: false; error: string } {
  const name = input.name.trim();
  const email = input.email.trim();

  if (!name) return { ok: false, error: "Vyplňte jméno." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Zadejte platný e-mail." };
  if (input.role !== "owner" && input.role !== "member") {
    return { ok: false, error: "Neplatná role." };
  }

  return { ok: true, value: { name, email, role: input.role } };
}
