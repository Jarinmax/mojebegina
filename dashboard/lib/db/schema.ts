// Datový model Fáze 2 (viz Security Phase 2 — návrh architektury).
// Zatím NEPOUŽITO — žádná stránka ani komponenta tento soubor neimportuje.
// Uživatelé/relace/session spravuje Neon Auth ve vlastních tabulkách mimo
// toto schéma; `userId` sloupce níže jsou text (odpovídá typu ID, které
// Better Auth/Neon Auth používá) bez DB-level cizího klíče, protože tabulku
// uživatelů nespravujeme my.

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  uniqueIndex,
  index,
  jsonb,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// Platformní role — odděleno od organizationMemberships.role (to je role
// UVNITŘ jedné organizace: owner/member). Tohle je role NAPŘÍČ celou
// appkou. Schváleno v Security Phase 2.2:
//   CUSTOMER  — zákazník, vidí jen svoje organizace (přes membership)
//   EMPLOYEE  — interní pracovník, zatím bez zvláštních oprávnění nad
//               rámec CUSTOMER (přesný rozsah "omezených oprávnění" se
//               teprve navrhne — do té doby bezpečný default = jako CUSTOMER)
//   EXECUTIVE — vedení Beginy, READ napříč všemi organizacemi, ne WRITE
//   ADMIN     — nejvyšší role, plný přístup (read i write) napříč vším
// Uživatel bez řádku v téhle tabulce se považuje za CUSTOMER (bezpečný
// default — nikdy neeskalovat mlčky).
//
// Security Phase 9 — jeden userId může mít VÍC řádků (víc rolí najednou,
// např. Jiří Střelec = CUSTOMER + EXECUTIVE na jednom Neon Auth účtu).
// Vlastní surrogate `id` PK + unique(userId, systemRole) místo PK přímo na
// userId — stejný vzor jako organizationMemberships (id + unique index),
// ne composite primary key. Nedestruktivní migrace: každý dosavadní
// uživatel má přesně jeden řádek, ten zůstává beze změny, jen přestává být
// sám o sobě primárním klíčem.
export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    systemRole: text("system_role").notNull(), // "CUSTOMER" | "EMPLOYEE" | "EXECUTIVE" | "ADMIN"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("user_roles_user_id_system_role_idx").on(table.userId, table.systemRole)]
);

// Security Phase 16 (Obchod/CRM 1.0) — `ownerUserId`/`acquiredByUserId`
// jsou dvě NEZÁVISLÉ informace, schválené explicitně jako oddělené pole:
//   ownerUserId       — kdo zákazníka TEĎ obchodně spravuje (měnitelné)
//   acquiredByUserId  — kdo ho PŮVODNĚ získal (nastaví se jednou, historie
//                       pro budoucí provizní systém, nikdy se nedomýšlí)
// Stejný pár polí je na `leads` níže — při konverzi leadu na organizaci se
// kopírují 1:1, jinak se nikdy netýkají jedno druhého. Obě nullable — dnešní
// zákazníci (założeni mimo CRM) je mají prázdné, dokud je někdo ručně
// nepřiřadí.
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  ico: text("ico").notNull().unique(),
  name: text("name").notNull(),
  registeredAddress: text("registered_address").notNull(),
  status: text("status"),
  ownerUserId: text("owner_user_id"),
  acquiredByUserId: text("acquired_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Řeší "1 login ≠ 1 zákazník": jeden User (spravovaný Neon Auth) může mít
// členství u víc organizací, jedna organizace může mít víc uživatelů.
export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    role: text("role").notNull(), // "owner" | "member"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("org_membership_user_org_idx").on(table.userId, table.organizationId)]
);

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  label: text("label").notNull(),
  street: text("street").notNull(),
  city: text("city").notNull(),
  zip: text("zip").notNull(),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  isDefaultDelivery: boolean("is_default_delivery").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Plátce (buyerOrganizationId) a příjemce (recipient* snapshot) jsou
