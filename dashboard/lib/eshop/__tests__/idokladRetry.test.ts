// iDoklad bez odpovědi (Production 19. 10. 2026: token prošel, první čtení
// /Account/CurrentAgenda skončilo timeoutem). Čtení a token se při výpadku
// jednou zopakují; zápis NIKDY (nejasný výsledek dořeší další vystavení
// dohledáním faktury podle VS). Průběh požadavků je vidět ve výsledku
// kontroly — bez tokenu a přístupových údajů.
import { describe, expect, it, vi } from "vitest";
import { createFakeIdoklad } from "./helpers/fakeIdoklad";
import { EshopIdokladClient, IDOKLAD_TIMEOUT_MS } from "../invoicing/idokladHttp";
import { runPreflightFromEnv } from "../invoicing/preflight";

const ENV = {
  VERCEL_ENV: "production",
  IDOKLAD_ESHOP_SEQUENCE_ID: "7277293",
  IDOKLAD_ESHOP_CLIENT_ID: "cid",
  IDOKLAD_ESHOP_CLIENT_SECRET: "csecret",
  IDOKLAD_ESHOP_APPLICATION_ID: "capp",
};
const timeout = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });

/** Napodobenina iDokladu, u které první N požadavků na `path` skončí `fail()`. */
function flaky(path: string, failures: number, fail: () => Promise<Response>) {
  const fake = createFakeIdoklad();
  let left = failures;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(String(input)).pathname.endsWith(path) && left > 0) {
      left -= 1;
      return fail();
    }
    return fake.fetchImpl(input, init);
  });
  return { fake, fetchImpl: fetchImpl as unknown as typeof fetch, spy: fetchImpl };
}

describe("iDoklad: výpadek odpovědi", () => {
  it("limit na požadavek je 20 s", () => {
    expect(IDOKLAD_TIMEOUT_MS).toBe(20_000);
  });

  it("agenda napoprvé bez odpovědi → jeden opakovaný pokus, kontrola projde; průběh je ve výsledku", async () => {
    const { fetchImpl } = flaky("/Account/CurrentAgenda", 1, () => Promise.reject(timeout()));
    const out = await runPreflightFromEnv(ENV, { fetchImpl });
    if (!out.ok) throw new Error(out.error);
    expect(out.result.ok).toBe(true);
    const agenda = out.result.requests.filter((r) => r.path === "/v3/Account/CurrentAgenda");
    expect(agenda.map((r) => r.status)).toEqual([null, 200]);
    expect(out.result.requests[0]).toMatchObject({ method: "POST", path: "/server/v2/connect/token", status: 200 });
    expect(JSON.stringify(out.result.requests)).not.toMatch(/cid|csecret|capp|Bearer/);
  });

  it("agenda dvakrát bez odpovědi → kontrola neprojde s „iDoklad nedostupný“, třetí pokus se nedělá", async () => {
    const { fetchImpl, spy } = flaky("/Account/CurrentAgenda", 5, () => Promise.reject(timeout()));
    const out = await runPreflightFromEnv(ENV, { fetchImpl });
    if (!out.ok) throw new Error(out.error);
    expect(out.result.ok).toBe(false);
    expect(out.result.checks.find((c) => c.key === "auth")).toMatchObject({ ok: true });
    expect(out.result.checks.find((c) => c.key === "agenda")!.detail).toMatch(/iDoklad nedostupný: The operation was aborted due to timeout/);
    expect(out.result.requests.map((r) => `${r.path} ${r.status}`)).toEqual([
      "/server/v2/connect/token 200",
      "/v3/Account/CurrentAgenda null",
      "/v3/Account/CurrentAgenda null",
    ]);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("503 u čtení → jeden opakovaný pokus; 400 se neopakuje", async () => {
    const busy = flaky("/Account/CurrentAgenda", 1, async () => new Response("Service Unavailable", { status: 503 }));
    const ok = await runPreflightFromEnv(ENV, { fetchImpl: busy.fetchImpl });
    if (!ok.ok) throw new Error(ok.error);
    expect(ok.result.ok).toBe(true);

    const bad = flaky("/Account/CurrentAgenda", 5, async () => new Response("Bad Request", { status: 400 }));
    const out = await runPreflightFromEnv(ENV, { fetchImpl: bad.fetchImpl });
    if (!out.ok) throw new Error(out.error);
    expect(out.result.requests.filter((r) => r.path === "/v3/Account/CurrentAgenda")).toHaveLength(1);
  });

  it("zápis se při výpadku NEOPAKUJE (žádné dvojí založení / vystavení)", async () => {
    const { fetchImpl, spy } = flaky("/IssuedInvoices", 5, () => Promise.reject(timeout()));
    const client = new EshopIdokladClient({
      clientId: "cid",
      clientSecret: "csecret",
      applicationId: "capp",
      writesAllowed: true,
      env: { ...ENV, IDOKLAD_INVOICING_ENABLED: "manual" },
      fetchImpl,
    });
    await expect(client.post("/IssuedInvoices", { NumericSequenceId: 7277293 })).rejects.toThrow(/iDoklad nedostupný/);
    const posts = spy.mock.calls.filter(([url]) => new URL(String(url)).pathname === "/v3/IssuedInvoices");
    expect(posts).toHaveLength(1);
  });
});
