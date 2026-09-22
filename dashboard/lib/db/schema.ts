// Datový model Fáze 2 (viz Security Phase 2 — návrh architektury).
// Zatím NEPOUŽITO — žádná stránka ani komponenta tento soubor neimportuje.
// Uživatelé/relace/session spravuje Neon Auth ve vlastních tabulkách mimo
// toto schéma; `userId` sloupce níže jsou text (odpovídá typu ID, které
// Better Auth/Neon Auth používá) bez DB-level cizího klíče, protože tabulku
// uživatelů nespravujeme my.

import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  jsonb,
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

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  ico: text("ico").notNull().unique(),
  name: text("name").notNull(),
  registeredAddress: text("registered_address").notNull(),
  status: text("status"),
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
export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  buyerOrganizationId: uuid("buyer_organization_id")
    .notNull()
    .references(() => organizations.id),
  placedByUserId: text("placed_by_user_id"),
  recipientLocationId: uuid("recipient_location_id").references(() => locations.id),
  recipientName: text("recipient_name"),
  recipientAddress: text("recipient_address"),
  recipientPhone: text("recipient_phone"),
  subtotalKc: integer("subtotal_kc").notNull(),
  shippingKc: integer("shipping_kc").notNull().default(0),
  totalKc: integer("total_kc").notNull(),
  status: text("status").notNull(), // "pending" | "paid" | "cancelled"
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
