import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { beginLabel, formatQuantity } from "@/lib/receptury/recipes";
import { formatRunDate, getRun } from "@/lib/receptury/productionRuns";
import { closeRunAction } from "../actions";
import { RunChecklist } from "./RunChecklist";

// Várka (Jarin 27. 11. 2026): rozpracované vaření uložené v databázi —
// po výpadku, na jiném počítači i v mobilu je vidět, co už je v hrnci.
export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const run = await getRun(id).catch(() => null);
  return { title: run ? `${run.recipeName} – várka` : "Várka" };
}

export default async function VarkaPage(props: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();
  const { id } = await props.params;
  const run = await getRun(id);
  if (!run) notFound();

  const closed = run.finishedAt !== null || run.cancelledAt !== null;
  const litres = ((run.batchMl * run.batchCount) / 1000).toLocaleString("cs-CZ");
  const items = run.items.map((i) => ({ name: i.name, qty: formatQuantity(i.quantity * run.batchCount, i.unit) }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-4 text-neutral-900">
      <div className={`rounded-xl border px-4 py-3 ${closed ? "border-neutral-200 bg-neutral-50" : "border-amber-300 bg-amber-50"}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
          {run.finishedAt ? "✓ Várka dokončená" : run.cancelledAt ? "Várka zrušená" : "🍲 Rozpracovaná várka"}
        </p>
        <h1 className="mt-0.5 text-2xl font-semibold">{run.recipeName}</h1>
        <p className="mt-1 text-sm text-neutral-700">
          Začátek: <strong>{formatRunDate(run.startedAt)}</strong> · {beginLabel(run.batchCount)} ({litres} l)
          {run.startedByName ? ` · ${run.startedByName}` : ""}
        </p>
        {run.finishedAt && <p className="mt-0.5 text-sm text-emerald-800">Dokončeno: {formatRunDate(run.finishedAt)}</p>}
      </div>

      <div className="mt-4">
        <RunChecklist
          runId={run.id}
          items={items}
          steps={run.steps}
          initialItems={run.doneItems}
          initialSteps={run.doneSteps}
          readOnly={closed}
        />
      </div>

      {run.checks.length > 0 && (
        <div className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-amber-950">
          <h2 className="text-lg font-semibold">Kontrolní body</h2>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            {run.checks.map((check, index) => (
              <li key={index}>{check}</li>
            ))}
          </ul>
        </div>
      )}

      {!closed ? (
        <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-neutral-200 pt-4">
          <form action={closeRunAction}>
            <input type="hidden" name="id" value={run.id} />
            <input type="hidden" name="how" value="finish" />
            <button type="submit" className="rounded-xl bg-emerald-600 px-5 py-3 text-base font-semibold text-white shadow hover:bg-emerald-700">
              ✓ Dokončit várku
            </button>
          </form>
          <details className="text-sm">
            <summary className="cursor-pointer text-neutral-500 hover:text-neutral-800">Zrušit várku…</summary>
            <form action={closeRunAction} className="mt-2">
              <input type="hidden" name="id" value={run.id} />
              <input type="hidden" name="how" value="cancel" />
              <button type="submit" className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-red-700 hover:bg-red-50">
                Ano, zrušit (nic se nemaže, jen zmizí z rozpracovaných)
              </button>
            </form>
          </details>
        </div>
      ) : (
        run.finishedAt && (
          <div className="mt-8 border-t border-neutral-200 pt-4">
            <Link href="/rizeni-firmy/vyroba/sarze" className="inline-block rounded-xl bg-begina-primary-900 px-5 py-3 font-semibold text-white hover:opacity-90">
              Zapsat šarži →
            </Link>
          </div>
        )
      )}
    </div>
  );
}
