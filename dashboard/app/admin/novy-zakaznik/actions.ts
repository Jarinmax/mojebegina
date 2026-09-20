"use server";

// Security Phase 5 — jediná "use server" hranice pro založení zákazníka.
// Samotná logika (autorizace, Neon Auth, DB, e-mail) žije v
// lib/data/admin.ts — tahle funkce jen převádí FormData na typovaný vstup
// a výsledek na stav pro formulář.
import { redirect } from "next/navigation";
import { createCustomerOrganization } from "@/lib/data/admin";

export type NovyZakaznikState = { error: string } | null;

export async function createCustomerAction(
  _prevState: NovyZakaznikState,
  formData: FormData
): Promise<NovyZakaznikState> {
  const result = await createCustomerOrganization({
    name: String(formData.get("name") ?? ""),
    ico: String(formData.get("ico") ?? ""),
    registeredAddress: String(formData.get("registeredAddress") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  const suffix = result.emailSent ? "vytvoreno=1" : "vytvoreno=1&email=0";
  redirect(`/admin/organizace/${result.organizationId}?${suffix}`);
}
