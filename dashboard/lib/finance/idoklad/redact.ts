// Finance 1.0 — Client ID, Client Secret ani access token se nesmí dostat
// do logu, chybové hlášky, DB ani UI. Každý text, který opouští klienta
// (chyba, záznam běhu synchronizace), prochází touto funkcí.

const REDACTED = "[skryto]";

// I když tajemství neznáme hodnotou (např. token z odpovědi, který se
// ještě nestihl zapamatovat), zakryjí se podle tvaru.
const GENERIC_PATTERNS: Array<[RegExp, string]> = [
  [/(client_secret|client_id|access_token|refresh_token)(["']?\s*[:=]\s*["']?)[^"'&\s,}]+/gi, `$1$2${REDACTED}`],
  [/(Bearer|Basic)\s+[A-Za-z0-9\-._~+/]+=*/gi, `$1 ${REDACTED}`],
];

export function redactSecrets(text: string, secrets: ReadonlyArray<string | null | undefined>): string {
  let result = text;
  // Delší tajemství nejdřív — kdyby jedno bylo podřetězcem jiného.
  const known = secrets
    .filter((secret): secret is string => typeof secret === "string" && secret.length >= 4)
    .sort((a, b) => b.length - a.length);
  for (const secret of known) {
    result = result.split(secret).join(REDACTED);
  }
  for (const [pattern, replacement] of GENERIC_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// Chybové tělo z iDokladu se do záznamu běhu ukládá jen zkrácené a očištěné.
export function safeSnippet(
  text: string,
  secrets: ReadonlyArray<string | null | undefined>,
  maxLength = 300
): string {
  const cleaned = redactSecrets(text, secrets).replace(/\s+/g, " ").trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned;
}
