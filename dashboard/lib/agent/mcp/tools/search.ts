// GPT/MCP pilot — jedno hledání napříč MojeBegina (leady, zákazníci,
// objednávky, produkty, témata Živé mapy, CEO projekty). search_crm zůstává
// jako kompatibilní nástroj jen pro CRM.
import "server-only";
import { searchCrm } from "@/lib/data/leads";
import { SEARCH_DOMAIN_LIMIT, searchCompanyNodes, searchFocusProjects, searchOrders, searchProducts } from "@/lib/data/agentSearch";
import { formatPragueDateTime } from "@/lib/data/callActivityValidation";
import { stageLabel } from "@/lib/data/agentLeadsValidation";
import { ArgError, optionalEnumArray, requiredString } from "../args";
import { customerUrl, defineTool, leadUrl, taskUrl, type AgentTool } from "../define";
import { section, sourceFor, type Section } from "./shared";

const DOMAINS = ["leads", "customers", "orders", "products", "company_tasks", "ceo_projects"] as const;

function limited<T>(s: Section<T[]>, limit: number): Section<T[]> & { more?: boolean } {
  return s.available ? { available: true, data: s.data.slice(0, limit), more: s.data.length > limit } : s;
}

export const SEARCH_TOOLS: AgentTool[] = [
  defineTool({
    name: "search_mojebegina",
    title: "Hledat v MojeBegina",
    description:
      "Najde leady a zákazníky (název, kontakt, telefon, e-mail, město, IČO), objednávky (číslo, variabilní symbol, kontakt, zákazník), produkty (název, SKU), " +
      "témata Živé mapy firmy a CEO projekty. Vrací id pro detailní nástroje. Část s available=false je nedostupná (oprávnění), ne prázdná.",
    write: false,
    properties: {
      query: { type: "string", description: "Hledaný text (aspoň 2 znaky)." },
      domains: { type: "array", items: { type: "string", enum: [...DOMAINS] }, description: "Jen tyto oblasti (výchozí všechny)." },
    },
    required: ["query"],
    parse: (args) => {
      const query = requiredString(args, "query", 100);
      if (query.length < 2) throw new ArgError("Hledaný text musí mít aspoň 2 znaky.");
      return { query, domains: optionalEnumArray(args, "domains", DOMAINS) ?? [...DOMAINS] };
    },
    execute: async ({ query, domains }, issuer) => {
      const want = (d: (typeof DOMAINS)[number]) => domains.includes(d);
      const skipped = { available: false as const, reason: "neprohledáváno (není v domains)" };
      const [crm, orders, productsFound, tasks, projects] = await Promise.all([
        want("leads") || want("customers") ? section("crm", () => searchCrm(query)) : Promise.resolve(skipped),
        want("orders") ? section("orders", () => searchOrders(query)) : Promise.resolve(skipped),
        want("products") ? section("products", () => searchProducts(query)) : Promise.resolve(skipped),
        want("company_tasks") ? section("company", () => searchCompanyNodes(query)) : Promise.resolve(skipped),
        want("ceo_projects") ? section("focus", () => searchFocusProjects(query)) : Promise.resolve(skipped),
      ]);

      const leads: Section<unknown[]> = !want("leads")
        ? skipped
        : crm.available
          ? {
              available: true,
              data: crm.data.leads.map((lead) => ({
                id: lead.id,
                name: lead.displayName,
                contactName: lead.contactName,
                phone: lead.contactPhone,
                email: lead.contactEmail,
                city: lead.city,
                ico: lead.ico,
                stageLabel: stageLabel(lead.stage),
                owner: lead.ownerName,
                url: leadUrl(issuer, lead.id),
              })),
            }
          : crm;
      const customers: Section<unknown[]> = !want("customers")
        ? skipped
        : crm.available
          ? { available: true, data: crm.data.customers.map((c) => ({ ...c, url: customerUrl(issuer, c.id) })) }
          : crm;

      const result = {
        leads,
        customers,
        orders: limited(
          orders.available
            ? {
                available: true,
                data: orders.data.map((o) => ({
                  id: o.id,
                  orderNumber: o.orderNumber,
                  orderedAtPrague: formatPragueDateTime(o.orderedAt),
                  totalKc: o.totalKc,
                  paymentStatus: o.paymentStatus,
                  fulfillmentStatus: o.fulfillmentStatus,
                  channel: o.channel,
                  customer: o.customerName ?? o.contactName,
                })),
              }
            : orders,
          SEARCH_DOMAIN_LIMIT
        ),
        products: limited(productsFound, SEARCH_DOMAIN_LIMIT),
        companyTasks: limited(
          tasks.available ? { available: true, data: tasks.data.map((t) => ({ ...t, url: taskUrl(issuer, t.id) })) } : tasks,
          SEARCH_DOMAIN_LIMIT
        ),
        ceoProjects: limited(projects, SEARCH_DOMAIN_LIMIT),
      };
      const found = Object.values(result).reduce((sum, s) => sum + (s.available ? s.data.length : 0), 0);
      const more = Object.values(result).some((s) => "more" in s && s.more);

      return {
        ok: true,
        summary: { found, truncated: more },
        data: {
          ...result,
          source: await sourceFor(["crm", "orders", "company", "focus"], {
            complete: !more,
            warnings: more ? [`Některá oblast má víc než ${SEARCH_DOMAIN_LIMIT} shod (more=true) — zpřesněte hledání.`] : [],
          }),
        },
      };
    },
  }),
];
