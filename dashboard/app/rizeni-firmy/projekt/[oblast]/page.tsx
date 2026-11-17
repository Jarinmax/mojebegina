import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { findArea, formatCzDate } from "@/lib/projekt/areas";
import { loadArea, projectTableExists, type ProjectEntry } from "@/lib/projekt/projectServer";
import AreaIcon, { TONES } from "../AreaIcon";
import AddEntryForm from "../AddEntryForm";
import { deleteProjectEntryAction } from "../actions";

// PROJEKT BEGINA 1.0 — jedna oblast: aktuální stav, rozhodnutí, výstupy.
export const dynamic = "force-dynamic";

function Meta({ entry }: { entry: ProjectEntry }) {
  return (
    <span className="text-xs text-neutral-500">
      {formatCzDate(entry.entryDate)}
      {entry.createdByName ? ` · ${entry.createdByName}` : ""}
    </span>
  );
}

function DeleteButton({ entry }: { entry: ProjectEntry }) {
  return (
    <form action={deleteProjectEntryAction}>
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="area" value={entry.area} />
      <button type="submit" className="text-xs text-neutral-400 hover:text-red-700">
        smazat
      </button>
    </form>
  );
}

function Add({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="mt-3 border-t border-neutral-100 pt-2">
      <summary className="cursor-pointer text-sm font-medium text-begina-primary-900">{label}</summary>
      {children}
    </details>
  );
}

export default async function ProjektOblastPage(props: PageProps<"/rizeni-firmy/projekt/[oblast]">) {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();
  const { oblast } = await props.params;
  const area = findArea(oblast);
  if (!area || !(await projectTableExists())) notFound();

  const { status, statusHistory, decisions, outputs } = await loadArea(area.slug);
  const tone = TONES[area.tone];
  const card = "bg-white border border-neutral-200 rounded-2xl p-4";

  return (
    <div className="flex flex-col gap-4 text-neutral-900 max-w-3xl">
      <div>
        <Link href="/rizeni-firmy/projekt" className="text-sm text-neutral-500 hover:underline">
          ← Projekt Begina
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <AreaIcon area={area} size="lg" />
          <h1 className={`text-2xl font-semibold ${tone.text}`}>{area.name}</h1>
        </div>
      </div>

      <section className={`rounded-2xl border p-4 ${tone.tile.replace(/hover:\S+/, "")}`}>
        <h2 className="text-sm font-semibold">Aktuální stav</h2>
        {status ? (
          <>
            <p className="mt-2 text-sm whitespace-pre-line">{status.body}</p>
            <p className="mt-2">
              <Meta entry={status} />
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">Zatím bez stavu.</p>
        )}
        <Add label={status ? "Upravit stav" : "+ Napsat stav"}>
          <AddEntryForm area={area.slug} kind="status" defaultBody={status?.body ?? ""} />
        </Add>
        {statusHistory.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-neutral-500">Předchozí stavy</summary>
            <ul className="mt-2 flex flex-col gap-2">
              {statusHistory.map((s) => (
                <li key={s.id} className="text-xs text-neutral-600 whitespace-pre-line">
                  <Meta entry={s} />
                  <br />
                  {s.body}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold">Rozhodnutí</h2>
        {decisions.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Zatím žádné.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100">
            {decisions.map((d) => (
              <li key={d.id} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{d.title}</p>
                  {d.body && <p className="text-sm text-neutral-600 whitespace-pre-line">{d.body}</p>}
                  <Meta entry={d} />
                </div>
                <DeleteButton entry={d} />
              </li>
            ))}
          </ul>
        )}
        <Add label="+ Přidat rozhodnutí">
          <AddEntryForm area={area.slug} kind="decision" />
        </Add>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold">Výstupy</h2>
        {outputs.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Zatím žádné.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100">
            {outputs.map((o) => (
              <li key={o.id} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {o.url ? (
                    <a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-begina-primary-900 hover:underline">
                      {o.title}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ) : (
                    <p className="text-sm font-medium">{o.title}</p>
                  )}
                  {o.body && <p className="text-sm text-neutral-600 whitespace-pre-line">{o.body}</p>}
                  <Meta entry={o} />
                </div>
                <DeleteButton entry={o} />
              </li>
            ))}
          </ul>
        )}
        <Add label="+ Přidat výstup">
          <AddEntryForm area={area.slug} kind="output" />
        </Add>
      </section>
    </div>
  );
}
