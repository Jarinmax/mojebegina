// GPT/MCP pilot — čtecí nástroje nad leady: list_leads (filtry a předvolby,
// stránkování) a get_lead (detail + úplná historie po stránkách).
import "server-only";
import { getLeadDetail } from "@/lib/data/leads";
import { getLeadHistoryPage, isImportedLead, listLeadsForAgent } from "@/lib/data/agentLeads";
import { LEAD_STAGES } from "@/lib/data/leadValidation";
import {
  LEAD_ACTIVITY_LABELS,
  LEAD_PRESETS,
  LEAD_PRESET_LABELS,
  MAX_LIST_DAYS,
  activityTime,
  describeLeadActivity,
  leadState,
  stageLabel,
} from "@/lib/data/agentLeadsValidation";
import { formatPragueDate, formatPragueDateTime, pragueToday, shiftDate, validatePragueDateRange } from "@/lib/data/callActivityValidation";
import { optionalEnum, optionalEnumArray, optionalString, requiredUuid } from "../args";
import { defineTool, leadUrl, type AgentTool } from "../define";
import { PAGING_PROPERTIES, excerpt, pageInfo, parsePaging } from "../envelope";
import { DATE_DESCRIPTION, optionalRange, periodOf, resolveSalesperson, sourceFor } from "./shared";

const prague = (d: Date | null) => (d ? formatPragueDateTime(d) : null);
const NEXT_CONTACT_NOTE = "nextContactDate je plánovaný termín dalšího kontaktu (datum v Praze).";

