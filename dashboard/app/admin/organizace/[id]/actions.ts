"use server";

// Security Phase 6 — "use server" hranice pro správu existující
// organizace. Logika (autorizace, Neon Auth, DB) žije v lib/data/admin.ts
// stejně jako u Fáze 5. organizationId/userId se sem předávají přes
// .bind() z klientských komponent, ne přes hodnotu z FormData — ADMIN má
// stejně neomezený přístup napříč všemi organizacemi (viz authz.ts), takže
// v tom není IDOR riziko, jen čistší API než skryté input pole.
import { revalidatePath } from "next/cache";
import {
  addOrganizationMember,
  inviteCustomer,
  removeOrganizationMember,
  resendActivationLink,
  updateOrganization,
} from "@/lib/data/admin";

export type ActionState = { error: string } | { success: string } | null;

export async function updateOrganizationAction(
  organizationId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await updateOrganization(organizationId, {
    name: String(formData.get("name") ?? ""),
    ico: String(formData.get("ico") ?? ""),
    registeredAddress: String(formData.get("registeredAddress") ?? ""),
    status: String(formData.get("status") ?? ""),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/admin/organizace/${organizationId}`);
  return { success: "Údaje organizace byly uloženy." };
}

export async function addMemberAction(
  organizationId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const role = String(formData.get("role") ?? "member");
  const result = await addOrganizationMember(organizationId, {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: role === "owner" ? "owner" : "member",
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/admin/organizace/${organizationId}`);

  if (!result.created) {
    return { success: "Uživatel už měl účet — byl přidán k organizaci." };
  }
  return {
    success: "Uživatel byl založen. Až budete připraveni, pozvěte ho tlačítkem „Pozvat zákazníka“.",
  };
}

export async function inviteCustomerAction(
  organizationId: string,
  userId: string,
  _prevState: ActionState,
  _formData: FormData
): Promise<ActionState> {
  void _prevState;
  void _formData;

  const result = await inviteCustomer(userId);

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/admin/organizace/${organizationId}`);
  return { success: "Zákazník byl pozván — e-mail s odkazem na nastavení hesla byl odeslán." };
}

export async function removeMemberAction(
  organizationId: string,
  userId: string,
  _prevState: ActionState,
  _formData: FormData
): Promise<ActionState> {
  // useActionState vyžaduje přesně tuhle signaturu — organizationId/userId
  // přijdou přes .bind(), prevState/formData se tu nepoužívají.
  void _prevState;
  void _formData;

  const result = await removeOrganizationMember(organizationId, userId);

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/admin/organizace/${organizationId}`);
  return { success: "Přístup byl odebrán." };
}

export async function resendActivationAction(
  userId: string,
  _prevState: ActionState,
  _formData: FormData
): Promise<ActionState> {
  void _prevState;
  void _formData;

  const result = await resendActivationLink(userId);

  if (!result.ok) {
    return { error: result.error };
  }

  return { success: "Odkaz byl odeslán znovu." };
}
