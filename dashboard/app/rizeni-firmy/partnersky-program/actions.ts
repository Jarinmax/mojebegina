"use server";

// Schválení měsíčního vyhodnocení partnerského programu (jen ADMIN/EXECUTIVE).
// Schválení samo klientům nic neposílá — e-maily odcházejí po půlnoci
// prvního dne měsíce (cron). Když se schvaluje až v měsíci platnosti
// (pozdní schválení, doplnění individuální slevy), rozešle se hned.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getAuthContext } from "@/lib/data/authContext";
import { isAdminOrExecutive } from "@/lib/data/adminAuth";
import { addMonths, monthKey, parseMonthKey } from "@/lib/eshop/partnerMonthly";
import { addPartnerOptOut, approvePartnerMonth, finalizePartnerMonth, pragueYearMonth } from "@/lib/eshop/partnerMonthlyServer";

export type PartnerActionState = { error: string } | { success: string } | null;

async function requireStaff() {
  const ctx = await getAuthContext();
  return ctx && isAdminOrExecutive(ctx) ? ctx : null;
}

export async function approvePartnerMonthAction(_prev: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const ctx = await requireStaff();
  if (!ctx) return { error: "Schvalovat může jen vedení Beginy." };
  const evaluatedMonth = parseMonthKey(String(formData.get("month") ?? ""));
  if (!evaluatedMonth) return { error: "Neplatný měsíc." };

  const individual: Record<string, number> = {};
  const salutations: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (name.startsWith("percent:") && value.trim()) {
      const percent = Number(value.replace(",", "."));
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return { error: `Sleva „${value}“ není platné procento (0–100).` };
      individual[name.slice("percent:".length)] = percent;
    }
    if (name.startsWith("salut:") && value.trim()) salutations[name.slice("salut:".length)] = value;
  }

  const now = new Date();
  await approvePartnerMonth(db, { evaluatedMonth, approvedBy: ctx.name ?? ctx.email, individual, salutations, now });
  revalidatePath("/rizeni-firmy/partnersky-program");

  const today = pragueYearMonth(now);
  if (monthKey(addMonths(evaluatedMonth, 1)) === monthKey(today)) {
    const result = await finalizePartnerMonth(db, now);
    return {
      success: `Schváleno. Kódy: ${result.codes.join(", ") || "žádné"}. E-mail odešel: ${result.emailed.join(", ") || "nikomu novému"}.${result.failed.length ? ` Nepodařilo se: ${result.failed.join(", ")}.` : ""}`,
    };
  }
  return { success: "Schváleno. E-maily s kódy odejdou klientům po půlnoci prvního dne měsíce." };
}

export async function addPartnerOptOutAction(_prev: PartnerActionState, formData: FormData): Promise<PartnerActionState> {
  const ctx = await requireStaff();
  if (!ctx) return { error: "Tohle může jen vedení Beginy." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Neplatný e-mail." };
  await addPartnerOptOut(db, email);
  revalidatePath("/rizeni-firmy/partnersky-program");
  return { success: `${email} už e-maily o partnerském programu nedostane.` };
}