export const LEAD_TOOLS: AgentTool[] = [
  defineTool({
    name: "list_leads",
    title: "Seznam leadů",
    description:
      "Leady s filtry: obchodník, fáze, datum vytvoření, posledního a dalšího kontaktu, a předvolby — " +
      Object.entries(LEAD_PRESET_LABELS)
        .map(([k, v]) => `${k} = ${v}`)
        .join("; ") +
      `. Datové filtry nejvýš ${MAX_LIST_DAYS} dní. Vrací i počet zaznamenaných hovorů každého leadu. Stránkuje se přes cursor (max. 50 na stránku); celkový počet je v totalMatching.`,
    write: false,
    properties: {
      owner: { type: "string", description: "Jméno nebo e-mail obchodníka; „nikdo“ = leady bez obchodníka." },
      stages: { type: "array", items: { type: "string", enum: [...LEAD_STAGES] }, description: "Jen tyto fáze." },
      preset: { type: "string", enum: [...LEAD_PRESETS], description: "Předvolba (viz popis nástroje)." },
      created_from: { type: "string", description: `Založen od ${DATE_DESCRIPTION}` },
      created_to: { type: "string", description: `Založen do (včetně) ${DATE_DESCRIPTION}` },
      last_contact_from: { type: "string", description: `Poslední kontakt od ${DATE_DESCRIPTION}` },
      last_contact_to: { type: "string", description: `Poslední kontakt do (včetně) ${DATE_DESCRIPTION}` },
      next_contact_from: { type: "string", description: `Termín dalšího kontaktu od ${DATE_DESCRIPTION}` },
      next_contact_to: { type: "string", description: `Termín dalšího kontaktu do (včetně) ${DATE_DESCRIPTION}` },
      assigned_from: { type: "string", description: `Jen pro preset new_assigned: přiděleno od (výchozí posledních 7 dní). ${DATE_DESCRIPTION}` },
      assigned_to: { type: "string", description: `Jen pro preset new_assigned: přiděleno do (včetně). ${DATE_DESCRIPTION}` },
      ...PAGING_PROPERTIES,
    },
    required: [],
    parse: (args) => {
      const filters = {
        owner: optionalString(args, "owner", 100),
        stages: optionalEnumArray(args, "stages", LEAD_STAGES),
        preset: optionalEnum(args, "preset", LEAD_PRESETS),
        created: optionalRange(args, "created_from", "created_to", MAX_LIST_DAYS),
        lastContact: optionalRange(args, "last_contact_from", "last_contact_to", MAX_LIST_DAYS),
        nextContact: optionalRange(args, "next_contact_from", "next_contact_to", MAX_LIST_DAYS),
        assigned: optionalRange(args, "assigned_from", "assigned_to", MAX_LIST_DAYS),
      };
      return { filters, paging: parsePaging(args, filters) };
    },
    execute: async ({ filters, paging }, issuer) => {
      const now = new Date();
      const today = pragueToday(now);

      let owner: string | null = null;
      let ownerName: string | null = null;
      if (filters.owner !== null) {
        if (["nikdo", "none", "bez obchodníka", "bez obchodnika"].includes(filters.owner.toLowerCase())) {
          owner = "none";
          ownerName = "bez obchodníka";
        } else {
          const resolved = await resolveSalesperson(filters.owner);
          if (!resolved.ok) return resolved;
          owner = resolved.person.userId;
          ownerName = resolved.person.name ?? resolved.person.email;
        }
      }

      let assigned = filters.assigned;
      if (filters.preset === "new_assigned" && assigned === null) {
        const range = validatePragueDateRange(shiftDate(today, -6), today, MAX_LIST_DAYS);
        if (range.ok) assigned = range.value;
      }

      const { total, rows } = await listLeadsForAgent(
        { ...filters, owner, assigned: filters.preset === "new_assigned" ? assigned : null, today },
        paging
      );
      const page = pageInfo(total, paging, rows.length);
      const periodRange = filters.created ?? filters.lastContact ?? filters.nextContact ?? (filters.preset === "new_assigned" ? assigned : null);

      return {
        ok: true,
        summary: { totalMatching: total, returned: rows.length, truncated: page.truncated },
        data: {
          filters: {
            owner: ownerName,
            stages: filters.stages,
            preset: filters.preset,
            presetMeaning: filters.preset ? LEAD_PRESET_LABELS[filters.preset] : null,
            created: periodOf(filters.created),
            lastContact: periodOf(filters.lastContact),
            nextContact: periodOf(filters.nextContact),
            assigned: filters.preset === "new_assigned" ? periodOf(assigned) : null,
            today,
          },
          totalMatching: total,
          leads: rows.map((lead) => ({
            id: lead.id,
            name: lead.name,
            companyName: lead.companyName,
            contactName: lead.contactName,
            phone: lead.contactPhone,
            email: lead.contactEmail,
            city: lead.city,
            venueType: lead.venueType,
            stage: lead.stage,
            stageLabel: stageLabel(lead.stage),
            owner: lead.ownerName,
            createdAtPrague: prague(lead.createdAt),
            lastContactedAtPrague: prague(lead.lastContactedAt),
            nextContactDate: lead.nextFollowUpAt ? formatPragueDate(lead.nextFollowUpAt) : null,
            nextStep: excerpt(lead.nextStepNote),
            state: leadState(lead, today),
            recordedCalls: lead.recordedCalls,
            lastRecordedCallAtPrague: prague(lead.lastRecordedCallAt),
            importedLead: lead.imported,
            url: leadUrl(issuer, lead.id),
          })),
          source: await sourceFor(["crm"], {
            period: periodOf(periodRange),
            page,
            warnings: [NEXT_CONTACT_NOTE],
          }),
        },
      };
    },
  }),
  defineTool({
    name: "get_lead",
    title: "Detail leadu",
    description:
      "Detail leadu a jeho ÚPLNÁ historie od nejnovějšího (zaznamenané hovory, poznámky, změny fáze, přiřazení, další kroky) po stránkách přes cursor. " +
      "Poznámka nebo naplánovaný krok v historii neznamená, že se akce (např. odeslání e-mailu) skutečně stala.",
    write: false,
    properties: { lead_id: { type: "string", description: "id leadu (UUID) ze search_mojebegina nebo list_leads." }, ...PAGING_PROPERTIES },
    required: ["lead_id"],
    parse: (args) => {
      const leadId = requiredUuid(args, "lead_id");
      return { leadId, paging: parsePaging(args, { leadId }) };
    },
    execute: async ({ leadId, paging }, issuer) => {
      const detail = await getLeadDetail(leadId);
      const history = await getLeadHistoryPage(leadId, paging);
      if (!detail || !history) return { ok: false, error: "Lead nebyl nalezen." };
      const { lead } = detail;
      const today = pragueToday(new Date());
      const imported = await isImportedLead(leadId);
      const page = pageInfo(history.total, paging, history.entries.length);

      const activity = history.entries.map((a) => ({
        id: a.id,
        kind: a.kind,
        kindLabel: LEAD_ACTIVITY_LABELS[a.kind] ?? a.kind,
        author: a.authorName,
        ...activityTime(a.createdAt),
        text: a.body,
        details: describeLeadActivity(a),
      }));

      return {
        ok: true,
        summary: { returned: activity.length, truncated: page.truncated },
        data: {
          lead: {
            id: lead.id,
            name: lead.displayName,
            companyName: lead.companyName,
            contactName: lead.contactName,
            phone: lead.contactPhone,
            email: lead.contactEmail,
            city: lead.city,
            address: lead.address,
            venueType: lead.venueType,
            ico: lead.ico,
            source: lead.source,
            stage: lead.stage,
            stageLabel: stageLabel(lead.stage),
            owner: lead.ownerName,
            acquiredBy: lead.acquiredByName,
            convertedCustomerId: lead.convertedOrganizationId,
            lastContactedAtPrague: prague(lead.lastContactedAt),
            nextContactDate: lead.nextFollowUpAt ? formatPragueDate(lead.nextFollowUpAt) : null,
            nextStep: lead.nextStepNote,
            state: leadState(lead, today),
            importedLead: imported,
            recordedCalls: history.recordedCalls,
            firstRecordedCallAtPrague: prague(history.firstRecordedCallAt),
            url: leadUrl(issuer, lead.id),
          },
          activity,
          activityTotal: history.total,
          source: await sourceFor(["crm"], {
            page,
            warnings: imported
              ? ["Lead vznikl importem z tabulky — starší kontakty z doby před MojeBegina v historii nejsou."]
              : [],
          }),
        },
      };
    },
  }),
];
