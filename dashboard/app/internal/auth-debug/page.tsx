// Security Phase 2.4 — DOČASNÁ ověřovací stránka.
//
// Účel: jediný regresní test po přesunu diagnostiky z /login — potvrdit
// requireOrgAccess() proti reálné Preview DB (ALLOW pro vlastní organizaci,
// DENY pro cizí/neexistující) po zavedení nového produkčního přihlašovacího
// UI. Žádné hardcoded UUID konkrétního zákazníka (viz Fáze 2.3, kde tu bylo
// natvrdo The Cup s.r.o.) — test vždy běží proti organizaci AKTUÁLNĚ
// přihlášeného uživatele.
//
// Tahle stránka bude z aplikace odstraněna hned po úspěšném ověření —
// skrytá/neodkazovaná URL není bezpečnostní mechanismus, takže se na to
// nespoléháme jako na trvalé řešení. Než se to stane, vyžaduje aspoň
// přihlášení (requireCustomerContext přesměruje na /login) a nezobrazuje
// žádná zákaznická data, jen ALLOW/DENY.
import { requireCustomerContext } from "@/lib/data/dashboard";
import { assertOrgAccess } from "@/lib/data/organizations";
import type { AuthContext } from "@/lib/data/types";

export const dynamic = "force-dynamic";

// Syntetické, nulové UUID — nikdy neodkazuje na žádnou reálnou organizaci.
const NONEXISTENT_ORG_ID = "00000000-0000-0000-0000-000000000000";

async function checkAccess(
  ctx: NonNullable<AuthContext>,
  organizationId: string
): Promise<"ALLOW" | "DENY"> {
  try {
    await assertOrgAccess(ctx, organizationId, "read");
    return "ALLOW";
  } catch {
    return "DENY";
  }
}

export default async function AuthDebugPage() {
  const { ctx, organizationId } = await requireCustomerContext();

  const ownOrgResult = organizationId
    ? await checkAccess(ctx, organizationId)
    : "N/A (účet zatím bez organizace)";
  const foreignOrgResult = await checkAccess(ctx, NONEXISTENT_ORG_ID);

  return (
    <div style={{ maxWidth: 440, margin: "40px auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>
        Security Phase 2.4 — dočasný regresní test
      </h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
        Tahle stránka bude po úspěšném ověření odstraněna. Přihlášen jako:{" "}
        {ctx.name ?? ctx.email}
      </p>
      <pre style={{ fontSize: 12, background: "#f5f5f5", padding: 12, borderRadius: 6 }}>
{JSON.stringify(
  {
    "vlastní organizace (očekáváno ALLOW)": ownOrgResult,
    "cizí/neexistující organizace (očekáváno DENY)": foreignOrgResult,
  },
  null,
  2
)}
      </pre>
    </div>
  );
}