// úmyslně oddělené — viz Security Phase 2, sekce 3 ("plátce vs. příjemce").
//
// Security Phase 15 (Objednávky 1.0) — `status` přejmenován na
// `payment_status` a přibyl nezávislý `fulfillment_status` (viz zadání:
// "Payment status a fulfillment status jsou nezávislé veličiny" — jedna
// objednávka může být doručená, ale nezaplacená, nebo zaplacená předem
// a ještě nepřipravená). "Po splatnosti" se úmyslně neukládá jako vlastní
// hodnota — počítá se za běhu z `payment_status = 'invoiced'` a faktury
// `due_at` v minulosti (stejný princip jako počítaná pole v companyNodes).
//
// Tři nezávislé role kolem "kdo objednal", schválené explicitně:
//   buyerOrganizationId — zákaznická organizace (kdo platí)
//   contactName/Phone/Email — člověk, který objednávku REÁLNĚ zadal
//     (telefon/e-mail/budoucí WooCommerce billing) — čistý snapshot,
//     nevyžaduje Neon Auth účet, stejný princip jako orderItems.name
//   enteredByUserId — interní MojeBegina uživatel, který objednávku
//     zapsal do systému (vždy skutečný Neon Auth účet u ručního zadání,
//     NULL u automatického importu)
//   placedByUserId — VYHRAZENO pro budoucnost: přihlášený zákaznický
//     účet, pokud/až vznikne objednávka přímo přes zákaznické
//     samoobslužné rozhraní. Dnes vždy NULL, nezaměňovat s contactName.
export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  buyerOrganizationId: uuid("buyer_organization_id")
    .notNull()
    .references(() => organizations.id),
  placedByUserId: text("placed_by_user_id"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  enteredByUserId: text("entered_by_user_id"),
  recipientLocationId: uuid("recipient_location_id").references(() => locations.id),
  recipientName: text("recipient_name"),
  recipientAddress: text("recipient_address"),
  recipientPhone: text("recipient_phone"),
  subtotalKc: integer("subtotal_kc").notNull(),
  shippingKc: integer("shipping_kc").notNull().default(0),
  totalKc: integer("total_kc").notNull(),
  // "unpaid" | "invoiced" | "paid" — viz komentář výše (Security Phase 15)
  paymentStatus: text("payment_status").notNull(),
  // "new" | "confirmed" | "preparing" | "ready" | "out_for_delivery" |
  // "delivered" | "cancelled" — nezávislé na paymentStatus
  fulfillmentStatus: text("fulfillment_status").notNull().default("new"),
  plannedDeliveryAt: timestamp("planned_delivery_at", { withTimezone: true }),
  responsibleUserId: text("responsible_user_id"),
  note: text("note"),
  externalWooCommerceId: text("external_woocommerce_id"),
  orderedAt: timestamp("ordered_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  name: text("name").notNull(), // snapshot, ne odkaz na živý katalog
  quantity: integer("quantity").notNull(),
  unitPriceKc: integer("unit_price_kc").notNull(),
  lineTotalKc: integer("line_total_kc").notNull(),
});

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => orders.id),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  invoiceNumber: text("invoice_number").notNull(),
  externalEdokladId: text("external_edoklad_id"),
  status: text("status").notNull(), // odráží stav v eDokladu
  totalKc: integer("total_kc").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// MVP: notifikace patří konkrétnímu uživateli (ne sdílené "read" napříč
