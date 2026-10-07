// ESHOP 1.0 — e-maily k objednávkám (Resend). Kdy se posílají:
//   - jen když pokladna vůbec ukládá objednávky (isOrderWriteEnabled),
//   - RESEND_API_KEY (re_…) a ESHOP_EMAIL_FROM jsou nastavené,
//   - ve Vercel Production navíc výslovně ESHOP_EMAIL_LIVE=on (den spuštění),
//   - mimo Production POVINNĚ ESHOP_EMAIL_TEST_RECIPIENTS: e-mail dostanou
//     jen tyto adresy (testovací režim, viz resolveRecipients). Bez seznamu
//     Preview neposílá nic — testovací objednávka tak nikdy neodejde
//     skutečnému zákazníkovi.
import { isOrderWriteEnabled } from "../orderWrite";

type Env = Record<string, string | undefined>;

export type EmailConfig = {
  apiKey: string;
  from: string;
  replyTo: string | null;
  /** Interní upozornění pro Beginu; prázdné = neposílá se. */
  internalTo: string[];
  /** null = ostrý provoz (Production); jinak jediné povolené adresy. */
  testRecipients: string[] | null;
};

const EMAIL = /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;

/** „a@x.cz, B@y.cz“ → ["a@x.cz", "b@y.cz"]; neplatné položky vynechá. */
export function parseEmailList(raw: string | undefined): string[] {
  const seen = new Set<string>();
  for (const part of (raw ?? "").split(/[,;\s]+/)) {
    const email = part.trim().toLowerCase();
    if (EMAIL.test(email)) seen.add(email);
  }
  return [...seen];
}

export function emailConfig(env: Env = process.env): EmailConfig | null {
  if (!isOrderWriteEnabled(env)) return null;
  const apiKey = env.RESEND_API_KEY?.trim() ?? "";
  const from = env.ESHOP_EMAIL_FROM?.trim() ?? "";
  if (!apiKey.startsWith("re_") || !from.includes("@")) return null;

  let testRecipients: string[] | null;
  if (env.VERCEL_ENV === "production") {
    if (env.ESHOP_EMAIL_LIVE !== "on") return null;
    testRecipients = null;
  } else {
    testRecipients = parseEmailList(env.ESHOP_EMAIL_TEST_RECIPIENTS);
    if (testRecipients.length === 0) return null;
  }

  const replyTo = parseEmailList(env.ESHOP_EMAIL_REPLY_TO)[0] ?? null;
  return {
    apiKey,
    from,
    replyTo,
    internalTo: parseEmailList(env.ESHOP_EMAIL_INTERNAL_TO),
    testRecipients,
  };
}

export type ResolvedRecipients = {
  to: string[];
  /** Adresy, kam by e-mail šel v ostrém provozu, ale v testu nesmí. */
  withheld: string[];
};

/**
 * Testovací režim: e-mail dostanou jen povolené adresy. Kdo na seznamu
 * není, e-mail nedostane — místo něj ho dostanou testovací adresy
 * (s upozorněním, komu byl určen), aby šlo zkontrolovat skutečný obsah.
 */
export function resolveRecipients(intended: string[], config: Pick<EmailConfig, "testRecipients">): ResolvedRecipients {
  const wanted = parseEmailList(intended.join(","));
  if (config.testRecipients === null) return { to: wanted, withheld: [] };
  const allowed = new Set(config.testRecipients);
  const to = wanted.filter((email) => allowed.has(email));
  const withheld = wanted.filter((email) => !allowed.has(email));
  return { to: to.length > 0 ? to : [...config.testRecipients], withheld };
}
