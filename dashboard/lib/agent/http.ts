// GPT/MCP pilot — společné odpovědi OAuth/MCP route handlerů.

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

export function jsonNoStore(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

/** Funkce vypnutá (chybí konfigurace) — tváří se jako neexistující adresa. */
export function notFound(): Response {
  return new Response("Not found", { status: 404, headers: NO_STORE });
}

export function oauthError(error: string, description: string, status = 400, headers: Record<string, string> = {}): Response {
  return jsonNoStore({ error, error_description: description }, status, headers);
}
