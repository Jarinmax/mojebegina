// Finance 1.0 — pojistka „jen čtení“ (schválené pravidlo 4. 10. 2026):
// POST jen na přesnou adresu pro token, na datové API výhradně GET.
import { describe, expect, it } from "vitest";
import { IDOKLAD_TOKEN_URL } from "../idoklad/endpoints";
import { IdokladRequestBlockedError, assertIdokladRequestAllowed } from "../idoklad/requestGuard";

const API = "https://api.idoklad.cz/v3";

function blocked(method: string, url: string) {
  expect(() => assertIdokladRequestAllowed(method, url)).toThrow(IdokladRequestBlockedError);
}

describe("token — jediný povolený POST", () => {
  it("POST na přesnou adresu identity serveru projde", () => {
    expect(() => assertIdokladRequestAllowed("POST", IDOKLAD_TOKEN_URL)).not.toThrow();
    expect(() => assertIdokladRequestAllowed("post", IDOKLAD_TOKEN_URL)).not.toThrow();
  });

  it("GET/PUT/DELETE na identity server neprojde", () => {
    blocked("GET", IDOKLAD_TOKEN_URL);
    blocked("PUT", IDOKLAD_TOKEN_URL);
    blocked("DELETE", IDOKLAD_TOKEN_URL);
  });

  it("POST na jinou cestu identity serveru neprojde", () => {
    blocked("POST", "https://identity.idoklad.cz/server/v2/connect/authorize");
    blocked("POST", "https://identity.idoklad.cz/server/connect/authorize");
    blocked("POST", "https://identity.idoklad.cz/server/connect/userinfo");
    blocked("POST", `${IDOKLAD_TOKEN_URL}?x=1`);
    blocked("POST", `${IDOKLAD_TOKEN_URL}/`);
  });
});

describe("datové API — jen GET", () => {
  it("GET na povolené kolekce a detail projde", () => {
    for (const path of [
      "/IssuedInvoices",
      "/IssuedInvoices/123",
      "/CreditNotes",
      "/ProformaInvoices",
      "/SalesReceipts",
      "/ReceivedInvoices",
      "/ReceivedReceipts",
      "/IssuedDocumentPayments",
      "/ReceivedDocumentPayments",
      "/Tags",
      "/Account/CurrentAgenda",
    ]) {
      expect(() => assertIdokladRequestAllowed("GET", `${API}${path}?page=1&pageSize=100`)).not.toThrow();
    }
  });

  it("POST, PUT, PATCH a DELETE na datové API jsou zakázané — i na povolené kolekce", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      blocked(method, `${API}/IssuedInvoices`);
      blocked(method, `${API}/IssuedInvoices/123`);
    }
  });

  it("zápisové a nepovolené cesty jsou zakázané i pro GET", () => {
    for (const path of [
      "/Webhooks",
      "/IssuedInvoices/123/Copy",
      "/IssuedInvoices/Default",
      "/IssuedInvoices/123/Recount",
      "/Mails/IssuedInvoice/Send",
      "/Batch",
      "/Account/Agendas/DeleteRequest",
      "/Logs",
      "",
      "/",
    ]) {
      blocked("GET", `${API}${path}`);
    }
  });

  it("API v2 je zakázané", () => {
    blocked("GET", "https://api.idoklad.cz/v2/IssuedInvoices");
    blocked("GET", "https://app.idoklad.cz/developer/api/v2/IssuedInvoices");
  });
});

describe("triky s adresou", () => {
  it("jiný host, http, port, přihlašovací údaje v URL", () => {
    blocked("GET", "http://api.idoklad.cz/v3/IssuedInvoices");
    blocked("GET", "https://api.idoklad.cz.evil.example/v3/IssuedInvoices");
    blocked("GET", "https://evil.example/v3/IssuedInvoices");
    blocked("GET", "https://user:pass@api.idoklad.cz/v3/IssuedInvoices");
    blocked("GET", "https://api.idoklad.cz@evil.example/v3/IssuedInvoices");
    blocked("GET", "https://api.idoklad.cz:8443/v3/IssuedInvoices");
  });

  it("procházení cesty (.., zakódované lomítko a tečky) neprojde", () => {
    blocked("GET", `${API}/Tags/../Webhooks`);
    blocked("GET", `${API}/Tags/%2e%2e/Webhooks`);
    blocked("GET", `${API}/Tags%2F..%2FWebhooks`);
    blocked("GET", `${API}/Tags\\..\\Webhooks`);
  });

  it("neplatná adresa", () => {
    blocked("GET", "not a url");
  });
});
