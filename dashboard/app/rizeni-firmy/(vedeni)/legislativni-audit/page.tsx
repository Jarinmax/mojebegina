import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { getLegalAuditReport, listLegalAuditReports } from "@/lib/data/legalAudit";
import { LEGAL_AUDIT_KIND_LABELS, LEGAL_AUDIT_NAME, LEGAL_AUDIT_PATH, type LegalAuditKind } from "@/lib/legislativniAudit/kinds";

// LEGISLATIVNÍ AUDIT 1.0 (17. 11. 2026) — archiv právních reportů: hlídání
// zákonů ČR, SR a EU (denní upozornění, měsíční report) a kontrola webu
// begina.cz. Reporty ukládá Claude přes MCP nástroj legal_audit_save_report.
// Přístup JEN Jaroslav a Lucie (isInvoiceIssuer); ostatním z vedení se
// stránka tváří, že neexistuje.
export const dynamic = "force-dynamic";
export const metadata = { title: `${LEGAL_AUDIT_NAME} — Řízení firmy` };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function czDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
}

function kindLabel(kind: string): string {
  return LEGAL_AUDIT_KIND_LABELS[kind as LegalAuditKind] ?? kind;
}

function UrgentBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-block rounded-full bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 text-xs font-medium">
      {count === 1 ? "1 naléhavý bod" : count < 5 ? `${count} naléhavé body` : `${count} naléhavých bodů`}
    </span>
  );
}

function NotReady({ message }: { message: string }) {
  return <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-4">{message}</p>;
}

export default async function LegislativniAuditPage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();
  const sp = await searchParams;
  const id = Array.isArray(sp.id) ? sp.id[0] : sp.id;

  if (id) {
    if (!UUID.test(id)) notFound();
    const result = await getLegalAuditReport(id);
    if (!result.ok) {
      return (
        <div>
          <Link href={LEGAL_AUDIT_PATH} className="text-sm text-neutral-500 hover:text-begina-primary-900">
            ← {LEGAL_AUDIT_NAME}
          </Link>
          <div className="mt-3">
            <NotReady message={result.error} />
          </div>
        </div>
      );
    }
    const report = result.data;
    if (!report) notFound();
    return (
      <div>
        <Link href={LEGAL_AUDIT_PATH} className="text-sm text-neutral-500 hover:text-begina-primary-900">
          ← {LEGAL_AUDIT_NAME}
        </Link>
        <div className="mt-3 mb-4">
          <p className="text-xs text-neutral-500">
            {czDate(report.reportDate)} · {kindLabel(report.kind)}
          </p>
          <h1 className="text-lg font-medium text-begina-primary-900 mt-0.5">{report.title}</h1>
          <div className="mt-2">
            <UrgentBadge count={report.urgentCount} />
          </div>
        </div>
        {report.summary && <p className="text-sm text-begina-primary-900 bg-begina-primary-50 border border-begina-primary-100 rounded-xl p-4 mb-4 whitespace-pre-wrap">{report.summary}</p>}
        <article className="bg-white border border-neutral-200 rounded-xl p-4 text-sm leading-relaxed text-neutral-800 whitespace-pre-wrap break-words">{report.body}</article>
        <p className="text-xs text-neutral-500 mt-3">Nejde o právní radu; u zásadních kroků je vhodné ověřit s účetní nebo právníkem.</p>
      </div>
    );
  }

  const result = await listLegalAuditReports();
  return (
    <div>
      <div className="mt-3 mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">{LEGAL_AUDIT_NAME}</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Hlídání zákonů ČR, Slovenska a EU pro Beginu a bistro a kontrola webu begina.cz. Upozornění na změny chodí průběžně, měsíční report vždy 2. v měsíci.
        </p>
      </div>
      {!result.ok ? (
        <NotReady message={result.error} />
      ) : result.data.length === 0 ? (
        <p className="text-sm text-neutral-500 bg-white border border-dashed border-neutral-300 rounded-xl p-4">Zatím žádné reporty.</p>
      ) : (
        <ul className="space-y-3">
          {result.data.map((report) => (
            <li key={report.id}>
              <Link href={`${LEGAL_AUDIT_PATH}?id=${report.id}`} className="block bg-white border border-neutral-200 rounded-xl p-4 hover:border-begina-primary-300">
                <p className="text-xs text-neutral-500">
                  {czDate(report.reportDate)} · {kindLabel(report.kind)}
                </p>
                <p className="text-sm font-medium text-begina-primary-900 mt-0.5">{report.title}</p>
                {report.summary && <p className="text-sm text-neutral-600 mt-1 line-clamp-3">{report.summary}</p>}
                <div className="mt-2">
                  <UrgentBadge count={report.urgentCount} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
