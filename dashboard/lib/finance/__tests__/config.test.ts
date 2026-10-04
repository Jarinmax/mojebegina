// Finance 1.0 — pojistky prostředí: Preview nikdy s živou agendou, živá
// agenda jen v Production a jen po schválení, DPH jako ověřené nastavení.
import { describe, expect, it } from "vitest";
import { assertAgendaAllowed, assertVatModeMatches, resolveFinanceConfig, type FinanceEnv } from "../config";
import { IdokladError } from "../idoklad/errors";
import type { AgendaInfo } from "../idoklad/normalize";

const BEGINA_ICO = "12345678";
const creds = { IDOKLAD_CLIENT_ID: "id", IDOKLAD_CLIENT_SECRET: "secret" };
const liveAgenda: AgendaInfo = { agendaId: "1", name: "Begina", ico: BEGINA_ICO, vatMode: "non_payer" };
const testAgenda: AgendaInfo = { agendaId: "2", name: "Test", ico: "87654321", vatMode: "non_payer" };

function code(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof IdokladError ? error.code : "other";
  }
}

describe("Production", () => {
  const prod = (env: FinanceEnv) => resolveFinanceConfig({ VERCEL_ENV: "production", FINANCE_COMPANY_ICO: BEGINA_ICO, ...env });

  it("bez údajů je vypnuto (žádná fixture data v Production)", () => {
    expect(prod({}).dataMode.kind).toBe("disabled");
  });

  it("s údaji, ale bez samostatného schválení (IDOKLAD_LIVE_ENABLED) je vypnuto", () => {
    expect(prod({ ...creds }).dataMode.kind).toBe("disabled");
    expect(prod({ ...creds, IDOKLAD_LIVE_ENABLED: "yes" }).dataMode.kind).toBe("disabled");
  });

  it("se schválením je živé — ale jen pro agendu s IČO Beginy", () => {
    const config = prod({ ...creds, IDOKLAD_LIVE_ENABLED: "on" });
    expect(config.dataMode.kind).toBe("live");
    expect(code(() => assertAgendaAllowed(config, liveAgenda))).toBeNull();
    expect(code(() => assertAgendaAllowed(config, testAgenda))).toBe("agenda_mismatch");
    expect(code(() => assertAgendaAllowed(config, { ...liveAgenda, ico: null }))).toBe("agenda_mismatch");
  });

  it("bez FINANCE_COMPANY_ICO se živá agenda nepřipojí", () => {
    const config = resolveFinanceConfig({ VERCEL_ENV: "production", ...creds, IDOKLAD_LIVE_ENABLED: "on" });
    expect(config.dataMode.kind).toBe("disabled");
  });
});

describe("Preview a vývoj", () => {
  const preview = (env: FinanceEnv) => resolveFinanceConfig({ VERCEL_ENV: "preview", FINANCE_COMPANY_ICO: BEGINA_ICO, ...env });

  it("bez údajů = fixture data", () => {
    expect(preview({}).dataMode.kind).toBe("fixture");
    expect(resolveFinanceConfig({}).dataMode.kind).toBe("fixture");
  });

  it("údaje bez označení testovací agendy se nepoužijí", () => {
    expect(preview({ ...creds }).dataMode.kind).toBe("disabled");
  });

  it("IDOKLAD_LIVE_ENABLED v Preview nic nepovolí", () => {
    expect(preview({ ...creds, IDOKLAD_AGENDA_KIND: "test", IDOKLAD_LIVE_ENABLED: "on" }).dataMode.kind).toBe("disabled");
  });

  it("testovací agenda projde, ale ŽIVÁ agenda Beginy se odmítne, i když je označená jako test", () => {
    const config = preview({ ...creds, IDOKLAD_AGENDA_KIND: "test" });
    expect(config.dataMode.kind).toBe("test_agenda");
    expect(code(() => assertAgendaAllowed(config, testAgenda))).toBeNull();
    expect(code(() => assertAgendaAllowed(config, liveAgenda))).toBe("agenda_mismatch");
  });

  it("bez IČO Beginy nejde ověřit, že agenda není živá → vypnuto", () => {
    const config = resolveFinanceConfig({ VERCEL_ENV: "preview", ...creds, IDOKLAD_AGENDA_KIND: "test" });
    expect(config.dataMode.kind).toBe("disabled");
  });

  it("fixture/disabled režim nikdy nepustí synchronizaci", () => {
    expect(code(() => assertAgendaAllowed(preview({}), testAgenda))).toBe("not_configured");
  });
});

describe("DPH — nastavení ověřené proti iDokladu", () => {
  const config = (mode?: string) =>
    resolveFinanceConfig({ VERCEL_ENV: "preview", FINANCE_COMPANY_ICO: BEGINA_ICO, FINANCE_VAT_MODE: mode });

  it("nenastavený režim DPH import zastaví", () => {
    expect(code(() => assertVatModeMatches(config(undefined), testAgenda))).toBe("vat_mismatch");
    expect(code(() => assertVatModeMatches(config("neplátce"), testAgenda))).toBe("vat_mismatch");
  });

  it("shoda projde, neshoda import zastaví", () => {
    expect(assertVatModeMatches(config("non_payer"), testAgenda)).toBe("non_payer");
    expect(code(() => assertVatModeMatches(config("payer"), testAgenda))).toBe("vat_mismatch");
    expect(code(() => assertVatModeMatches(config("non_payer"), { ...testAgenda, vatMode: "identified_person" }))).toBe(
      "vat_mismatch"
    );
  });
});