// členy organizace — viz Security Phase 2, sekce 3).
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  href: text("href"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Vázáno na organizaci, ne na osobu — pravidla odměn zatím nejsou hotová
// (viz mock/referral.ts).
export const referrals = pgTable("referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  referrerOrganizationId: uuid("referrer_organization_id")
    .notNull()
    .references(() => organizations.id),
  referredOrganizationId: uuid("referred_organization_id").references(() => organizations.id),
  inviteEmail: text("invite_email").notNull(),
  code: text("code").notNull(),
  status: text("status").notNull(), // "invited" | "joined" | "purchased"
  rewardStatus: text("reward_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  firstPurchaseAt: timestamp("first_purchase_at", { withTimezone: true }),
});

// Security Phase 11 (oddělení založení zákazníka od pozvání) — pozvání a
// aktivace hesla jsou vlastnost Neon Auth UŽIVATELE, ne konkrétního
// organizationMemberships řádku: jeden Auth uživatel může být členem víc
// organizací, ale heslo/aktivaci má jen jednu. Proto samostatná tabulka
// klíčovaná userId (PK), ne sloupec na organizationMemberships.
//
// Řádek se vkládá VŽDY atomicky spolu se založením Neon Auth uživatele
// (createCustomerOrganization, addOrganizationMember) — nikdy se nespoléhá
// na "chybí řádek = výchozí stav" (to je přesně bug, co jsme řešili ve Fázi
// 9 u user_roles: tichá ztráta CUSTOMER přístupu, když řádek najednou
// existoval s jiným obsahem, než default předpokládal). Stav:
//   invitedAt IS NULL                    → Nepozván
//   invitedAt SET, activatedAt IS NULL   → Pozván, čeká na aktivaci
//   activatedAt SET                      → Aktivní
// `activatedAt` se nastavuje výhradně z lib/data/authContext.ts při první
// ověřené session daného uživatele PO nastavení hesla — nikdy z klientského
// volání a nikdy čtením interních neon_auth tabulek (viz diskuse v Security
// Phase 11: auth.admin.getUser přesně tohle připomíná, nespoléhat na
// nezdokumentované vnitřní API/tabulky Neon Auth).
export const userActivations = pgTable("user_activations", {
  userId: text("user_id").primaryKey(),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
});

// Security Phase 14 — lokální aplikační profil identity, 1:1 na Neon Auth
// user_id. Neon Auth zůstává jedinou autoritou pro AUTENTIZACI (heslo,
// session, přihlášení) — tahle tabulka je čistě náš vlastní ADRESÁŘ
// (jméno/e-mail pro zobrazení a pro odeslání pozvánky), protože
// `auth.admin.listUsers({filterField: "id"})` se ukázal jako nespolehlivý
// (tiše vrací prázdný výsledek pro existující uživatele, viz Security
// Phase 14 diagnostika) — `filterField: "email"` funguje spolehlivě a dál
// se používá při zakládání/přidávání členů. Nikdy se nepoužívá pro
// autorizaci ani k odvození role — jen k zobrazení/kontaktu.
export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id").primaryKey(),
  name: text("name"),
  email: text("email").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Security Phase 10 (Řízení firmy 1.0) — první živá (zapisovatelná) data
// v /rizeni-firmy, vedle statického obsahu v lib/content/companyOverview.ts.
// Prostý append-only log, žádné vazby na jiné tabulky zatím (úkoly,
// priority apod. přijdou v dalších malých fázích). `authorName` je
// snapshot ze session V OKAMŽIKU ZÁPISU (ne živý dotaz do Neon Auth) —
// zjednodušuje čtení (žádné auth.admin.listUsers volání jen kvůli výpisu
// zápisů) a je to i historicky správné: ukazuje, jak se autor jmenoval
// tehdy, ne jak se jmenuje teď.
export const companyNotes = pgTable("company_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  authorUserId: text("author_user_id").notNull(),
  authorName: text("author_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Security Phase 12 (Řízení firmy 2.0) — živá mapa firmy. Jeden rekurzivní
// strom (Oblast → Podoblast → Téma, MVP UI omezuje na 3 úrovně, ale model je
// obecný), ne samostatné tabulky pro každou úroveň — viz schválená
// specifikace: stejná mechanika (název/stav/vlastník/diskuze) platí na každé
// úrovni stejně, jen "listovost" se liší.
//
// status/statusMode/statusReason/statusDriverNodeId: stav se u uzlů s dětmi
// POČÍTÁ a UKLÁDÁ (ne jen virtuálně při čtení) — přepočet běží
// v lib/data/companyNodes.ts (propagateStatusChange) při každé změně, která
// ho může ovlivnit, a zastaví se na prvním předkovi v "manual" režimu.
// U listu (bez dětí) zůstává v "auto" módu, dokud ho někdo poprvé ručně
// nenastaví (updateNodeStatus) — computeAutoStatus([]) = "green", takže
// nový list bez zásahu ukazuje "pod kontrolou", ne že by vyžadoval
// speciální výchozí stav.
//
// ownerUserId: VÝHRADNĚ skutečný Neon Auth uživatel, žádný volný text pro
// jméno (schváleno explicitně — žádné paralelní identity vedle skutečných
// Auth účtů; pokud odpovědná osoba účet nemá, uzel zůstává bez vlastníka).
// Přiřazení nikdy nemění status — jsou to dvě nezávislé informace.
export const companyNodes = pgTable(
  "company_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id").references((): AnyPgColumn => companyNodes.id),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull(), // "green" | "amber" | "red"
    statusMode: text("status_mode").notNull().default("auto"), // "auto" | "manual"
    statusReason: text("status_reason"),
    statusDriverNodeId: uuid("status_driver_node_id").references(
      (): AnyPgColumn => companyNodes.id
    ),
    priority: text("priority").notNull().default("medium"), // "low" | "medium" | "high" | "critical"
    ownerUserId: text("owner_user_id"),
    position: integer("position").notNull().default(0),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }), // soft-delete, nikdy hard delete
  },
  (table) => [index("company_nodes_parent_id_idx").on(table.parentId, table.position)]
);

