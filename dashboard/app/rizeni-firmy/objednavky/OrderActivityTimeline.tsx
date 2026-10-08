import { formatCzechDate } from "@/lib/format";
import { FULFILLMENT_LABELS, PAYMENT_LABELS } from "./orderLabels";
import type { FulfillmentStatus, PaymentStatus } from "@/lib/data/orderValidation";
import type { OrderActivityEntry } from "@/lib/data/orders";

// Security Phase 15 (Objednávky 1.0) — sjednocená timeline, stejný vzor
// jako ActivityTimeline.tsx u company_nodes.
function describeEntry(entry: OrderActivityEntry): string {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  switch (entry.kind) {
    case "created":
      return "založil(a) objednávku";
    case "note_added":
      return "upravil(a) poznámku";
    case "fulfillment_status_changed": {
      const to = String(meta.to ?? "") as FulfillmentStatus;
      return `nastavil(a) stav objednávky na „${FULFILLMENT_LABELS[to] ?? to}“`;
    }
    case "payment_status_changed": {
      const to = String(meta.to ?? "") as PaymentStatus;
      // ESHOP 1.0 — přepočet z plateb (Stripe / zapsaná platba), ne ruční přepnutí
      if (meta.provider === "stripe" || meta.provider === "manual") {
        return `— objednávka je uhrazená celá, stav platby „${PAYMENT_LABELS[to] ?? to}“`;
      }
      return `nastavil(a) stav platby na „${PAYMENT_LABELS[to] ?? to}“`;
    }
    // ESHOP 1.0 — návrh faktury (režim návrhu, do iDokladu se nic neodesílá)
    case "invoice_draft_created":
    case "invoice_draft_regenerated": {
      const verb = entry.kind === "invoice_draft_created" ? "připravil(a) návrh faktury" : "přegeneroval(a) návrh faktury";
      const errors = Number(meta.errors ?? 0);
      const mode = meta.mode === "live" ? "ostrý provoz" : "režim návrhu — do iDokladu se nic neodeslalo";
      return `${verb} (${mode})${errors > 0 ? ` — ⚠ chyby v datech: ${errors}` : ""}`;
    }
    case "invoice_draft_failed":
      return `⚠ návrh faktury se nepodařilo připravit — ${String(meta.error ?? "neznámá chyba")}`;
    case "invoice_issued":
      return `vystavil(a) fakturu č. ${String(meta.invoiceNumber ?? "—")} v iDokladu a označil(a) ji jako uhrazenou${meta.adopted ? " (dokončení dříve založené faktury)" : ""}`;
    case "invoice_issue_failed":
      return `⚠ vystavení faktury v iDokladu se nepovedlo — ${String(meta.error ?? "neznámá chyba")}`;
    case "payment_recorded": {
      const hal = Number(meta.amountHal ?? 0);
      const amount = hal % 100 === 0 ? `${(hal / 100).toLocaleString("cs-CZ")} Kč` : `${(hal / 100).toFixed(2).replace(".", ",")} Kč`;
      return `zapsal(a) platbu ${amount} ${meta.method === "cash" ? "hotově" : "převodem"}`;
    }
    // ESHOP 1.0 — platba kartou (Stripe)
    case "payment_started":
      return "přesměroval(a) zákazníka na platbu kartou (Stripe)";
    case "payment_duplicate":
      return "⚠ přijal(a) DALŠÍ platbu kartou k už zaplacené objednávce — zkontrolovat a vrátit ve Stripe";
    // ESHOP 1.0 — e-maily k objednávce (lib/eshop/email/orderEmails.ts)
    case "email_sent": {
      const label = emailLabel(meta.template);
      const to = Array.isArray(meta.to) ? ` (${meta.to.join(", ")})` : "";
      return `odeslal(a) e-mail: ${label}${to}${meta.test ? " — testovací režim" : ""}`;
    }
    case "email_failed": {
      const label = emailLabel(meta.template);
      return `⚠ nepodařilo se odeslat e-mail: ${label} — ${meta.template === "internal_new_order" ? "objednávka je jen tady" : "kontaktovat zákazníka ručně"}`;
    }
    case "payment_amount_mismatch":
      return "⚠ přijal(a) platbu, jejíž částka nesedí s objednávkou — zkontrolovat (Zaplaceno jen při úhradě celé částky)";
    // Storno — zaplacená stornovaná objednávka (lib/eshop/cancellation.ts)
    case "refund_required": {
      const hal = Number(meta.amountHal ?? 0);
      const amount = hal % 100 === 0 ? `${(hal / 100).toLocaleString("cs-CZ")} Kč` : `${(hal / 100).toFixed(2).replace(".", ",")} Kč`;
      return meta.reason === "paid_after_cancellation"
        ? `⚠ přijal(a) platbu ${amount} až po stornu — označeno k vrácení peněz (řeší se samostatně, bez faktury a bez e-mailu o platbě)`
        : `⚠ označil(a) objednávku k vrácení peněz ${amount} (řeší se samostatně, nic se nevrací automaticky)`;
    }
    case "refund_resolved":
      return "potvrdil(a), že vrácení peněz je vyřešené";
    case "responsible_assigned":
      return meta.responsibleUserId
        ? `přiřadil(a) odpovědnou osobu: ${String(meta.responsibleName ?? meta.responsibleUserId)}`
        : "odebral(a) odpovědnou osobu";
    default:
      return "";
  }
}

function emailLabel(template: unknown): string {
  switch (template) {
    case "internal_new_order":
      return "upozornění pro Beginu";
    case "customer_payment_received":
      return "potvrzení o přijetí platby zákazníkovi";
    case "customer_invoice":
      return "faktura zákazníkovi";
    case "customer_cancellation":
      return "potvrzení zrušení objednávky zákazníkovi";
    default:
      return "potvrzení zákazníkovi";
  }
}

// Snapshot jména má přednost; bez něj rozliš, kdo záznam zapsal.
function authorLabel(entry: OrderActivityEntry): string {
  if (entry.authorName) return entry.authorName;
  if (entry.actorType === "system") return "Systém";
  if (entry.actorType === "customer") return "Zákazník";
  return "Neznámý uživatel";
}

export default function OrderActivityTimeline({ activity }: { activity: OrderActivityEntry[] }) {
  if (activity.length === 0) {
    return <p className="text-sm text-neutral-500">Zatím žádná aktivita.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {activity.map((entry) => (
        <div key={entry.id} className="border-l-2 border-neutral-200 pl-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm text-begina-primary-900">
              <span className="font-medium">{authorLabel(entry)}</span>{" "}
              {describeEntry(entry)}
            </p>
            <p className="text-xs text-neutral-400 whitespace-nowrap">
              {formatCzechDate(entry.createdAt)}
            </p>
          </div>
          {(entry.kind === "note_added" || entry.kind === "refund_resolved") && entry.body && (
            <p className="text-sm text-neutral-600 whitespace-pre-wrap mt-0.5">{entry.body}</p>
          )}
        </div>
      ))}
    </div>
  );
}
