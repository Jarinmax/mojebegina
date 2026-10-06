"use client";

// ESHOP 1.0 — faktura e-shopové objednávky v MojeBegina. Dnes jen REŽIM
// NÁVRHU: ukazuje přesně, co by se do iDokladu odeslalo, a co chybí nebo
// nesedí. Do iDokladu se nic neodesílá (lib/eshop/invoicing/mode.ts).
import { useActionState } from "react";
import { prepareInvoiceDraftAction, type ActionState } from "./actions";
import type { OrderInvoiceView } from "@/lib/eshop/invoicing/service";
import type { InvoiceProblem } from "@/lib/eshop/invoicing/draft";
import { formatKc } from "@/lib/format";

const initialState: ActionState = null;

const METHOD_LABELS: Record<string, string> = { card: "kartou online", bank_transfer: "převodem na účet", cash: "hotově" };
const SOURCE_LABELS: Record<string, string> = { stripe: "Stripe", bank: "banka", manual: "zapsáno ručně" };

/** „2026-10-06“ → „6. 10. 2026“ */
function czDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
}

function formatHal(hal: number): string {
  return hal % 100 === 0 ? formatKc(hal / 100) : `${(hal / 100).toFixed(2).replace(".", ",")} Kč`;
}

function ProblemList({ title, problems, tone }: { title: string; problems: InvoiceProblem[]; tone: string }) {
  if (problems.length === 0) return null;
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone}`}>
      <p className="text-xs font-medium mb-1">{title}</p>
      <ul className="list-disc pl-4 text-xs flex flex-col gap-0.5">
        {problems.map((p) => (
          <li key={p.code}>{p.message}</li>
        ))}
      </ul>
    </div>
  );
}

function DraftButton({ orderId, regenerate }: { orderId: string; regenerate: boolean }) {
  const boundAction = prepareInvoiceDraftAction.bind(null, orderId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-1">
      {regenerate && <input type="hidden" name="regenerate" value="1" />}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-begina-primary-900 hover:underline disabled:opacity-50"
        >
          {pending ? "Připravuji…" : regenerate ? "Přegenerovat návrh z aktuálních údajů" : "Vytvořit návrh faktury"}
        </button>
      </div>
      {state && "error" in state && <p className="text-xs text-begina-accent-700">{state.error}</p>}
      {state && "success" in state && <p className="text-xs text-emerald-700">{state.success}</p>}
    </form>
  );
}

export default function OrderInvoiceDraft({
  orderId,
  invoice,
  paid,
}: {
  orderId: string;
  invoice: OrderInvoiceView | null;
  paid: boolean;
}) {
  const payload = invoice?.link?.payload ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-neutral-500">Faktura (iDoklad)</p>
        <p className="text-xs font-medium text-sky-700">Režim návrhu — do iDokladu se nic neodesílá</p>
      </div>

      {!invoice && (
        <>
          <p className="text-sm text-neutral-600">
            {paid ? "Návrh faktury zatím nevznikl." : "Návrh faktury vznikne automaticky po úplném zaplacení objednávky."}
          </p>
          {paid && <DraftButton orderId={orderId} regenerate={false} />}
        </>
      )}

      {invoice && !payload && (
        <p className="text-sm text-neutral-600">
          Faktura {invoice.invoiceNumber ?? ""} ({invoice.docState}) — bez uloženého návrhu.
        </p>
      )}

      {invoice && payload && (
        <>
          <p className="text-xs text-neutral-500">{payload.modeReason}</p>

          <ProblemList
            title="Chyby v datech — opravit před vystavením"
            problems={payload.problems.filter((p) => p.severity === "error")}
            tone="border-red-200 bg-red-50 text-red-800"
          />
          <ProblemList
            title="Ke kontrole"
            problems={payload.problems.filter((p) => p.severity === "warning")}
            tone="border-amber-200 bg-amber-50 text-amber-800"
          />
          <ProblemList
            title="Doplnit před ostrým vystavováním (v režimu návrhu nevadí)"
            problems={payload.problems.filter((p) => p.severity === "live")}
            tone="border-neutral-200 bg-neutral-50 text-neutral-700"
          />

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-neutral-500">Odběratel</dt>
            <dd className="text-begina-primary-900">
              {payload.draft.customer.name ?? "—"}
              <span className="block text-xs text-neutral-500">
                {[payload.draft.customer.email, payload.draft.customer.phone].filter(Boolean).join(" · ")}
              </span>
              {payload.draft.customer.address && (
                <span className="block text-xs text-neutral-500">
                  {payload.draft.customer.address.street}, {payload.draft.customer.address.zip}{" "}
                  {payload.draft.customer.address.city}
                </span>
              )}
            </dd>
            <dt className="text-neutral-500">Variabilní symbol</dt>
            <dd className="text-begina-primary-900 font-mono">{payload.draft.vs ?? "—"}</dd>
            <dt className="text-neutral-500">Vystavení / DUZP / splatnost</dt>
            <dd className="text-begina-primary-900">
              {czDate(payload.draft.issueDate)} / {czDate(payload.draft.taxableDate)} / {czDate(payload.draft.dueDate)}
            </dd>
            <dt className="text-neutral-500">Úhrada</dt>
            <dd className="text-begina-primary-900">
              {payload.draft.paymentMethod ? METHOD_LABELS[payload.draft.paymentMethod] ?? payload.draft.paymentMethod : "—"} ·
              uhrazeno {formatHal(payload.draft.paidHal)}
            </dd>
            <dt className="text-neutral-500">DPH</dt>
            <dd className="text-begina-primary-900">neplátce DPH — ceny bez rozpisu DPH</dd>
            <dt className="text-neutral-500">Číselná řada</dt>
            <dd className="text-begina-primary-900">
              {payload.draft.numberSeriesId ?? <span className="text-neutral-500">e-shopová řada — ID zatím nepotvrzené</span>}
            </dd>
            <dt className="text-neutral-500">Číslo faktury</dt>
            <dd className="text-neutral-500">přidělí iDoklad při ostrém vystavení</dd>
          </dl>

          <div>
            <p className="text-xs text-neutral-500 mb-1">Položky</p>
            <div className="flex flex-col gap-1">
              {payload.draft.lines.map((line, i) => (
                <div key={i} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-neutral-700">
                    {line.quantity}× {line.name}
                    {line.sku && <span className="text-xs text-neutral-400"> · {line.sku}</span>}
                  </span>
                  <span className="whitespace-nowrap text-neutral-500">
                    {line.quantity > 1 && <>{formatKc(line.unitPriceKc)} / ks · </>}
                    {formatKc(line.totalKc)}
                  </span>
                </div>
              ))}
              <div className="flex items-baseline justify-between border-t border-neutral-200 pt-1 text-sm font-medium text-begina-primary-900">
                <span>Celkem k úhradě</span>
                <span>{formatKc(payload.draft.totalKc)}</span>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs text-neutral-500 mb-1">Platby, které fakturu kryjí</p>
            <ul className="flex flex-col gap-0.5 text-xs text-neutral-700">
              {payload.draft.payments.map((p) => (
                <li key={p.id}>
                  {formatHal(p.amountHal)} {METHOD_LABELS[p.method] ?? p.method} · {SOURCE_LABELS[p.source] ?? p.source}
                  <span className="text-neutral-400"> · {p.externalId}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs text-neutral-500 mb-1">Co by se stalo při ostrém vystavení</p>
            <ol className="list-decimal pl-4 text-xs text-neutral-600 flex flex-col gap-0.5">
              {payload.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {payload.idoklad.duplicateCheck.filter && (
              <p className="text-xs text-neutral-500 mt-1">
                Pojistka proti dvojí faktuře: vyhledání v iDokladu <span className="font-mono">{payload.idoklad.duplicateCheck.filter}</span>;
                v MojeBegina může mít objednávka jen jednu prodejní fakturu.
              </p>
            )}
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-begina-primary-900">Data pro iDoklad (co by se odeslalo)</summary>
            <p className="mt-2 text-neutral-500">Kontakt (vyhledání podle e-mailu, případně založení):</p>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-neutral-50 p-2 text-[11px] text-neutral-700">
              {JSON.stringify(payload.idoklad.contact, null, 2)}
            </pre>
            <p className="mt-2 text-neutral-500">Vydaná faktura:</p>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-neutral-50 p-2 text-[11px] text-neutral-700">
              {JSON.stringify(payload.idoklad.invoice, null, 2)}
            </pre>
          </details>

          <p className="text-xs text-neutral-400">
            Návrh připraven {new Date(payload.generatedAt).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}
          </p>
          {invoice.docState === "draft" && invoice.link?.state !== "issued" && (
            <DraftButton orderId={orderId} regenerate />
          )}
        </>
      )}
    </div>
  );
}
