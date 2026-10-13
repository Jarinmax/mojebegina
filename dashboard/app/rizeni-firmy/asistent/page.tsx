// GPT/MCP pilot — přehled vlastního propojení s ChatGPT: aktivní souhlasy
// (odvolání jedním tlačítkem) a co asistent za posledních 7 dní dělal.
// Přístup do /rizeni-firmy hlídá layout (ADMIN/EXECUTIVE).
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { getAuthContext } from "@/lib/data/authContext";
import { ROLE_LABELS } from "@/lib/data/roles";
import type { SystemRole } from "@/lib/data/types";
import { formatCzechDate } from "@/lib/format";
import { SCOPE_WRITE, agentConfig } from "@/lib/agent/config";
import { hasScope } from "@/lib/agent/oauthCore";
import { listActiveGrants, listRecentAudit } from "@/lib/agent/oauthStore";
import { revokeAgentGrantAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  ok: "provedeno",
  error: "chyba",
  denied: "zamítnuto",
  pending: "nedokončeno",
};

export default async function AgentAccessPage() {
  if (!agentConfig()) notFound();
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const grants = await listActiveGrants(db, ctx.userId);
  const audit = await listRecentAudit(db, ctx.userId, 7);

  return (
    <div>
      <Link href="/rizeni-firmy" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Řízení firmy
      </Link>
      <h1 className="text-lg font-medium text-begina-primary-900 mt-1 mb-1">Asistent ChatGPT</h1>
      <p className="text-sm text-neutral-600 mb-4">
        ChatGPT jedná za vás a jen s oprávněními vašeho účtu. Odvoláním ho okamžitě odpojíte — pro další použití je
        potřeba konektor v ChatGPT připojit znovu.
      </p>

      <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Aktivní propojení</h2>
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-6 flex flex-col gap-3">
        {grants.length === 0 ? (
          <p className="text-sm text-neutral-500">Žádné aktivní propojení.</p>
        ) : (
          grants.map((grant) => (
            <div key={grant.id} className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <p className="text-begina-primary-900">
                  {ROLE_LABELS[grant.systemRole as SystemRole] ?? grant.systemRole} ·{" "}
                  {hasScope(grant.scope, SCOPE_WRITE) ? "čtení i zápis" : "jen čtení"}
                </p>
                <p className="text-xs text-neutral-500">
                  povoleno {formatCzechDate(grant.createdAt)}
                  {grant.lastUsedAt && ` · naposledy použito ${formatCzechDate(grant.lastUsedAt)}`}
                </p>
              </div>
              <form action={revokeAgentGrantAction.bind(null, grant.id)}>
                <button
                  type="submit"
                  className="text-sm font-medium text-begina-primary-900 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2"
                >
                  Odvolat
                </button>
              </form>
            </div>
          ))
        )}
      </div>

      <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Posledních 7 dní</h2>
      <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-2">
        {audit.length === 0 ? (
          <p className="text-sm text-neutral-500">Asistent zatím nic nedělal.</p>
        ) : (
          audit.map((entry) => (
            <div key={entry.id} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-begina-primary-900">
                {entry.tool}
                {entry.isWrite && <span className="text-xs text-neutral-500"> · zápis</span>}
                <span className="text-xs text-neutral-500"> · {STATUS_LABELS[entry.status] ?? entry.status}</span>
              </span>
              <span className="text-xs text-neutral-400 whitespace-nowrap">{formatCzechDate(entry.createdAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
