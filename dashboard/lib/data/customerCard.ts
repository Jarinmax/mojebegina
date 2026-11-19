// Karta zákazníka — název karty vs. fakturační jméno (migrace 0056, Jarin
// 19. 11. 2026). Čistá logika bez DB, aby šla testovat; zápis je
// updateCustomerCard v leads.ts.

/**
 * Čistá logika změny karty (testovatelná bez DB). Když se karta přejmenovává
 * a fakturační jméno ještě není vyplněné, dosavadní název se zachová jako
 * fakturační jméno — faktury se přejmenováním karty nikdy tiše nezmění.
 */
export function planCustomerCardChange(
  current: { name: string; billingName: string | null },
  input: { name?: string; billingName?: string | null }
): { name: string; billingName: string | null; changed: string[] } {
  const clean = (v: string | null | undefined) => (v == null ? null : v.trim().replace(/\s+/g, " ") || null);
  const nextName = input.name !== undefined ? clean(input.name) ?? current.name : current.name;
  let nextBilling = clean(current.billingName);
  if (input.billingName !== undefined) nextBilling = clean(input.billingName);
  else if (nextName !== current.name && !nextBilling) nextBilling = current.name;
  if (nextBilling === nextName) nextBilling = null;
  const changed: string[] = [];
  if (nextName !== current.name) changed.push("name");
  if (nextBilling !== clean(current.billingName)) changed.push("billing_name");
  return { name: nextName, billingName: nextBilling, changed };
}

