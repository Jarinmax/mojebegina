"use client";

// ESHOP 1.0 — faktura e-shopové objednávky v MojeBegina.
//   režim návrhu (vždy mimo Production): ukazuje přesně, co by se do
//     iDokladu odeslalo, a co chybí nebo nesedí; do iDokladu nic,
//   ostrý provoz (lib/eshop/invoicing/mode.ts): stav vystavení v iDokladu
//     (číslo, uhrazeno, PDF odesláno) a při chybě „Vystavit fakturu znovu“.
import Link from "next/link";
import { useActionState } from "react";
import { issueInvoiceAction, prepareInvoiceDraftAction, type ActionState } from "./actions";
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

function czDateTime(value: Date | string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("cs-CZ", { timeZone: "Europe/Prague", dateStyle: "short", timeStyle: "short" });
}

function IssueButton({ orderId, label }: { orderId: string; label: string }) {
  const boundAction = issueInvoiceAction.bind(null, orderId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-begina-primary-900 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Vystavuji v iDokladu…" : label}
        </button>
      </div>
      {state && "error" in state && <p className="text-xs text-begina-accent-700">{state.error}</p>}
      {state && "success" in state && <p className="text-xs text-emerald-700">{state.success}</p>}
    </form>
  );
}

/**
 * Stav vystavení v iDokladu (ostrý provoz) a jediné místo s tlačítkem
 * „Vystavit fakturu“. Tlačítko jen když `canIssue` (ostrý provoz manual/on
 * + oprávněný uživatel — rozhoduje server) a objednávka je zaplacená,
 * faktura ještě není vystavená a vystavení právě neběží. I tak server
 * všechno ověří znovu; dvojklik nic nezdvojí (zámek + idempotence motoru).
 */
function IssueStatus({
  orderId,
  invoice,
  canIssue,
  paid,
}: {
  orderId: string;
  invoice: OrderInvoiceView | null;
  canIssue: boolean;
  paid: boolean;
}) {
  const link = invoice?.link ?? null;
  const allowed = canIssue && paid;
  if (invoice?.docState === "issued") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex flex-col gap-1">
        <p className="text-sm font-medium">
          Vystaveno v iDokladu — faktura č. {invoice.invoiceNumber} · uhrazeno
        </p>
        <p>
          Vystaveno {czDateTime(invoice.issuedAt)} · řada {link?.numberSeries ?? "—"} · ID v iDokladu {link?.externalId ?? "—"}
        </p>
        <p>
          PDF zákazníkovi:{" "}
          {invoice.pdfSentAt ? `odesláno ${czDateTime(invoice.pdfSentAt)} (e-mail MojeBegina)` : "zatím neodesláno"}
        </p>
        {allowed && !invoice.pdfSentAt && <IssueButton orderId={orderId} label="Poslat fakturu zákazníkovi" />}
      </div>
    );
  }
  if (link?.busyUntil) {
    return (
      <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
        Faktura se právě vystavuje v iDokladu (pokus {link.attempts}).
      </p>
    );
  }
  if (link?.state === "failed") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 flex flex-col gap-1">
        <p className="text-sm font-medium">Vystavení v iDokladu se nepovedlo — objednávka NENÍ vyfakturovaná</p>
        <p>{link.lastError}</p>
        <p>
          Pokusů: {link.attempts}
          {link.externalId &&
            ` · faktura v iDokladu už vznikla (ID ${link.externalId}${link.externalNumber ? `, č. ${link.externalNumber}` : ""}) — další pokus ji jen dokončí, novou nevytvoří`}
        </p>
        {allowed && <IssueButton orderId={orderId} label="Vystavit fakturu znovu" />}
      </div>
    );
  }
  // ostrý provoz, zaplaceno, ještě nevystaveno (manual: čeká na tlačítko)
  if (!allowed) {
    return link?.state === "pending" ? (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Faktura čeká na vystavení v iDokladu.
      </p>
    ) : null;
  }
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex flex-col gap-1">
      <p>Faktura ještě není vystavená v iDokladu. Před zápisem proběhne kontrola iDokladu; při jakékoli chybě se nic nevystaví.</p>
      <IssueButton orderId={orderId} label="Vystavit fakturu v iDokladu" />
    </div>
  );
}

export default function OrderInvoiceDraft({
  orderId,
  invoice,
  paid,
  live = false,
  trigger = "off",
  canIssue = false,
  issuer = false,
  cancelled = false,
}: {
  orderId: string;
  invoice: OrderInvoiceView | null;
  paid: boolean;
  /** ostrý provoz fakturace (brána v mode.ts otevřená) */
  live?: boolean;
  /** off / manual / on */
  trigger?: "off" | "manual" | "on";
  /** smí tento uživatel vystavit (ostrý provoz + oprávnění) — rozhoduje server */
  canIssue?: boolean;
  /** oprávněný uživatel (odkaz na kontrolu připojení iDokladu) */
  issuer?: boolean;
  /** stornovaná objednávka — faktura se nevystavuje ani nepřipravuje */
  cancelled?: boolean;
}) {
  const payload = invoice?.link?.payload ?? null;
  const issued = invoice?.docState === "issued";

  if (cancelled) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs text-neutral-500">Faktura (iDoklad)</p>
        <p className="text-sm text-neutral-600">
          {issued
            ? `Objednávka je stornovaná. Faktura ${invoice?.invoiceNumber ?? ""} už je vystavená — při vrácení peněz vystavte v iDokladu dobropis.`
            : "Objednávka je stornovaná — faktura se nevystavuje."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-neutral-500">
          Faktura (iDoklad)
          {issuer && (
            <Link href="/rizeni-firmy/objednavky/idoklad" className="ml-2 text-begina-primary-900 hover:underline">
              kontrola připojení
            </Link>
          )}
        </p>
        {live ? (
          <p className="text-xs font-medium text-emerald-700">
            {trigger === "manual"
              ? "Ostrý provoz — ruční vystavení (jen tlačítkem)"
              : "Ostrý provoz — faktury se vystavují v iDokladu automaticky"}
          </p>
        ) : (
          <p className="text-xs font-medium text-sky-700">Režim návrhu — do iDokladu se nic neodesílá</p>
        )}
      </div>

      {(invoice || (live && canIssue && paid)) && (
        <IssueStatus orderId={orderId} invoice={invoice} canIssue={live && canIssue} paid={paid} />
      )}

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
            title={live ? "Brání ostrému vystavení" : "Doplnit před ostrým vystavováním (v režimu návrhu nevadí)"}
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
            {issued ? (
              <dd className="text-begina-primary-900 font-mono">{invoice.invoiceNumber}</dd>
            ) : (
              <dd className="text-neutral-500">přidělí iDoklad při ostrém vystavení</dd>
            )}
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
            <p className="text-xs text-neutral-500 mb-1">{live ? "Postup ostrého vystavení" : "Co by se stalo při ostrém vystavení"}</p>
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
          {invoice.docState === "draft" && invoice.link?.state !== "issued" && !invoice.link?.externalId && !invoice.link?.busyUntil && (
            <DraftButton orderId={orderId} regenerate />
          )}
        </>
      )}
    </div>
  );
}
