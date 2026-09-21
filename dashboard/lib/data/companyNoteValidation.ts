// Security Phase 10 (Řízení firmy 1.0) — validace zápisu ze schůzky. Čistá
// funkce bez "server-only", testovatelná stejně jako
// createCustomerValidation.ts/organizationAdminValidation.ts.
export type CompanyNoteInput = {
  title: string;
  body: string;
};

export type CompanyNoteValue = {
  title: string;
  body: string;
};

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 5000;

export function validateCompanyNoteInput(
  input: CompanyNoteInput
): { ok: true; value: CompanyNoteValue } | { ok: false; error: string } {
  const title = input.title.trim();
  const body = input.body.trim();

  if (!title) {
    return { ok: false, error: "Zadejte název zápisu." };
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return { ok: false, error: `Název může mít nejvýše ${MAX_TITLE_LENGTH} znaků.` };
  }
  if (!body) {
    return { ok: false, error: "Zadejte text zápisu." };
  }
  if (body.length > MAX_BODY_LENGTH) {
    return { ok: false, error: `Text může mít nejvýše ${MAX_BODY_LENGTH} znaků.` };
  }

  return { ok: true, value: { title, body } };
}
