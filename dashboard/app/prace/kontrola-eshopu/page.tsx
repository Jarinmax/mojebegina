import Link from "next/link";
import { listEshopChecks, ESHOP_CHECK_REGISTER_NAME, ESHOP_CHECK_STATUS_LABEL, type EshopCheckRow } from "@/lib/data/eshopCheck";

export const dynamic = "force-dynamic";

// Registr „Kontrola e-shopu – Lucie“ (8. 11. 2026): všech 16 hlavních úkolů
// BEG-01…BEG-16 na jednom místě. Technický stav (z auditu) a kontrola Lucie
// jsou dva oddělené údaje; schválit / vrátit k opravě lze v detailu karty.
const APPROVAL_TONE: Record<string, string> = {
  open: "bg-amber-50 text-amber-800 border-amber-200",
  submitted: "bg-amber-50 text-amber-800 border-amber-200",
  returned: "bg-red-50 text-red-800 border-red-200",
  done: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

function technicalTone(technical: string | null): string {
  const t = (technical ?? "").toUpperCase();
  if (t.startsWith("NASAZENO") || t.startsWith("HOTOVO")) return "text-emerald-700";
  if (t.startsWith("BLOKOVÁNO") || t.startsWith("NEHOTOVO") || t.startsWith("NEZAHÁJENO")) return "text-red-700";
  return "text-amber-700";
}

function Row({ row }: { row: EshopCheckRow }) {
  return (
    <Link href={`/prace/ukol/${row.id}`} className="block rounded-xl border border-neutral-200 bg-white px-4 py-3 hover:border-neutral-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-neutral-500">
            {row.code}
            {row.header.priority ? ` · ${row.header.priority}` : ""}
            {row.header.responsible ? ` · ${row.header.responsible}` : ""}
          </p>
          <h3 className="text-base font-medium text-begina-primary-900">{row.title}</h3>
          <p className={`text-sm mt-0.5 ${technicalTone(row.header.technical)}`}>{row.header.technical ?? "Technický stav neuveden"}</p>
          {row.status === "returned" && row.returnReason && <p className="text-sm text-red-700 mt-0.5">Vráceno: {row.returnReason}</p>}
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${APPROVAL_TONE[row.status] ?? "bg-neutral-50 text-neutral-700 border-neutral-200"}`}>
          {ESHOP_CHECK_STATUS_LABEL[row.status] ?? row.status}
        </span>
      </div>
    </Link>
  );
}

export default async function EshopCheckRegisterPage() {
  const { rows } = await listEshopChecks();
  const approved = rows.filter((r) => r.status === "done").length;
  const returned = rows.filter((r) => r.status === "returned").length;
  const groups = ["P0", "P1", "P2"].map((p) => ({ p, rows: rows.filter((r) => (r.header.priority ?? "").startsWith(p)) }));
  const other = rows.filter((r) => !groups.some((g) => g.rows.includes(r)));
  return (
    <div className="flex flex-col gap-5">
      <Link href="/prace" className="text-sm text-neutral-500 min-h-8">← Práce</Link>
      <div>
        <h1 className="text-xl font-medium text-begina-primary-900">{ESHOP_CHECK_REGISTER_NAME}</h1>
        <p className="text-sm text-neutral-500">
          {rows.length} úkolů · {approved} schváleno Lucií · {returned} vráceno k opravě · {rows.length - approved - returned} čeká na kontrolu
        </p>
      </div>
      {rows.length === 0 && <p className="text-sm text-neutral-500">Registr zatím nemá žádné úkoly.</p>}
      {[...groups, { p: "Ostatní", rows: other }].map(
        (g) =>
          g.rows.length > 0 && (
            <section key={g.p} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-begina-primary-900">
                {g.p === "P0" ? "P0 – kritická priorita" : g.p === "P1" ? "P1 – důležité" : g.p === "P2" ? "P2 – vzhled a závěrečná kontrola" : g.p} ({g.rows.length})
              </h2>
              {g.rows.map((row) => (
                <Row key={row.id} row={row} />
              ))}
            </section>
          )
      )}
    </div>
  );
}
