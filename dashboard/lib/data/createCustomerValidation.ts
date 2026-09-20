// Security Phase 5 — čistá validace vstupu pro založení zákazníka, oddělená
// od lib/data/admin.ts (to má "server-only" a DB/Neon Auth I/O) stejným
// způsobem jako adminAuth.ts/authz.ts: žádné I/O, testovatelné proti
// syntetickým datům bez databáze.

export type CreateCustomerInput = {
  name: string;
  ico: string;
  registeredAddress: string;
  contactName: string;
  contactEmail: string;
};

const ICO_RE = /^\d{8}$/;
// Jednoduchá, záměrně shovívavá kontrola tvaru e-mailu — přesnou validitu
// stejně ověří až Neon Auth při vytváření uživatele.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCreateCustomerInput(
  input: CreateCustomerInput
): { ok: true; value: CreateCustomerInput } | { ok: false; error: string } {
  const name = input.name.trim();
  const ico = input.ico.trim();
  const registeredAddress = input.registeredAddress.trim();
  const contactName = input.contactName.trim();
  const contactEmail = input.contactEmail.trim();

  if (!name) return { ok: false, error: "Vyplňte název firmy." };
  if (!ICO_RE.test(ico)) return { ok: false, error: "IČO musí mít přesně 8 číslic." };
  if (!registeredAddress) return { ok: false, error: "Vyplňte adresu sídla." };
  if (!contactName) return { ok: false, error: "Vyplňte jméno kontaktní osoby." };
  if (!EMAIL_RE.test(contactEmail)) return { ok: false, error: "Zadejte platný e-mail." };

  return {
    ok: true,
    value: { name, ico, registeredAddress, contactName, contactEmail },
  };
}
