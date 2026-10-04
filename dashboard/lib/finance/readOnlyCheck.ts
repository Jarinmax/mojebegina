// Finance 1.0 — první read-only ověření připojení k iDokladu.
//
// Co se čte (jen GET, přes pojistku klienta):
//   • GET /Account/CurrentAgenda — název, IČO, režim DPH, tarif,
//   • u každé kolekce 1 stránka o velikosti 1 → jen POČET záznamů
//     (TotalItems). Obsah dokladu se do výsledku nedostane.
// Nic se neukládá do DB; výsledek je jen pro zobrazení přihlášenému
// Vinerovi. Odpovídá i na otevřenou otázku, které agendy Begina v iDokladu
// skutečně používá (banka, pokladna, prodejky).
import type { IdokladClient } from "./idoklad/client";
import type { IdokladCollection } from "./idoklad/endpoints";
import { IdokladError } from "./idoklad/errors";
import type { ApiAgenda } from "./idoklad/apiTypes";
import { normalizeAgenda, toIsoDate } from "./idoklad/normalize";
import type { VatMode } from "./types";

export const READ_ONLY_CHECK_COLLECTIONS: Array<{ collection: IdokladCollection; label: string }> = [
  { collection: "IssuedInvoices", label: "Vydané faktury" },
  { collection: "CreditNotes", label: "Dobropisy" },
  { collection: "ProformaInvoices", label: "Zálohové faktury" },
  { collection: "SalesReceipts", label: "Prodejky" },
  { collection: "IssuedDocumentPayments", label: "Úhrady vydaných dokladů" },
  { collection: "ReceivedInvoices", label: "Přijaté faktury" },
  { collection: "ReceivedReceipts", label: "Přijaté účtenky" },
  { collection: "ReceivedDocumentPayments", label: "Úhrady přijatých faktur" },
  { collection: "Contacts", label: "Kontakty" },
  { collection: "Tags", label: "Štítky" },
  { collection: "BankAccounts", label: "Bankovní účty" },
  { collection: "BankStatements", label: "Bankovní pohyby" },
  { collection: "CashRegisters", label: "Pokladny" },
  { collection: "CashVouchers", label: "Pokladní doklady" },
];

const SUBSCRIPTION_NAMES: Record<number, string> = { 0: "Free", 1: "Basic", 2: "Standard", 3: "Premium" };

export type ReadOnlyCheckResult = {
  ok: true;
  checkedAt: string;
  agenda: {
    name: string | null;
    ico: string | null;
    vatMode: VatMode | "identified_person" | null;
    subscription: string | null;
    subscriptionTrial: boolean | null;
    subscriptionTo: string | null;
  };
  // true = agenda má IČO Beginy (FINANCE_COMPANY_ICO); null = IČO Beginy
  // není nastavené, nelze rozhodnout.
  isBeginaAgenda: boolean | null;
  vatModeConfigured: VatMode | null;
  vatMatches: boolean | null;
  counts: Array<{ collection: string; label: string; total: number | null; error: string | null }>;
  requestCount: number;
  refreshTokenReturned: boolean;
};

export type ReadOnlyCheckFailure = { ok: false; checkedAt: string; code: string; message: string };

export async function runReadOnlyAccountCheck(options: {
  client: IdokladClient;
  companyIco: string | null;
  vatModeConfigured: VatMode | null;
  now: Date;
  refreshTokenReturned?: boolean;
}): Promise<ReadOnlyCheckResult> {
  const { client } = options;
  const apiAgenda = await client.get<ApiAgenda>("/Account/CurrentAgenda");
  const agenda = normalizeAgenda(apiAgenda);
  const subscriptionType = apiAgenda.Subscription?.Type;
  const subscription =
    typeof subscriptionType === "number"
      ? (SUBSCRIPTION_NAMES[subscriptionType] ?? String(subscriptionType))
      : typeof subscriptionType === "string"
        ? subscriptionType
        : null;

  const counts: ReadOnlyCheckResult["counts"] = [];
  for (const { collection, label } of READ_ONLY_CHECK_COLLECTIONS) {
    try {
      const page = await client.getPage<unknown>(collection, 1, { pageSize: 1 });
      counts.push({ collection, label, total: page.totalItems, error: null });
    } catch (error) {
      if (error instanceof IdokladError) {
        // Přihlášení, limit nebo blokace platí pro všechny další dotazy → konec.
        if (["auth_failed", "rate_limited", "budget_exhausted", "request_blocked", "api_not_allowed", "billing"].includes(error.code)) {
          throw error;
        }
        counts.push({ collection, label, total: null, error: error.userMessage });
        continue;
      }
      throw error;
    }
  }

  return {
    ok: true,
    checkedAt: options.now.toISOString(),
    agenda: {
      name: agenda.name,
      ico: agenda.ico,
      vatMode: agenda.vatMode,
      subscription,
      subscriptionTrial: typeof apiAgenda.Subscription?.IsTrial === "boolean" ? apiAgenda.Subscription.IsTrial : null,
      subscriptionTo: toIsoDate(apiAgenda.Subscription?.DateTo ?? null),
    },
    isBeginaAgenda: options.companyIco ? agenda.ico === options.companyIco : null,
    vatModeConfigured: options.vatModeConfigured,
    vatMatches: options.vatModeConfigured ? agenda.vatMode === options.vatModeConfigured : null,
    counts,
    requestCount: client.requestCount,
    refreshTokenReturned: options.refreshTokenReturned ?? false,
  };
}
