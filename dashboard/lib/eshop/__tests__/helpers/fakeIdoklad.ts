// Napodobenina iDoklad API v3 pro testy ostrého vystavení e-shopové faktury.
// Odpovídá tvarem obálky ({ Data, IsSuccess, StatusCode }) a cestami
// oficiálního SDK. Zaznamenává každý požadavek, umí podstrčit chyby.

export type FakeCall = { method: string; path: string; query: Record<string, string>; body: unknown };

type Invoice = {
  Id: number;
  DocumentNumber: string;
  VariableSymbol: string;
  NumericSequenceId: number;
  PartnerId: number;
  PaymentStatus: number;
  Prices: { TotalWithVat: number; TotalVat: number; TotalPaid: number };
  body: Record<string, unknown>;
};

export type FakeIdokladOptions = {
  ico?: string;
  vatPayer?: boolean;
  sequences?: { Id: number; Name: string; DocumentType: number; IsDefault: boolean; NumberFormat: string }[];
  /** podstrčené chyby podle „METODA cesta“ (cesta bez /v3, bez query) */
  failOnce?: Record<string, { status: number; message: string; afterEffect?: boolean }>;
  /** faktura se uloží s jinou cenou (simulace chyby iDokladu) */
  priceFactor?: number;
};

// ID faktur a pořadová čísla jsou jedinečné napříč napodobeninami (jako
// v iDokladu) — testy sdílejí jednu DB s unikátními indexy na ID a číslo.
const shared = { invoiceId: 7000, serial: 0 };

