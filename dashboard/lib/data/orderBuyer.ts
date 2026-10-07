// ESHOP 1.0, krok 7 — objednávka nemusí mít organizaci (soukromý zákazník
// z e-shopu, buyer_organization_id = NULL). Čisté pomocné funkce bez DB,
// sdílené Objednávkami a CRM, aby NULL nikde neprosákl do dotazu
// `inArray(organizations.id, …)` ani do Map klíčů.

export const PRIVATE_CUSTOMER_LABEL = "Soukromý zákazník";

/** Unikátní id organizací z objednávek, bez NULL (soukromí zákazníci). */
export function distinctOrganizationIds(rows: { buyerOrganizationId: string | null }[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.buyerOrganizationId) ids.add(row.buyerOrganizationId);
  }
  return [...ids];
}

/** Co ukázat jako zákazníka objednávky v seznamu a v detailu. */
export function buyerDisplayName(
  buyerOrganizationId: string | null,
  orgNameById: Map<string, string>
): string {
  if (!buyerOrganizationId) return PRIVATE_CUSTOMER_LABEL;
  return orgNameById.get(buyerOrganizationId) ?? "Neznámá organizace";
}

/** „č. 5094“ — číslo objednávky pro zákazníka; NULL dokud se nečísluje (krok 6b). */
export function formatOrderNumber(orderNumber: number | null): string | null {
  return orderNumber === null ? null : `č. ${orderNumber}`;
}
