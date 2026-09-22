"use server";

// Security Phase 14 — jediná "use server" hranice pro jednorázový
// migrační backfill user_profiles. ADMIN gate je tady, ne uvnitř
// backfillUserProfiles — viz komentář v lib/data/userProfiles.ts
// (cyklická závislost na authContext.ts, kdyby se importoval
// requireAdminContext z admin.ts).
import { getAuthContext } from "@/lib/data/authContext";
import { requireAdmin } from "@/lib/data/adminAuth";
import { backfillUserProfiles, type BackfillSummary } from "@/lib/data/userProfiles";

export type BackfillActionState =
  | { error: string }
  | { summary: BackfillSummary }
  | null;

export async function runBackfillAction(
  _prevState: BackfillActionState,
  _formData: FormData
): Promise<BackfillActionState> {
  void _formData;

  try {
    const ctx = await getAuthContext();
    requireAdmin(ctx);

    const summary = await backfillUserProfiles();
    return { summary };
  } catch (error) {
    return {
      error: `Backfill selhal: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
