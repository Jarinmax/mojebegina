// Finance 1.0 — pojistka „jen čtení“. iDoklad nemá roli jen pro čtení
// (UserRight: Admin / User / NoRights), takže přístupové údaje technicky
// umí i zapisovat. Proto KAŽDÝ požadavek klienta projde touto funkcí ještě
// před odesláním:
//
//   • POST je povolený jen na PŘESNÉ adresy identity serveru pro token
//     (IDOKLAD_ALLOWED_TOKEN_URLS — bez query, bez jiné cesty a hostu),
//   • na datové API (api.idoklad.cz/v3) je povolený výhradně GET, a jen na
//     kolekce/cesty ze seznamu v endpoints.ts,
//   • vše ostatní (PUT, PATCH, DELETE, POST na API, jiný host, http,
//     přihlašovací údaje v URL, „..“ v cestě, jiný port) se odmítne.
import {
  IDOKLAD_ALLOWED_TOKEN_URLS,
  IDOKLAD_API_HOST,
  IDOKLAD_API_PATH_PREFIX,
  IDOKLAD_READABLE_COLLECTIONS,
  IDOKLAD_READABLE_SINGLE_PATHS,
  IDOKLAD_TOKEN_URL,
} from "./endpoints";

export class IdokladRequestBlockedError extends Error {
  constructor(reason: string) {
    super(`Požadavek na iDoklad zablokován: ${reason}`);
    this.name = "IdokladRequestBlockedError";
  }
}

const COLLECTION_PATTERN = new RegExp(
  `^${IDOKLAD_API_PATH_PREFIX}/(${IDOKLAD_READABLE_COLLECTIONS.join("|")})(/[0-9]+)?$`
);
const SINGLE_PATHS = new Set<string>(
  IDOKLAD_READABLE_SINGLE_PATHS.map((path) => `${IDOKLAD_API_PATH_PREFIX}${path}`)
);

function parseStrict(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new IdokladRequestBlockedError("neplatná adresa");
  }
  if (url.protocol !== "https:") {
    throw new IdokladRequestBlockedError("povolené je jen https");
  }
  if (url.username !== "" || url.password !== "") {
    throw new IdokladRequestBlockedError("adresa nesmí obsahovat přihlašovací údaje");
  }
  if (url.port !== "") {
    throw new IdokladRequestBlockedError("nestandardní port");
  }
  // URL parser „..“ sám rozřeší — porovnáváme proto i původní text, aby
  // /v3/Tags/../Webhooks neprošel jako /v3/Webhooks ani jako /v3/Tags.
  if (/(\.\.|%2e|%2f|%5c|\\)/i.test(rawUrl)) {
    throw new IdokladRequestBlockedError("neplatná cesta");
  }
  return url;
}

export function assertIdokladRequestAllowed(method: string, rawUrl: string): void {
  const normalizedMethod = method.toUpperCase();
  const url = parseStrict(rawUrl);

  if (url.hostname === new URL(IDOKLAD_TOKEN_URL).hostname) {
    if (normalizedMethod !== "POST") {
      throw new IdokladRequestBlockedError("na identity server je povolený jen POST pro token");
    }
    if (url.search !== "" || url.hash !== "" || !IDOKLAD_ALLOWED_TOKEN_URLS.includes(url.href)) {
      throw new IdokladRequestBlockedError("POST je povolený jen na adresu pro získání tokenu");
    }
    return;
  }

  if (url.hostname !== IDOKLAD_API_HOST) {
    throw new IdokladRequestBlockedError(`nepovolený host ${url.hostname}`);
  }
  if (normalizedMethod !== "GET") {
    throw new IdokladRequestBlockedError(
      `metoda ${normalizedMethod} na datové API není ve Finance 1.0 povolená (jen GET)`
    );
  }
  if (url.hash !== "") {
    throw new IdokladRequestBlockedError("neplatná adresa");
  }
  if (!COLLECTION_PATTERN.test(url.pathname) && !SINGLE_PATHS.has(url.pathname)) {
    throw new IdokladRequestBlockedError(`cesta ${url.pathname} není na seznamu povolených`);
  }
}
