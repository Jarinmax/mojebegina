// Security Phase 14 — čisté rozhodnutí "potřebuje se user_profiles zapsat",
// oddělené od I/O (SELECT/UPSERT viz userProfiles.ts), testovatelné bez DB,
// stejný princip jako statusPropagation.ts/createCustomerPlan.ts.
export type ProfileSnapshot = { name: string | null; email: string };

export function hasProfileChanged(
  existing: ProfileSnapshot | null,
  incoming: ProfileSnapshot
): boolean {
  if (!existing) {
    return true;
  }
  return existing.name !== incoming.name || existing.email !== incoming.email;
}
