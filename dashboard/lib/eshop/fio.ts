// Fio banka — čtení pohybů na účtu přes API Bankovnictví (jen čtení).
// Token má právo „Pouze sledovat účet“ (vytvořil Jarin 15. 11. 2026, je
// v nastavení Vercelu jako FIO_API_TOKEN) — platbu s ním zadat nelze.
// Návod Fio: https://www.fio.cz/docs/cz/API_Bankovnictvi.pdf (kap. 5 URL
// dotazu, kap. 2 token; doporučený odstup dotazů na jeden token je 30 s).

export type FioTransaction = {
  /** ID pohybu (column22) — jednoznačné, slouží proti dvojímu zápisu */
  id: string;
  /** den pohybu RRRR-MM-DD (column0) */
  date: string;
  /** částka v haléřích; kladná = příchozí (column1) */
  amountHal: number;
  currency: string;
  vs: string | null;
  counterparty: string | null;
  message: string | null;
  /** typ pohybu, např. „Platba kartou“ (column8) */
  kind?: string;
  /** uživatelská identifikace — u karet obchodník, např. „VERCEL INC.“ (column7) */
  ident?: string;
  /** upřesnění — u plateb v cizí měně částka a měna, např. „24.20 USD“ (column18) */
  detail?: string;
  /** komentář (column25) */
  comment?: string;
};

const FIO_BASE = "https://fioapi.fio.cz/v1/rest";

type FioColumn = { value?: unknown } | null | undefined;
type FioRow = Record<string, FioColumn>;

function columnValue(row: FioRow, id: number): unknown {
  return row[`column${id}`]?.value ?? null;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

/** Datum pohybu: Fio posílá „2026-11-13+0100“, ve starších ukázkách epochu v ms. */
function fioDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ""));
  return match ? match[1] : null;
}

/** Odpověď Fio (transactions.json) → pohyby. Neúplné řádky vynechá. */
export function parseFioTransactions(json: unknown): FioTransaction[] {
  const list = (json as { accountStatement?: { transactionList?: { transaction?: unknown } | null } } | null)?.accountStatement?.transactionList?.transaction;
  if (!Array.isArray(list)) return [];
  const result: FioTransaction[] = [];
  for (const raw of list as FioRow[]) {
    const id = text(columnValue(raw, 22));
    const date = fioDate(columnValue(raw, 0));
    const amount = Number(columnValue(raw, 1));
    if (!id || !date || !Number.isFinite(amount)) continue;
    const vs = text(columnValue(raw, 5))?.replace(/^0+(?=\d)/, "") ?? null;
    result.push({
      id,
      date,
      amountHal: Math.round(amount * 100),
      currency: text(columnValue(raw, 14)) ?? "",
      vs: vs && /^[0-9]{1,10}$/.test(vs) ? vs : null,
      counterparty: text(columnValue(raw, 10)),
      message: text(columnValue(raw, 16)),
      kind: text(columnValue(raw, 8)) ?? undefined,
      ident: text(columnValue(raw, 7)) ?? undefined,
      detail: text(columnValue(raw, 18)) ?? undefined,
      comment: text(columnValue(raw, 25)) ?? undefined,
    });
  }
  return result;
}

export type FioFetchResult = { ok: true; transactions: FioTransaction[] } | { ok: false; error: string };

/** Pohyby na účtu za období (dny RRRR-MM-DD včetně). Token se nikam nevypisuje. */
export async function fetchFioTransactions(token: string, from: string, to: string, fetchImpl: typeof fetch = fetch): Promise<FioFetchResult> {
  try {
    const response = await fetchImpl(`${FIO_BASE}/periods/${encodeURIComponent(token)}/${from}/${to}/transactions.json`, {
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, error: `Fio API vrátilo stav ${response.status}` };
    return { ok: true, transactions: parseFioTransactions(await response.json()) };
  } catch (error) {
    // zpráva chyby může obsahovat URL s tokenem — nikdy ji nepředávat dál
    return { ok: false, error: error instanceof Error && error.name === "TimeoutError" ? "Fio API neodpovědělo včas" : "Fio API se nepodařilo zavolat" };
  }
}
