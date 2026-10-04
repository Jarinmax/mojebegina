// Finance 1.0 — čtecí klient: token jen v paměti, tajné údaje nikdy v chybě
// ani v logu, srozumitelné chyby, stránkování a limit požadavků.
import { describe, expect, it, vi } from "vitest";
import { IdokladClient, andFilters, filterExpression, formatFilterDate } from "../idoklad/client";
import { IDOKLAD_TOKEN_URL } from "../idoklad/endpoints";
import { IdokladError } from "../idoklad/errors";
import { redactSecrets } from "../idoklad/redact";
import { createFakeIdoklad } from "./fakeIdoklad";
import { fixtureAgenda, fixtureIssuedInvoices } from "../__fixtures__/idoklad";

const CLIENT_ID = "test-client-id-0000";
const CLIENT_SECRET = "super-secret-value-1234567890";
const credentials = { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("IdokladClient — přihlášení", () => {
  it("získá token jedním POST na identity server a pak ho znovu používá", async () => {
    const fake = createFakeIdoklad({ agenda: fixtureAgenda, collections: {} });
    const client = new IdokladClient({ credentials, fetchImpl: fake.fetchImpl });
    await client.get("/Account/CurrentAgenda");
    await client.get("/Account/CurrentAgenda");
    const tokenCalls = fake.calls.filter((call) => call.url === IDOKLAD_TOKEN_URL);
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0].method).toBe("POST");
    expect(tokenCalls[0].body).toContain("grant_type=client_credentials");
    expect(tokenCalls[0].body).toContain("scope=idoklad_api");
    // Datové požadavky jdou s Bearer tokenem, ne s Client Secret.
    const dataCalls = fake.calls.filter((call) => call.url !== IDOKLAD_TOKEN_URL);
    expect(dataCalls.every((call) => call.method === "GET")).toBe(true);
    expect(dataCalls.every((call) => !call.url.includes(CLIENT_SECRET))).toBe(true);
  });

  it("po vypršení si vyžádá nový token", async () => {
    let now = 1_000_000;
    const fake = createFakeIdoklad({ agenda: fixtureAgenda, collections: {} });
    const client = new IdokladClient({ credentials, fetchImpl: fake.fetchImpl, now: () => now });
    await client.get("/Account/CurrentAgenda");
    now += 3_600_000; // hodina
    await client.get("/Account/CurrentAgenda");
    expect(fake.calls.filter((call) => call.url === IDOKLAD_TOKEN_URL)).toHaveLength(2);
  });

  it("bez přístupových údajů se klient vůbec nevytvoří", () => {
    expect(() => new IdokladClient({ credentials: { clientId: "", clientSecret: "x" } })).toThrow(IdokladError);
  });

  it("odmítnuté přihlášení → auth_failed a chyba neobsahuje Client ID ani Secret", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "invalid_client", echo: `client_secret=${CLIENT_SECRET}&client_id=${CLIENT_ID}` }, 400)
    ) as unknown as typeof fetch;
    const client = new IdokladClient({ credentials, fetchImpl });
    const error = await client.get("/Tags").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IdokladError);
    expect((error as IdokladError).code).toBe("auth_failed");
    const text = `${(error as Error).message} ${(error as IdokladError).detail} ${JSON.stringify(error)}`;
    expect(text).not.toContain(CLIENT_SECRET);
    expect(text).not.toContain(CLIENT_ID);
  });
});

describe("IdokladClient — tajné údaje v lozích", () => {
  it("log událostí nese jen metodu, cestu a stav — nikdy token ani query", async () => {
    const events: unknown[] = [];
    const fake = createFakeIdoklad({ agenda: fixtureAgenda, collections: { IssuedInvoices: fixtureIssuedInvoices } });
    const client = new IdokladClient({ credentials, fetchImpl: fake.fetchImpl, log: (event) => events.push(event) });
    await client.getPage("IssuedInvoices", 1, { filter: "(DateLastChange~gte~2026-10-01 00:00:00.000)" });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("fake-token");
    expect(serialized).not.toContain(CLIENT_SECRET);
    expect(serialized).not.toContain("DateLastChange");
    expect(events).toContainEqual(expect.objectContaining({ kind: "request", method: "GET", path: "/v3/IssuedInvoices" }));
  });

  it("chyba z API s tokenem v těle se uloží očištěná", async () => {
    let call = 0;
    const fetchImpl = (async () => {
      call += 1;
      if (call === 1) return jsonResponse({ access_token: "tok-ABCDEFGH123456", expires_in: 3600 });
      return jsonResponse({ IsSuccess: false, Message: "Bad token Bearer tok-ABCDEFGH123456", ErrorCode: 0 }, 500);
    }) as typeof fetch;
    const client = new IdokladClient({ credentials, fetchImpl });
    const error = (await client.get("/Tags").catch((e: unknown) => e)) as IdokladError;
    expect(error.code).toBe("server_error");
    expect(error.message).not.toContain("tok-ABCDEFGH123456");
  });

  it("redactSecrets zakryje známá tajemství i tvary client_secret=, access_token:, Bearer", () => {
    const text = `client_secret=abc123secret&x=1 {"access_token":"eyJhbGciOi.xyz"} Authorization: Bearer eyJ.abc.def ${CLIENT_SECRET}`;
    const result = redactSecrets(text, [CLIENT_SECRET]);
    expect(result).not.toContain("abc123secret");
    expect(result).not.toContain("eyJhbGciOi.xyz");
    expect(result).not.toContain("eyJ.abc.def");
    expect(result).not.toContain(CLIENT_SECRET);
  });
});

