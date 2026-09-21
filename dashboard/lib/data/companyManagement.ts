// Security Phase 10 (Řízení firmy 1.0) — autorizovaná datová vrstva pro
// zápisy ze schůzek. Stejný princip jako lib/data/admin.ts: kontrola a
// dotaz jsou neoddělitelné, každá funkce si sama volá
// requireCompanyManagementContext(). Gate je z companyManagementAuth.ts,
// ne z adminAuth.ts — viz komentář tam.
import "server-only";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { companyNotes } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { requireCompanyManagementAccess } from "./companyManagementAuth";
import { validateCompanyNoteInput, type CompanyNoteInput } from "./companyNoteValidation";
import type { AuthContext } from "./types";

export async function requireCompanyManagementContext(): Promise<NonNullable<AuthContext>> {
  const ctx = await getAuthContext();
  return requireCompanyManagementAccess(ctx);
}

export type CompanyNote = {
  id: string;
  title: string;
  body: string;
  authorName: string | null;
  createdAt: Date;
};

export async function listCompanyNotes(): Promise<CompanyNote[]> {
  await requireCompanyManagementContext();

  return db
    .select({
      id: companyNotes.id,
      title: companyNotes.title,
      body: companyNotes.body,
      authorName: companyNotes.authorName,
      createdAt: companyNotes.createdAt,
    })
    .from(companyNotes)
    .orderBy(desc(companyNotes.createdAt));
}

export type AddCompanyNoteResult = { ok: true } | { ok: false; error: string };

export async function addCompanyNote(rawInput: CompanyNoteInput): Promise<AddCompanyNoteResult> {
  const ctx = await requireCompanyManagementContext();

  const validated = validateCompanyNoteInput(rawInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  await db.insert(companyNotes).values({
    title: validated.value.title,
    body: validated.value.body,
    authorUserId: ctx.userId,
    // Snapshot jména v okamžiku zápisu — viz komentář u schématu
    // (lib/db/schema.ts), historicky správné i bez závislosti na Neon
    // Auth lookupu při každém čtení.
    authorName: ctx.name,
  });

  return { ok: true };
}
