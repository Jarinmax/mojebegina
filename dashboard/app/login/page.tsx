// Security Phase 2.1 — testovací stránka identity. Záměrně mimo vizuální
// styl dashboardu (Tailwind/Begina paleta) — jde o interní ověřovací
// nástroj, ne o produkční přihlašovací obrazovku. Nenapojeno na
// mock/customer.ts ani na žádnou existující stránku.
import { auth } from "@/lib/auth/server";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginTestPage() {
  const { data: session } = await auth.getSession();

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

      <LoginForm loggedIn={!!session?.user} />
    </div>
  );
}