describe("IdokladClient — chyby a limity", () => {
  async function errorFor(status: number, body: unknown = { IsSuccess: false, ErrorCode: 0, Message: "x" }) {
    let call = 0;
    const fetchImpl = (async () => {
      call += 1;
      return call === 1 ? jsonResponse({ access_token: "tok", expires_in: 3600 }) : jsonResponse(body, status);
    }) as typeof fetch;
    const client = new IdokladClient({ credentials, fetchImpl });
    return (await client.get("/Tags").catch((e: unknown) => e)) as IdokladError;
  }

  it("mapuje stavy na srozumitelné kódy", async () => {
    expect((await errorFor(401)).code).toBe("auth_failed");
    expect((await errorFor(403)).code).toBe("forbidden");
    expect((await errorFor(429)).code).toBe("rate_limited");
    expect((await errorFor(503)).code).toBe("server_error");
    expect((await errorFor(400, { IsSuccess: false, ErrorCode: 126, Message: "API" })).code).toBe("api_not_allowed");
    expect((await errorFor(400, { IsSuccess: false, ErrorCode: 600, Message: "Billing" })).code).toBe("billing");
  });

  it("každá chyba má českou zprávu pro uživatele", async () => {
    const error = await errorFor(429);
    expect(error.userMessage).toMatch(/limit/i);
  });

  it("síťová chyba → network", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const client = new IdokladClient({ credentials, fetchImpl });
    expect(((await client.get("/Tags").catch((e: unknown) => e)) as IdokladError).code).toBe("network");
  });

  it("odpověď bez Data → invalid_response", async () => {
    let call = 0;
    const fetchImpl = (async () => {
      call += 1;
      return call === 1 ? jsonResponse({ access_token: "tok", expires_in: 3600 }) : jsonResponse({ nothing: true });
    }) as typeof fetch;
    const client = new IdokladClient({ credentials, fetchImpl });
    expect(((await client.get("/Tags").catch((e: unknown) => e)) as IdokladError).code).toBe("invalid_response");
  });

  it("limit požadavků na běh: po vyčerpání se už nic neodešle", async () => {
    const fake = createFakeIdoklad({ agenda: fixtureAgenda, collections: {} });
    const client = new IdokladClient({ credentials, fetchImpl: fake.fetchImpl, requestBudget: 2 });
    await client.get("/Tags");
    await client.get("/Tags");
    const error = (await client.get("/Tags").catch((e: unknown) => e)) as IdokladError;
    expect(error.code).toBe("budget_exhausted");
    expect(fake.dataRequests).toBe(2);
    expect(client.requestCount).toBe(2);
  });

  it("nepovolená cesta se zablokuje ještě před odesláním", async () => {
    const fake = createFakeIdoklad({ agenda: fixtureAgenda, collections: {} });
    const client = new IdokladClient({ credentials, fetchImpl: fake.fetchImpl });
    const error = (await client.get("/Webhooks").catch((e: unknown) => e)) as IdokladError;
    expect(error.code).toBe("request_blocked");
    // Nic se neodeslalo — ani dotaz na data (token mohl proběhnout dřív).
    expect(fake.calls.filter((call) => call.url.includes("/Webhooks"))).toHaveLength(0);
  });

  it("přesměrování se nesleduje (redirect: error) a neukládá se cache", async () => {
    const seen: RequestInit[] = [];
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init ?? {});
      return seen.length === 1
        ? jsonResponse({ access_token: "tok", expires_in: 3600 })
        : jsonResponse({ Data: { Items: [], TotalItems: 0, TotalPages: 1 }, IsSuccess: true });
    }) as typeof fetch;
    const client = new IdokladClient({ credentials, fetchImpl });
    await client.getPage("Tags", 1);
    expect(seen.every((init) => init.redirect === "error" && init.cache === "no-store")).toBe(true);
  });
});

describe("IdokladClient — stránkování", () => {
  it("projde všechny stránky", async () => {
    const items = Array.from({ length: 5 }, (_, index) => ({ Id: index + 1 }));
    const fake = createFakeIdoklad({ agenda: fixtureAgenda, collections: { Tags: items } });
    const client = new IdokladClient({ credentials, fetchImpl: fake.fetchImpl });
    const pages = [];
    for await (const page of client.listPages<{ Id: number }>("Tags", { pageSize: 2 })) {
      pages.push(page.items.map((item) => item.Id));
    }
    expect(pages).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("formát filtru odpovídá SDK", () => {
    expect(formatFilterDate(new Date("2026-10-04T08:05:09.007Z"))).toBe("2026-10-04 08:05:09.007");
    expect(andFilters(filterExpression("DateLastChange", "gte", "2026-10-01 00:00:00.000"), filterExpression("DateOfIssue", "lte", "2026-10-31"))).toBe(
      "(DateLastChange~gte~2026-10-01 00:00:00.000)~and~(DateOfIssue~lte~2026-10-31)"
    );
    expect(() => filterExpression("Id)~or~(Id", "eq", "1")).toThrow();
  });
});