// Jeden sdílený timeline na uzel — komentáře i systémové události
// (vytvoření, změna stavu, nabídnutí k převzetí, přiřazení vlastníka) ve
// stejném chronologickém proudu, aby šlo za půl roku otevřít téma a
// pochopit, kdo co navrhl, kdo to převzal a jak se to vyřešilo.
// `authorName` je snapshot v okamžiku zápisu, stejný princip jako
// companyNotes.authorName výše. `metadata` nese strukturovaná data
// systémových událostí (např. status_changed: {from, to}), aby se
// timeline dal vykreslit bez dohledávání aktuálního stavu jinde.
export const companyNodeActivity = pgTable(
  "company_node_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => companyNodes.id),
    authorUserId: text("author_user_id").notNull(),
    authorName: text("author_name"),
    kind: text("kind").notNull(), // "comment" | "status_changed" | "owner_assigned" | "claim_offered" | "created"
    body: text("body"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("company_node_activity_node_id_idx").on(table.nodeId, table.createdAt)]
);

// Security Phase 15 (Objednávky 1.0) — auditní stopa objednávky, přesně
// stejný vzor jako company_node_activity výše: jeden sdílený chronologický
// timeline pro poznámky i systémové události (vytvoření, změna
// fulfillment/payment stavu, přiřazení odpovědné osoby), authorName jako
// snapshot v okamžiku zápisu.
export const orderActivity = pgTable(
  "order_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    authorUserId: text("author_user_id").notNull(),
    authorName: text("author_name"),
    kind: text("kind").notNull(), // "created" | "fulfillment_status_changed" | "payment_status_changed" | "responsible_assigned" | "note_added"
    body: text("body"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("order_activity_order_id_idx").on(table.orderId, table.createdAt)]
);

