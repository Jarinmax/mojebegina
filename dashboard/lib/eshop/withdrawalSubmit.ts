// Odeslání online odstoupení od smlouvy (server): ověření, záznam
// k objednávce (když jde podle čísla a e-mailu dohledat), potvrzení přijetí
// spotřebiteli a upozornění pro Beginu. Bez přihlášení a bez CAPTCHA.
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { emailConfig, resolveRecipients, type EmailConfig } from "./email/config";
import { resendTransport, type EmailTransport } from "./email/resend";
import { withdrawalAcknowledgementEmail, withdrawalInternalEmail } from "./email/templates";
import { DELIVERY_ADDRESS, OPERATOR } from "./operator";
import { ESHOP_ACTOR_NAME } from "./orderWrite";
import { orderNumberFrom, statementLines, validateWithdrawal, type WithdrawalStatement } from "./withdrawal";

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
const { orderActivity, orders } = schema;

export type WithdrawalResult =
  | { ok: true; statement: WithdrawalStatement; orderFound: boolean }
  | { ok: false; error: string; field?: string };

export async function submitWithdrawal<T extends PgQueryResultHKT>(
  db: PgDatabase<T, typeof schema> | Db,
  raw: Record<string, unknown>,
  options: { now?: Date; baseUrl: string; config?: EmailConfig | null; transport?: EmailTransport }
): Promise<WithdrawalResult> {
  const valid = validateWithdrawal(raw);
  if (!valid.ok) return valid;
  const statement: WithdrawalStatement = { ...valid.value, submittedAt: options.now ?? new Date() };

  // Objednávka: číslo z údajů o smlouvě + shodný kontaktní e-mail (cizí
  // objednávku tak nikdo neoznačí). Nenalezená objednávka odstoupení
  // nebrání — Begina ji dohledá ručně.
  let orderId: string | null = null;
  const number = orderNumberFrom(statement.contract);
  if (number !== null) {
    const [found] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.orderNumber, number), sql`lower(${orders.contactEmail}) = ${statement.email}`))
      .limit(1);
    orderId = found?.id ?? null;
  }
  if (orderId) {
    await db.insert(orderActivity).values({
      orderId,
      actorType: "system",
      authorUserId: null,
      authorName: ESHOP_ACTOR_NAME,
      kind: "withdrawal_requested",
      metadata: {
        submittedAt: statement.submittedAt.toISOString(),
        statement: Object.fromEntries(statementLines(statement)),
      },
    });
  }

  const config = options.config === undefined ? emailConfig() : options.config;
  const failure = {
    ok: false as const,
    error: `Odstoupení se teď nepodařilo odeslat. Zkuste to prosím za chvíli znovu, nebo nám ho napište na ${OPERATOR.email} — platí stejně.`,
  };
  if (!config) return failure;
  const transport = options.transport ?? resendTransport(config.apiKey);
  const test = config.testRecipients !== null;
  const key = createHash("sha256")
    .update(`${statement.email}|${statement.contract}|${statement.submittedAt.toISOString()}`)
    .digest("hex")
    .slice(0, 40);

  // 1) potvrzení přijetí spotřebiteli — bez něj odstoupení „neprošlo“
  const customer = resolveRecipients([statement.email], config);
  const ack = withdrawalAcknowledgementEmail(statement, {
    baseUrl: options.baseUrl,
    withheld: customer.withheld,
    test,
    returnAddress: DELIVERY_ADDRESS.oneLine,
  });
  const sent = await transport(
    { from: config.from, to: customer.to, replyTo: config.replyTo, subject: ack.subject, html: ack.html, text: ack.text },
    `withdrawal-ack-${key}`
  );
  if (!sent.ok) {
    console.error("Odstoupení: potvrzení se nepodařilo odeslat", sent.error.slice(0, 200));
    return failure;
  }

  // 2) upozornění pro Beginu (interní adresy, jinak info@)
  const internal = resolveRecipients(config.internalTo.length > 0 ? config.internalTo : [OPERATOR.email], config);
  const notice = withdrawalInternalEmail(statement, {
    baseUrl: options.baseUrl,
    withheld: internal.withheld,
    test,
    orderUrl: orderId ? `${options.baseUrl}/rizeni-firmy/objednavky/${orderId}` : null,
  });
  const noticeSent = await transport(
    { from: config.from, to: internal.to, replyTo: statement.email, subject: notice.subject, html: notice.html, text: notice.text },
    `withdrawal-internal-${key}`
  );
  if (!noticeSent.ok) console.error("Odstoupení: upozornění pro Beginu se nepodařilo odeslat", noticeSent.error.slice(0, 200));

  return { ok: true, statement, orderFound: orderId !== null };
}
