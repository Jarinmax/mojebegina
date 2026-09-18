// Security Phase 2.1 — testovací stránka identity. Záměrně mimo vizuální
// styl dashboardu (Tailwind/Begina paleta) — jde o interní ověřovací
// nástroj, ne o produkční přihlašovací obrazovku. Nenapojeno na
// mock/customer.ts ani na žádnou existující stránku.
//
// Security Phase 2.3 — doplněno o živý test requireOrgAccess() proti
// dvěma reálně persistovaným organizacím v Preview DB: The Cup s.r.o.
// (skutečný zákazník) a "QA Test Org" (prázdná testovací organizace bez
// jakýchkoli osobních/zákaznických dat, založená jen pro tenhle ALLOW/DENY
// test). Nezobrazuje žádná zákaznická data, jen ALLOW/DENY.
import { auth } from "@/lib/auth/server";
import { getAuthContext } from "@/lib/data/authContext";
import { assertOrgAccess } from "@/lib/data/organizations";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

const DEBUG_ORG_THE_CUP = "622f429e-1ddf-464b-9730-cf34d662ba97";
const DEBUG_ORG_QA_TEST = "b09ad50a-dce1-47cc-8f7b-9de73df5e56c";

async function checkAccess(
  ctx: Awaited<ReturnType<typeof getAuthContext>>,
  organizationId: string
): Promise<"ALLOW" | "DENY"> {
  try {
    await assertOrgAccess(ctx, organizationId, "read");
    return "ALLOW";
  } catch {
    return "DENY";
  }
}

export default async function LoginTestPage() {
  const { data: session } = await auth.getSession();
  const ctx = await getAuthContext();

  const accessResult = {
    "The Cup s.r.o.": await checkAccess(ctx, DEBUG_ORG_THE_CUP),
    "QA Test Org": await checkAccess(ctx, DEBUG_ORG_QA_TEST),
  };

  return (
    <div style={{ maxWidth: 440, margin: "40px auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Neon Auth — test identity (Phase 2.1)</h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>
        Interní testovací stránka. Nenapojeno na zákaznická data.
      </p>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Server-side session (auth.getSession)</h2>
        {session?.user ? (
          <pre style={{ fontSize: 12, background: "#f5f5f5", padding: 12, borderRadius: 6, overflowX: "auto" }}>
{JSON.stringify(
  { id: session.user.id, email: session.user.email, name: session.user.name },
  null,
  2
)}
          </pre>
        ) : (
          <p style={{ fontSize: 13 }}>Nepřihlášen — server nezná žádnou identitu.</p>
        )}
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          Security Phase 2.3 — requireOrgAccess() proti reálné DB
        </h2>
        <pre style={{ fontSize: 12, background: "#f5f5f5", padding: 12, borderRadius: 6, overflowX: "auto" }}>
{JSON.stringify(accessResult, null, 2)}
        </pre>
      </section>

      <LoginForm loggedIn={!!session?.user} />
    </div>
  );
}
