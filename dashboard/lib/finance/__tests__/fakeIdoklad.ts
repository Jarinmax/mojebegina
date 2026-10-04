// Falešný iDoklad pro testy — implementuje jen to, co Finance 1.0 volá:
// token (POST na identity server), GET /Account/CurrentAgenda a GET kolekcí
// se stránkováním (page, pageSize), řazením Id~Asc a jednoduchým filtrem
// (Pole~gte~hodnota). Zaznamenává každé volání, aby testy mohly ověřit, že
// nic jiného než GET (a POST na token) nikdy neodešlo.
import { IDOKLAD_TOKEN_URL } from "../idoklad/endpoints";
import type { ApiAgenda } from "../idoklad/apiTypes";

export type FakeCall = { method: string; url: string; body: string | null; authorization: string | null };

export type FakeIdokladOptions = {
  agenda: ApiAgenda;
  collections: Record<string, unknown[]>;
  // Po tolika GET požadavcích na data začne vracet 429 (limit API).
  rateLimitAfter?: number;
  tokenStatus?: number;
  // Kolekce, pro které falešný iDoklad vrátí daný HTTP stav.
  failCollections?: Record<string, number>;
};

function envelope(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ Data: data, IsSuccess: status < 400, StatusCode: status, ErrorCode: 0 }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fieldValue(item: Record<string, unknown>, field: string): unknown {
  if (field === "DateLastChange" || field === "DateLastChanged") {
    return (item.Metadata as Record<string, unknown> | undefined)?.DateLastChange;
  }
  return item[field];
}

function applyFilter(items: Record<string, unknown>[], filter: string | null): Record<string, unknown>[] {
  if (!filter) return items;
  const parts = filter.split("~and~").map((part) => /^\((\w+)~gte~(.+)\)$/.exec(part));
  return items.filter((item) =>
    parts.every((match) => {
      if (!match) throw new Error(`Falešný iDoklad nezná filtr ${filter}`);
      const value = fieldValue(item, match[1]);
      // Porovnání jako text stačí: oba tvary začínají yyyy-MM-dd.
      return typeof value === "string" && value.replace("T", " ") >= match[2];
    })
  );
}

export function createFakeIdoklad(options: FakeIdokladOptions) {
  const calls: FakeCall[] = [];
  let dataRequests = 0;
  let tokenCounter = 0;

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    calls.push({
      method,
      url,
      body: typeof init?.body === "string" ? init.body : null,
      authorization: headers.get("Authorization"),
    });

    if (url === IDOKLAD_TOKEN_URL) {
      if (options.tokenStatus && options.tokenStatus >= 400) {
        return new Response(JSON.stringify({ error: "invalid_client" }), { status: options.tokenStatus });
      }
      tokenCounter += 1;
      return new Response(JSON.stringify({ access_token: `fake-token-${tokenCounter}`, expires_in: 3600 }), {
        status: 200,
      });
    }

    const parsed = new URL(url);
    if (!headers.get("Authorization")?.startsWith("Bearer fake-token-")) {
      return envelope(null, 401);
    }
    dataRequests += 1;
    if (options.rateLimitAfter !== undefined && dataRequests > options.rateLimitAfter) {
      return envelope(null, 429);
    }
    const path = parsed.pathname.replace(/^\/v3/, "");
    if (path === "/Account/CurrentAgenda") {
      return envelope(options.agenda);
    }
    const collection = path.slice(1);
    const failStatus = options.failCollections?.[collection];
    if (failStatus) {
      return envelope(null, failStatus);
    }
    const all = ((options.collections[collection] ?? []) as Record<string, unknown>[])
      .slice()
      .sort((a, b) => Number(a.Id) - Number(b.Id));
    const filtered = applyFilter(all, parsed.searchParams.get("filter"));
    const page = Number(parsed.searchParams.get("page") ?? "1");
    const pageSize = Number(parsed.searchParams.get("pageSize") ?? "20");
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    return envelope({
      Items: filtered.slice((page - 1) * pageSize, page * pageSize),
      TotalItems: filtered.length,
      TotalPages: totalPages,
    });
  }) as typeof fetch;

  return {
    fetchImpl,
    calls,
    get dataRequests() {
      return dataRequests;
    },
  };
}