// Security Phase 16 (Obchod/CRM 1.0) — leady jsou ZÁMĚRNĚ samostatná
// entita, NE `organizations` řádek: `organizations.ico` je NOT NULL UNIQUE
// a `registeredAddress` je NOT NULL, ale drtivá většina leadů (gastro
// kontakty před první objednávkou) tyhle údaje vůbec nemá. Lead se
// propojuje s `organizations` až v okamžiku skutečné konverze
// (convertedOrganizationId) — do té doby o sobě obě tabulky nevědí, žádná
// duplicita zákazníků ani objednávek.
//
// `ico` tady je NULLABLE a BEZ unique constraintu (na rozdíl od
// organizations.ico) — čistě pomocné párovací pole pro detekci duplicit
// při konverzi (silný signál, viz leads.ts), ne závazný identifikátor.
//
// ownerUserId/acquiredByUserId — stejný pár jako na organizations výše,
// stejná nezávislost: owner se mění kdykoliv (přeřazení leadu), acquiredBy
// se nastavuje jednou a jen když je akvizice prokazatelná (import 200
// kontaktů ho záměrně nechává NULL).
//
// Security Phase 16.1 — companyName je NULLABLE (změna z NOT NULL).
// Skutečná historická data (import ~222 kontaktů z Google Sheets) většinou
// neobsahují spolehlivý název firmy/provozovny — jen typ provozu, kontaktní
// osobu, telefon, e-mail a poznámky. Vynucovat companyName by znamenalo
// buď zahodit reálné leady, nebo do pole vymýšlet název, který tam není —
// obojí špatně. UI proto lead identifikuje podle priority companyName →
// contactName → e-mail/telefon (viz leadLabels.ts:leadDisplayName), a Jarda
// doplní skutečný název, jakmile ho při hovoru zjistí.
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyName: text("company_name"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  city: text("city"),
  address: text("address"),
  venueType: text("venue_type"),
  ico: text("ico"),
  // "existing_database" | "bistro" | "eshop" | "akce" | "doporuceni" |
  // "inbound" | "vlastni_akvizice"
  source: text("source").notNull(),
  // "new" | "contacted" | "interested" | "sample_offer" | "negotiating" |
  // "converted" | "callback_later" | "not_interested"
  stage: text("stage").notNull().default("new"),
  ownerUserId: text("owner_user_id"),
  acquiredByUserId: text("acquired_by_user_id"),
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
  nextStepNote: text("next_step_note"),
  convertedOrganizationId: uuid("converted_organization_id").references(() => organizations.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Stejný vzor jako order_activity/company_node_activity — jeden sdílený
// chronologický timeline pro poznámky i systémové události, authorName
// jako snapshot v okamžiku zápisu.
export const leadActivity = pgTable(
  "lead_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    authorUserId: text("author_user_id").notNull(),
    authorName: text("author_name"),
    // "created" | "stage_changed" | "owner_assigned" | "acquired_by_set" |
    // "call_logged" | "note_added" | "converted" | "company_name_set" |
    // "follow_up_removed" (Security Phase 20)
    kind: text("kind").notNull(),
    body: text("body"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("lead_activity_lead_id_idx").on(table.leadId, table.createdAt)]
);

// Security Phase 17 (CEO přehled 1.0) — osobní pracovní prostor pro
// vedení firmy, ODDĚLENÝ od company_nodes ("Živá mapa firmy"). Stejná
// data by na company_nodes šla namodelovat technicky, ale ta tabulka je
// dnes viditelná všem ADMIN/EXECUTIVE (obecná firemní RAG mapa) — CEO
// přehled má vlastní, mnohem užší okruh čtenářů (viz ceoFocusAuth.ts) a
// jiný účel (osobní fokus, ne firemní zdraví oblastí). Proto samostatná
// doména, i když vzor (status/priorita/owner/activity log) je záměrně
// stejný jako u company_nodes — ne kopie kódu, ale kopie ověřeného vzoru.
//
// Plochý seznam (žádný strom, na rozdíl od company_nodes) — CEO přehled
// je záměrně jen "pár hlavních projektů", ne organizační hierarchie.
export const focusProjects = pgTable("focus_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  priority: text("priority").notNull().default("medium"), // "low" | "medium" | "high" | "critical"
  status: text("status").notNull().default("green"), // "green" | "amber" | "red"
  statusReason: text("status_reason"),
  description: text("description"), // "Na čem se právě pracuje"
  nextStep: text("next_step"),
  ownerUserId: text("owner_user_id"), // "Kdo je na tahu"
  // Nejvýše jeden řádek smí mít true zároveň — hlídáno v datové vrstvě
  // (setActiveFocusProject), ne DB constraintem (partial unique index by
  // šel, ale pro V1.0 stačí aplikační invariant, stejná úroveň jistoty
  // jako jinde v CRM).
  isActiveNow: boolean("is_active_now").notNull().default(false),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Security Phase 19 (Denní volání 1.0) — jedna plochá průběžná fronta,
// ZÁMĚRNĚ ne "jeden seznam na den" (viz diskuse v návrhu): nedokončené
// položky musí přežít do dalšího dne beze změny identity, jen zůstávají
// `status = 'pending'`. `position` řadí VŠECHNY pending položky (draft
// i zveřejněné) v jedné sekvenci — přeřazení musí jít přes dočasný rozsah
// pozic (viz dailyCalls.ts:applyQueueReorder), protože unikátní index níže
// je partial (WHERE status='pending') a Postgres partial unique index
// nejde deklarovat jako DEFERRABLE, takže se kontroluje ihned po každém
// jednotlivém UPDATE v rámci transakce, ne až na COMMIT.
//
// published_at/published_by: NULL = draft, viditelný jen kurátorovi.
// Automatické i ruční položky ZAČÍNAJÍ jako draft (schváleno explicitně) —
// viditelnost pro pracovníka řídí výhradně kurátorovo "Zveřejnit návrh".
// Auditní trojice (published_by/done_by/removed_by) + CHECK páry níže
// vynucují, že se časové razítko a aktér vždy zapisují společně a že
// odpovídají stavu položky — schváleno explicitně, aby žádný zápis nemohl
// mít "osiřelé" razítko bez aktéra nebo naopak.
export const dailyCallQueue = pgTable(
  "daily_call_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    position: integer("position").notNull(),
    status: text("status").notNull().default("pending"), // "pending" | "done" | "removed"
    source: text("source").notNull(), // "auto" | "manual"
    addedBy: text("added_by").notNull(),
    // Pracovní den (Europe/Prague), pro který byla položka navržena/přidána
    // — čistě informační/řadicí údaj pro rozdělení "Nedokončeno z minula"
    // vs. "Dnešní volání" na straně pracovníka, NENÍ identifikátor seznamu.
    // Skutečný DB typ `date` (schváleno explicitně) — mode: "string" jen
    // určuje, jak Drizzle hodnotu mapuje v JS (string "YYYY-MM-DD", ne
    // Date objekt), ne typ sloupce v Postgresu. Původní `text` byl omyl,
    // bez technického důvodu (opraveno na základě revize).
    addedForDate: date("added_for_date", { mode: "string" }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: text("published_by"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneBy: text("done_by"),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedBy: text("removed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("daily_call_queue_status_position_idx").on(table.status, table.position),
    uniqueIndex("daily_call_queue_lead_pending_idx")
      .on(table.leadId)
      .where(sql`${table.status} = 'pending'`),
    uniqueIndex("daily_call_queue_position_pending_idx")
      .on(table.position)
      .where(sql`${table.status} = 'pending'`),
    check("daily_call_queue_status_check", sql`${table.status} IN ('pending','done','removed')`),
    check("daily_call_queue_source_check", sql`${table.source} IN ('auto','manual')`),
    check(
      "daily_call_queue_published_pair_check",
      sql`(${table.publishedAt} IS NULL) = (${table.publishedBy} IS NULL)`
    ),
    check("daily_call_queue_done_pair_check", sql`(${table.doneAt} IS NULL) = (${table.doneBy} IS NULL)`),
    check(
      "daily_call_queue_removed_pair_check",
      sql`(${table.removedAt} IS NULL) = (${table.removedBy} IS NULL)`
    ),
    check("daily_call_queue_done_status_check", sql`(${table.status} = 'done') = (${table.doneAt} IS NOT NULL)`),
    check(
      "daily_call_queue_removed_status_check",
      sql`(${table.status} = 'removed') = (${table.removedAt} IS NOT NULL)`
    ),
    check(
      "daily_call_queue_done_implies_published_check",
      sql`${table.status} <> 'done' OR ${table.publishedAt} IS NOT NULL`
    ),
  ]
);

// Security Phase 20 (Google Kalendář 1.0) — propojení Blahoutova Google
// účtu s appkou, schváleno výhradně pro Blahouta samotného (nikdy Viner
// jménem Blahouta — gate v googleCalendarAuth.ts kontroluje konkrétní
// userId, ne jen roli, stejný princip jako dailyCallsAuth.ts).
// `googleCalendarId` je sekundární kalendář "MojeBegina – volání",
// založený appkou při prvním propojení (scope `calendar.app.created` —
// appka smí spravovat jen kalendáře, které sama vytvořila, nikdy
// Blahoutův osobní primární kalendář).
// `refreshTokenEncrypted` je base64 (IV + ciphertext + auth tag z
// AES-256-GCM, klíč jen ve Vercel env, nikdy v DB) — text sloupec, ne
// bytea, kvůli jednoduššímu a spolehlivějšímu zacházení přes
// @neondatabase/serverless (stejný princip jako jsonb.metadata jinde v
// schématu — binární data se v týhle appce nikdy neukládají přímo).
// UNIQUE(userId), ne primární klíč na userId — opětovné propojení po
// odpojení musí jít přes UPDATE existujícího řádku (ON CONFLICT), ne
// založení druhého řádku pro stejného uživatele.
export const googleCalendarConnections = pgTable("google_calendar_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  googleAccountEmail: text("google_account_email").notNull(),
  googleCalendarId: text("google_calendar_id").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  grantedScopes: text("granted_scopes").notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

// Security Phase 20 — 1:1 na leads (jeden lead má nejvýš jednu "aktivní"
// připomínku dalšího kontaktu, tedy nejvýš jednu kalendářovou událost).
// `syncedNextFollowUpAt`/`googleEventId` odrážejí stav, který NAPOSLEDY
// úspěšně odpovídal Google kalendáři — "reconcile" mechanismus
// (googleCalendar.ts:reconcileLeadCalendarEvent) porovnává tohle se
// skutečným (efektivním) stavem leadu a podle rozdílu rozhoduje
// create/update/delete/noop. `googleEventId` je DETERMINISTICKY odvozené
// z leadId (ne přidělené Googlem) — řeší pád mezi vytvořením v Googlu a
// zápisem sem (viz komentář u buildGoogleEventId v
// googleCalendarValidation.ts).
export const leadCalendarSync = pgTable("lead_calendar_sync", {
  leadId: uuid("lead_id")
    .primaryKey()
    .references(() => leads.id),
  googleEventId: text("google_event_id"),
  syncedNextFollowUpAt: timestamp("synced_next_follow_up_at", { withTimezone: true }),
  syncStatus: text("sync_status").notNull().default("pending"), // "pending" | "synced" | "failed"
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
},
(table) => [
  check("lead_calendar_sync_status_check", sql`${table.syncStatus} IN ('pending','synced','failed')`),
]);

// Stejný vzor jako company_node_activity/lead_activity — jeden sdílený
// timeline pro poznámky i systémové události, authorName jako snapshot.
export const focusProjectActivity = pgTable(
  "focus_project_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => focusProjects.id),
    authorUserId: text("author_user_id").notNull(),
    authorName: text("author_name"),
    // "created" | "updated" (kombinovaný zápis — stav/priorita/popis/další
    // krok/poznámka, stejný princip jako "call_logged" v CRM) |
    // "owner_assigned" | "activated"
    kind: text("kind").notNull(),
    body: text("body"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("focus_project_activity_project_id_idx").on(table.projectId, table.createdAt)]
);
