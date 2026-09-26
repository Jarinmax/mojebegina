// Security Phase 16.6 — bezpečné "Zpět" napříč detail stránkami CRM
// (lead, zákazník). Bug: "← Obchod / CRM" byl na obou detailech napevno
// `/rizeni-firmy/obchod` (bez `?view=`), což ObchodPage vyhodnotí jako
// výchozí pohled "moje-leady" — takže návrat ze "Všechny leady" vždycky
// skončil na jiném pohledu, ne tam, odkud uživatel přišel.
//
// Řešení: seznamový pohled (ObchodPage) posílá do karet aktuální URL
// (cesta + query, tzn. i `?view=...`) jako `returnTo`; detail stránky ho
// čtou a použijí pro odkaz Zpět. Hodnota z URL je nedůvěryhodný vstup
// (uživatel/útočník ji může nastavit libovolně v adresním řádku), proto
// se validuje: smí vést jen na `/rizeni-firmy/obchod` samotné (volitelně
// s query), nikdy nikam jinam — jinak by šlo o open-redirect přes odkaz,
// který navenek vypadá jako důvěryhodné tlačítko Zpět.
const SAFE_RETURN_TO_RE = /^\/rizeni-firmy\/obchod(?:\?[a-zA-Z0-9=&_.%-]*)?$/;

export const DEFAULT_CRM_RETURN_TO = "/rizeni-firmy/obchod?view=vsechny-leady";

export function sanitizeReturnTo(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !SAFE_RETURN_TO_RE.test(value)) {
    return DEFAULT_CRM_RETURN_TO;
  }
  return value;
}
