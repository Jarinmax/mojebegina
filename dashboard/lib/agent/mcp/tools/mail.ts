// E-MAIL Z INFO@ 1.0 (16. 11. 2026) — asistent pošle obyčejný e-mail ze
// společné schránky info@begina.cz (odpověď zákazníkovi apod.). Jen pro
// Jaroslava a Lucii (isInvoiceIssuer) a jen se souhlasem mojebegina.invoicing;
// info@begina.cz dostane vždy skrytou kopii, takže je e-mail vidět v poště.
// V testovacím režimu (Preview) odchází jen na testovací adresy.
import "server-only";
import { createHash } from "node:crypto";
import { getAuthContext } from "@/lib/data/authContext";
import { INVOICE_ISSUER_NAMES, isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { emailConfig, invoiceCopyRecipients, invoiceEmailSender, resolveRecipients } from "@/lib/eshop/email/config";
import {
  buildInfoMail,
  checkInfoMailAttachments,
  checkInfoMailRecipients,
  INFO_MAIL_SIGNERS,
  MAX_INFO_MAIL_ATTACHMENTS,
  MAX_INFO_MAIL_RECIPIENTS,
  type InfoMailSigner,
} from "@/lib/eshop/email/infoMail";
import { resendTransport } from "@/lib/eshop/email/resend";
import { ArgError, idempotencyKey, requiredString } from "../args";
import { defineTool, type AgentTool } from "../define";

const issuerOnly = (ctx: Parameters<typeof isInvoiceIssuer>[0]) => isInvoiceIssuer(ctx);

export const MAIL_TOOLS: AgentTool[] = [
  defineTool({
    name: "send_email_from_info",
    title: "Poslat e-mail z info@begina.cz",
    description:
      "ZÁPIS — odešle e-mail ze společné schránky info@begina.cz, např. odpověď zákazníkovi nebo dotaz dodavateli, volitelně s přílohami (attachments: fotky, PDF, dokumenty — nejvýš 10, dohromady 15 MB). NEVRATNÉ. " +
      "Nejdřív ukaž uživateli celý text, příjemce, předmět, podpis a názvy příloh; volej až po jeho výslovném „ano“ s confirm=true. " +
      "body je jen text zprávy od oslovení po poslední větu — pozdrav „S přátelským pozdravem“ a podpis doplní server podle signer " +
      "(lucie = Lucie Königsbergová, +420 604 168 146; jaroslav = Jaroslav Viner, +420 774 199 975; tym = tým Begina). " +
      `Nejvýš ${MAX_INFO_MAIL_RECIPIENTS} příjemců. info@begina.cz dostane vždy skrytou kopii a odpovědi chodí na info@begina.cz. ` +
      "Faktury posílej nástrojem send_idoklad_invoice_email, ne tímto.",
    write: true,
    writeScope: "invoicing",
    visible: issuerOnly,
    properties: {
      to: { type: "array", items: { type: "string" }, maxItems: MAX_INFO_MAIL_RECIPIENTS, description: "Příjemci (e-maily), které uživatel výslovně uvedl nebo potvrdil." },
      subject: { type: "string", description: "Předmět; u odpovědi „Re: původní předmět“." },
      body: { type: "string", description: "Text zprávy bez závěrečného pozdravu a podpisu; odstavce odděl prázdným řádkem." },
      signer: { type: "string", enum: Object.keys(INFO_MAIL_SIGNERS), description: "Kdo e-mail podepisuje: lucie, jaroslav nebo tym." },
      attachments: {
        type: "array",
        maxItems: MAX_INFO_MAIL_ATTACHMENTS,
        description: "Volitelné přílohy, které uživatel schválil.",
        items: {
          type: "object",
          properties: {
            filename: { type: "string", description: "Název souboru, např. faktura.pdf nebo foto.png." },
            mime_type: { type: "string", description: "Typ souboru, např. application/pdf, image/png, image/jpeg." },
            content_base64: { type: "string", format: "byte", description: "Obsah souboru v base64." },
          },
          required: ["filename", "mime_type", "content_base64"],
        },
      },
      confirm: { type: "boolean", description: "true = uživatel viděl celý e-mail a výslovně potvrdil odeslání." },
    },
    required: ["to", "subject", "body", "signer", "confirm"],
    parse: (args) => {
      const recipients = checkInfoMailRecipients(args.to);
      if (!recipients.ok) throw new ArgError(recipients.error);
      const signer = args.signer;
      if (typeof signer !== "string" || !(signer in INFO_MAIL_SIGNERS)) throw new ArgError("Argument signer musí být lucie, jaroslav nebo tym.");
      if (args.confirm !== true) throw new ArgError("E-mail lze odeslat jen s confirm=true po výslovném souhlasu uživatele s celým textem.");
      const subject = requiredString(args, "subject", 200);
      if (/[\r\n]/.test(subject)) throw new ArgError("Předmět musí být na jednom řádku.");
      const files = checkInfoMailAttachments(args.attachments);
      if (!files.ok) throw new ArgError(files.error);
      return {
        to: recipients.to,
        subject,
        body: requiredString(args, "body", 6000),
        signer: signer as InfoMailSigner,
        attachments: files.attachments,
        key: idempotencyKey(args),
      };
    },
    execute: async ({ to: wanted, subject, body, signer, attachments, key }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: `E-maily z info@begina.cz smí posílat jen ${INVOICE_ISSUER_NAMES}.` };
      const config = emailConfig();
      if (!config) return { ok: false, error: "Odesílání e-mailů z MojeBegina není na tomto prostředí zapnuté. Nic se neodeslalo." };
      const sender = invoiceEmailSender(config);
      const resolved = resolveRecipients(wanted, config);
      const test = config.testRecipients !== null;
      const testNote = test && resolved.withheld.length ? `[TEST] Určeno pro: ${resolved.withheld.join(", ")}` : "";
      const bcc = invoiceCopyRecipients(config, resolved.to);
      const mail = buildInfoMail(body, signer, testNote);
      const sent = await resendTransport(config.apiKey)(
        { from: sender.from, to: resolved.to, ...(bcc.length ? { bcc } : {}), replyTo: sender.replyTo, subject: `${test ? "[TEST] " : ""}${subject}`,
          ...mail,
          ...(attachments.length
            ? { attachments: attachments.map((a) => ({ filename: a.filename, contentBase64: a.contentBase64, contentType: a.contentType })) }
            : {}),
        },
        `info-mail-${createHash("sha256").update(`${ctx.userId}|${key}`).digest("hex").slice(0, 32)}`
      );
      if (!sent.ok) return { ok: false, error: `E-mail se nepodařilo odeslat: ${sent.error}` };
      return {
        ok: true,
        summary: { sent: true, recipients: resolved.to.length },
        data: {
          sent: true,
          from: sender.from,
          to: resolved.to,
          bcc,
          subject,
          signer: INFO_MAIL_SIGNERS[signer][0],
          attachments: attachments.map((a) => ({ filename: a.filename, bytes: a.bytes })),
          withheldInTestMode: resolved.withheld,
          messageId: sent.id,
          message: `E-mail „${subject}“ je odeslaný z ${sender.from} na ${resolved.to.join(", ")}${bcc.length ? ` (skrytá kopie ${bcc.join(", ")})` : ""}${attachments.length ? `, přílohy: ${attachments.map((a) => a.filename).join(", ")}` : ""}.`,
        },
      };
    },
  }),
];
