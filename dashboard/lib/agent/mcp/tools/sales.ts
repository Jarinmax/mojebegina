// GPT/MCP pilot — aktivita obchodníka v zaznamenaných hovorech za den nebo
// období (pravidla v lib/data/callActivityValidation.ts).
import "server-only";
import { getSalespersonCallActivity } from "@/lib/data/callActivity";
import { CALL_WARNING_LABELS, CONTACT_TYPE_LABELS, MAX_CALL_ACTIVITY_DAYS } from "@/lib/data/callActivityValidation";
import { optionalString, requiredString } from "../args";
import { defineTool, leadUrl, type AgentTool } from "../define";
import { DATE_DESCRIPTION, sourceFor } from "./shared";

export const SALES_TOOLS: AgentTool[] = [
  defineTool({
    name: "get_salesperson_activity",
    title: "Zaznamenané hovory obchodníka",
    description:
      `Zaznamenané hovory obchodníka za den nebo období (kalendářní dny v Europe/Prague, včetně obou krajních dnů, nejvýš ${MAX_CALL_ACTIVITY_DAYS} dní): ` +
      "počet zaznamenaných hovorů, unikátních leadů a leadů kontaktovaných poprvé, seznam leadů a u každého hovoru čas, výsledek, poznámku a termín dalšího kontaktu, " +
      "rozlišení prvního a opakovaného hovoru a upozornění na neúplný zápis. Systém zná jen ZAZNAMENANÉ hovory — nezapsaný telefonát v datech není. " +
      "U importovaných leadů je první hovor jen „první evidovaný hovor v MojeBegina“. Poznámky ani změny fáze se jako hovor nepočítají.",
    write: false,
    properties: {
      salesperson: { type: "string", description: "Jméno nebo e-mail obchodníka, např. „Jaroslav Blahout“ nebo jen „Blahout“." },
      date_from: { type: "string", description: `První den ${DATE_DESCRIPTION}` },
      date_to: { type: "string", description: `Poslední den (včetně) ${DATE_DESCRIPTION} Když chybí, jen date_from.` },
    },
    required: ["salesperson", "date_from"],
    parse: (args) => ({
      salesperson: requiredString(args, "salesperson", 100),
      dateFrom: requiredString(args, "date_from", 10),
      dateTo: optionalString(args, "date_to", 10),
    }),
    execute: async (input, issuer) => {
      const result = await getSalespersonCallActivity(input);
      if (!result.ok) {
        const names = result.candidates?.map((c) => c.name ?? c.email);
        return { ok: false, error: names?.length ? `${result.error} Možnosti: ${names.join(", ")}.` : result.error };
      }
      const { value } = result;
      const warnings: string[] = [];
      if (value.totals.recordedCalls === 0) {
        warnings.push("V období není žádný zaznamenaný hovor tohoto obchodníka (nula zaznamenaných, nezapsané hovory systém nezná).");
      }
      if (value.detailsTruncated) {
        warnings.push("Detail hovorů je zkrácený — počty v totals jsou úplné; pro detail zužte období.");
      }
      return {
        ok: true,
        summary: { recordedCalls: value.totals.recordedCalls, uniqueLeads: value.totals.uniqueLeads, truncated: value.detailsTruncated },
        data: {
          salesperson: value.salesperson.name ?? value.salesperson.email,
          period: value.period,
          totals: value.totals,
          leads: value.leads.map((lead) => ({
            ...lead,
            contactTypeLabel: CONTACT_TYPE_LABELS[lead.contactType],
            url: leadUrl(issuer, lead.leadId),
            calls: lead.calls.map((call) => ({
              ...call,
              repeatCall: call.contactType === "repeat",
              warnings: call.warnings.map((w) => CALL_WARNING_LABELS[w]),
            })),
          })),
          incompleteRecords: value.incompleteRecords,
          source: await sourceFor(["crm"], {
            period: { dateFrom: value.period.dateFrom, dateTo: value.period.dateTo, timeZone: "Europe/Prague" },
            complete: !value.detailsTruncated,
            warnings,
          }),
        },
      };
    },
  }),
];