export function createFakeIdoklad(options: FakeIdokladOptions = {}) {
  const calls: FakeCall[] = [];
  const failOnce = { ...(options.failOnce ?? {}) };
  const contacts: { Id: number; Email: string | null; CompanyName: string; IdentificationNumber: string | null }[] = [
    { Id: 501, Email: "odberatel@b2b.cz", CompanyName: "B2B s.r.o.", IdentificationNumber: "12345678" },
  ];
  const invoices: Invoice[] = [];
  let nextContactId = 900;
  const sequences = options.sequences ?? [
    { Id: 2032369, Name: "Výchozí", DocumentType: 0, IsDefault: true, NumberFormat: "{RRRR}{NNNN}" },
    { Id: 2032370, Name: "Výchozí", DocumentType: 1, IsDefault: true, NumberFormat: "Z9{RRRR}{NNNN}" },
    { Id: 7277293, Name: "E-shop Begina", DocumentType: 0, IsDefault: false, NumberFormat: "9{RR}{NNNN}" },
  ];

  const ok = (data: unknown, status = 200) =>
    new Response(JSON.stringify({ Data: data, IsSuccess: true, StatusCode: status }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  const fail = (status: number, message: string) =>
    new Response(JSON.stringify({ Data: null, IsSuccess: false, StatusCode: status, Message: message }), { status });
  const page = <T>(items: T[]) => ok({ Items: items, TotalItems: items.length, TotalPages: 1 });
  const filterValue = (query: Record<string, string>, prop: string) => {
    const m = new RegExp(`${prop}~eq~(.+)$`).exec(query.filter ?? "");
    return m ? m[1] : null;
  };
  const invoiceView = (i: Invoice) => ({
    Id: i.Id,
    DocumentNumber: i.DocumentNumber,
    VariableSymbol: i.VariableSymbol,
    PartnerId: i.PartnerId,
    PaymentStatus: i.PaymentStatus,
    Prices: i.Prices,
  });

  async function handle(method: string, url: URL, body: unknown): Promise<Response> {
    if (url.hostname === "identity.idoklad.cz") {
      return new Response(JSON.stringify({ access_token: "tok-fake", expires_in: 3600 }), { status: 200 });
    }
    const path = url.pathname.replace(/^\/v3/, "");
    const query = Object.fromEntries(url.searchParams);
    calls.push({ method, path, query, body });
    const key = `${method} ${path}`;
    const injected = failOnce[key];
    if (injected && !injected.afterEffect) {
      delete failOnce[key];
      return fail(injected.status, injected.message);
    }

    let response: Response;
    if (method === "GET" && path === "/Account/CurrentAgenda") {
      response = ok({
        Name: "Begina",
        IsRegisteredForVat: options.vatPayer ?? false,
        PreferredPriceType: 0,
        Contact: { IdentificationNumber: options.ico ?? "74337297" },
      });
    } else if (method === "GET" && path === "/NumericSequences") {
      const type = /DocumentType~eq~(\d+)/.exec(query.filter ?? "")?.[1];
      response = page(sequences.filter((s) => type === undefined || String(s.DocumentType) === type));
    } else if (method === "GET" && path === "/NumericSequences/DocumentNumbers/IssuedInvoice") {
      const seq = Number(query.numericSequenceId);
      const yy = (query.date ?? "2026").slice(2, 4);
      response = ok({
        Unique: { NumericSequenceId: seq, DocumentSerialNumber: shared.serial + 1, DocumentNumber: `9${yy}${String(shared.serial + 1).padStart(4, "0")}` },
        Custom: null,
      });
    } else if (method === "GET" && path === "/Contacts") {
      const email = filterValue(query, "Email");
      response = page(contacts.filter((c) => (c.Email ?? "").toLowerCase() === (email ?? "").toLowerCase()));
    } else if (method === "GET" && /^\/Contacts\/\d+$/.test(path)) {
      const c = contacts.find((x) => x.Id === Number(path.split("/")[2]));
      response = c ? ok(c) : fail(404, "Not found");
    } else if (method === "POST" && path === "/Contacts") {
      const b = body as { Email: string; CompanyName: string; CountryId: number };
      if (!b.CompanyName || !b.CountryId) return fail(400, "CompanyName a CountryId jsou povinné");
      const c = { Id: nextContactId++, Email: b.Email, CompanyName: b.CompanyName, IdentificationNumber: null };
      contacts.push(c);
      response = ok(c, 200);
    } else if (method === "GET" && path === "/Currencies") {
      response = page([{ Id: 2, Code: "CZK", Name: "Česká koruna" }].filter((c) => c.Code === filterValue(query, "Code")));
    } else if (method === "GET" && path === "/Countries") {
      // CZ = ISO ALPHA-2 (ověřeno proti oficiálnímu SDK, viz CZECH_REPUBLIC_COUNTRY_CODE v idoklad.ts) — ne dřívější chybné "CZE".
      response = page([{ Id: 2, Code: "CZ", Name: "Česká republika" }].filter((c) => c.Code === filterValue(query, "Code")));
    } else if (method === "GET" && path === "/PaymentOptions") {
      // Přesně odpovídá skutečné agendě Beginy (ověřeno živým read-only testem 7. 10. 2026) —
      // anglické názvy, ne dřív předpokládané české; Code u karty "P", ne "K".
      response = page([
        { Id: 1, Name: "Bank transfer", Code: "B", IsDefault: true },
        { Id: 2, Name: "Cash", Code: "H", IsDefault: false },
        { Id: 3, Name: "Credit card", Code: "P", IsDefault: false },
        { Id: 4, Name: "Cash on delivery", Code: "D", IsDefault: false },
      ]);
    } else if (method === "GET" && path === "/IssuedInvoices/Default") {
      response = ok({ AccountNumber: "19-2000145399", BankId: 7, IsIncomeTax: true, ConstantSymbolId: 3, Items: [{ PriceType: 0, VatRateType: 2 }] });
    } else if (method === "GET" && path === "/IssuedInvoices") {
      const vs = filterValue(query, "VariableSymbol");
      response = page(invoices.filter((i) => i.VariableSymbol === vs).map(invoiceView));
    } else if (method === "GET" && /^\/IssuedInvoices\/\d+$/.test(path)) {
      const i = invoices.find((x) => x.Id === Number(path.split("/")[2]));
      response = i ? ok(invoiceView(i)) : fail(404, "Not found");
    } else if (method === "POST" && path === "/IssuedInvoices") {
      const b = body as Record<string, unknown> & { Items: { Amount: number; UnitPrice: number }[] };
      for (const required of ["PartnerId", "NumericSequenceId", "DocumentSerialNumber", "CurrencyId", "PaymentOptionId", "Description", "DateOfIssue"]) {
        if (b[required] === undefined || b[required] === null) return fail(400, `${required} je povinné`);
      }
      if (invoices.some((i) => i.NumericSequenceId === b.NumericSequenceId && i.DocumentNumber.endsWith(String(b.DocumentSerialNumber).padStart(4, "0")))) {
        return fail(400, "Číslo dokladu už existuje");
      }
      shared.serial = Number(b.DocumentSerialNumber);
      const total = b.Items.reduce((s, it) => s + it.Amount * it.UnitPrice, 0) * (options.priceFactor ?? 1);
      const inv: Invoice = {
        Id: shared.invoiceId++,
        DocumentNumber: `9${String(b.DateOfIssue).slice(2, 4)}${String(shared.serial).padStart(4, "0")}`,
        VariableSymbol: String(b.VariableSymbol),
        NumericSequenceId: Number(b.NumericSequenceId),
        PartnerId: Number(b.PartnerId),
        PaymentStatus: 0,
        Prices: { TotalWithVat: total, TotalVat: 0, TotalPaid: 0 },
        body: b,
      };
      invoices.push(inv);
      response = ok(invoiceView(inv));
    } else if (method === "PUT" && /^\/IssuedDocumentPayments\/FullyPay\/\d+$/.test(path)) {
      const i = invoices.find((x) => x.Id === Number(path.split("/")[3]));
      if (!i) return fail(404, "Not found");
      i.PaymentStatus = 1;
      i.Prices.TotalPaid = i.Prices.TotalWithVat;
      response = ok(true);
    } else if (method === "GET" && /^\/Reports\/IssuedInvoice\/\d+\/Pdf$/.test(path)) {
      response = ok(Buffer.from(`%PDF-1.4 faktura ${path.split("/")[3]}`).toString("base64"));
    } else {
      response = fail(404, `Napodobenina nezná ${method} ${path}`);
    }
    // chyba PO provedení (zápis v iDokladu proběhl, odpověď se ztratila)
    if (injected?.afterEffect) {
      delete failOnce[key];
      return fail(injected.status, injected.message);
    }
    return response;
  }

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    let body: unknown = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    return handle(method, url, body);
  }) as typeof fetch;

  return {
    fetchImpl,
    calls,
    contacts,
    invoices,
    /** příští ID faktury a číslo (pro očekávání v testech) */
    next: () => ({ id: shared.invoiceId, number: `926${String(shared.serial + 1).padStart(4, "0")}` }),
    writes: () => calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`),
  };
}
