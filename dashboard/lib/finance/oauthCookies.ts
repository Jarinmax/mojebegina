// Finance 1.0 — cookies prvního OAuth testu iDokladu. Obě jsou httpOnly,
// krátkodobé (10 min), podepsané a s co nejužší cestou:
//   • STATE  — kopie podepsaného `state` pro ověření v callbacku; po callbacku
//              se hned maže (jednorázová),
//   • RESULT — výsledek read-only kontroly (název agendy, IČO, počty) pro
//              stránku testu. Neobsahuje token ani jiné přístupové údaje.
//   • SEQUENCES — výpis číselných řad (ID, název, formát, typ, výchozí) —
//              samostatně, aby se oba výsledky vešly do limitu cookie.
export const IDOKLAD_STATE_COOKIE = "idoklad_oauth_state";
export const IDOKLAD_STATE_COOKIE_PATH = "/api/idoklad";
export const IDOKLAD_RESULT_COOKIE = "idoklad_oauth_result";
export const IDOKLAD_SEQUENCES_COOKIE = "idoklad_oauth_sequences";
export const IDOKLAD_CODEBOOKS_COOKIE = "idoklad_oauth_codebooks";
export const IDOKLAD_TEST_PAGE_PATH = "/rizeni-firmy/finance/idoklad";
export const IDOKLAD_COOKIE_MAX_AGE_SECONDS = 10 * 60;
