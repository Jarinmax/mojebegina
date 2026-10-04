// Finance 1.0 — konfigurace podle prostředí a pojistky proti připojení
// špatné agendy. Rozhodnutí vedení (4. 10. 2026):
//   • Preview NESMÍ používat živé produkční přístupové údaje iDokladu.
//     Buď testovací agenda (IDOKLAD_AGENDA_KIND=test), nebo fixture data.
//   • Živá agenda se poprvé připojí až v Production a až po samostatném
//     schválení (IDOKLAD_LIVE_ENABLED=on — stejný vzor jako
//     ESHOP_STRIPE_LIVE na e-shopové větvi).
//   • Režim DPH se NEkóduje napevno — je to nastavení (FINANCE_VAT_MODE)
//     a před importem se porovná s nastavením firmy v iDokladu.
//
// Druhá, nezávislá pojistka je IČO: FINANCE_COMPANY_ICO = IČO Beginy
// (veřejný údaj, není tajný). V Production musí agenda mít přesně toto
// IČO; mimo Production ho mít NESMÍ — kdyby někdo do Preview omylem vložil
// produkční údaje, synchronizace se odmítne spustit dřív, než cokoli uloží.
import { IdokladError } from "./idoklad/errors";
import type { AgendaInfo } from "./idoklad/normalize";
import type { VatMode } from "./types";

export type FinanceEnv = Partial<
  Record<
    | "VERCEL_ENV"
    | "IDOKLAD_CLIENT_ID"
    | "IDOKLAD_CLIENT_SECRET"
    | "IDOKLAD_LIVE_ENABLED"
    | "IDOKLAD_AGENDA_KIND"
    | "FINANCE_COMPANY_ICO"
    | "FINANCE_VAT_MODE",
    string | undefined
  >
>;

export type FinanceDeployment = "production" | "preview" | "development";

export type FinanceDataMode =
  | { kind: "live"; credentials: { clientId: string; clientSecret: string } }
  | { kind: "test_agenda"; credentials: { clientId: string; clientSecret: string } }
  | { kind: "fixture" }
  | { kind: "disabled"; reason: string };

export type FinanceConfig = {
  deployment: FinanceDeployment;
  dataMode: FinanceDataMode;
  companyIco: string | null;
  vatMode: VatMode | null; // null = nenastaveno → import se nespustí
};

function deploymentOf(env: FinanceEnv): FinanceDeployment {
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return "preview";
  return "development";
}

function normalizeIco(value: string | undefined): string | null {
  const cleaned = value?.replace(/\s+/g, "");
  return cleaned && /^\d{6,10}$/.test(cleaned) ? cleaned : null;
}

export function resolveFinanceConfig(env: FinanceEnv): FinanceConfig {
  const deployment = deploymentOf(env);
  const companyIco = normalizeIco(env.FINANCE_COMPANY_ICO);
  const vatMode: VatMode | null =
    env.FINANCE_VAT_MODE === "non_payer" || env.FINANCE_VAT_MODE === "payer" ? env.FINANCE_VAT_MODE : null;
  const clientId = env.IDOKLAD_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.IDOKLAD_CLIENT_SECRET?.trim() ?? "";
  const hasCredentials = clientId !== "" && clientSecret !== "";

  const base = { deployment, companyIco, vatMode };

  if (deployment === "production") {
    if (!hasCredentials) {
      return { ...base, dataMode: { kind: "disabled", reason: "V Production nejsou nastavené přístupové údaje iDokladu." } };
    }
    if (env.IDOKLAD_LIVE_ENABLED !== "on") {
      return {
        ...base,
        dataMode: {
          kind: "disabled",
          reason: "Připojení živé agendy čeká na samostatné schválení (IDOKLAD_LIVE_ENABLED není „on“).",
        },
      };
    }
    if (!companyIco) {
      return { ...base, dataMode: { kind: "disabled", reason: "Chybí FINANCE_COMPANY_ICO (IČO Beginy) pro kontrolu agendy." } };
    }
    return { ...base, dataMode: { kind: "live", credentials: { clientId, clientSecret } } };
  }

  // Preview / vývoj
  if (!hasCredentials) {
    return { ...base, dataMode: { kind: "fixture" } };
  }
  if (env.IDOKLAD_LIVE_ENABLED === "on") {
    return {
      ...base,
      dataMode: { kind: "disabled", reason: "Živá agenda je povolená jen v Production. Preview používá testovací agendu nebo fixture data." },
    };
  }
  if (env.IDOKLAD_AGENDA_KIND !== "test") {
    return {
      ...base,
      dataMode: {
        kind: "disabled",
        reason: "Mimo Production smí být nastavená jen testovací agenda iDokladu (IDOKLAD_AGENDA_KIND=test).",
      },
    };
  }
  if (!companyIco) {
    return {
      ...base,
      dataMode: { kind: "disabled", reason: "Chybí FINANCE_COMPANY_ICO — bez něj nejde ověřit, že agenda není živá agenda Beginy." },
    };
  }
  return { ...base, dataMode: { kind: "test_agenda", credentials: { clientId, clientSecret } } };
}

// Volá se hned po přihlášení, PŘED stažením jakéhokoli dokladu.
export function assertAgendaAllowed(config: FinanceConfig, agenda: AgendaInfo): void {
  const { dataMode, companyIco } = config;
  if (dataMode.kind === "live") {
    if (!companyIco || agenda.ico !== companyIco) {
      throw new IdokladError("agenda_mismatch", {
        detail: `agenda má IČO ${agenda.ico ?? "neuvedeno"}, očekávané ${companyIco ?? "neuvedeno"}`,
      });
    }
    return;
  }
  if (dataMode.kind === "test_agenda") {
    if (companyIco && agenda.ico === companyIco) {
      throw new IdokladError("agenda_mismatch", {
        userMessage:
          "Mimo Production jsou nastavené přístupové údaje k ŽIVÉ agendě Beginy. Synchronizace se nespustila — nahraďte je údaji testovací agendy.",
      });
    }
    return;
  }
  throw new IdokladError("not_configured", {
    userMessage: dataMode.kind === "disabled" ? dataMode.reason : undefined,
  });
}

// Režim DPH ve MojeBegina musí odpovídat nastavení firmy v iDokladu.
// „Identifikovaná osoba“ se zatím nepodporuje (vyžaduje rozhodnutí).
export function assertVatModeMatches(config: FinanceConfig, agenda: AgendaInfo): VatMode {
  if (!config.vatMode) {
    throw new IdokladError("vat_mismatch", {
      userMessage: "Ve MojeBegina není nastavený režim DPH (FINANCE_VAT_MODE). Import se nespustil.",
    });
  }
  if (agenda.vatMode !== config.vatMode) {
    throw new IdokladError("vat_mismatch", {
      detail: `MojeBegina: ${config.vatMode}, iDoklad: ${agenda.vatMode ?? "neznámé"}`,
    });
  }
  return config.vatMode;
}
