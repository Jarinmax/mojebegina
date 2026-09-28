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
  uniqueIndex,
  index,
  bigint,
  jsonb,
  numeric,
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
  // ESHOP 1.0, krok 7 (migrace 0017): NULL = soukromý zákazník z e-shopu
  // (bez IČO — žádné falešné organizace). Ruční objednávka organizaci mít
  // musí dál a objednávka bez organizace musí mít e-mail (CHECKy níže).
  buyerOrganizationId: uuid("buyer_organization_id").references(() => organizations.id),
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
  // ESHOP 1.0, krok 4 (migrace 0014). Defaulty zachovávají chování
  // createOrder: ruční objednávka = channel "manual", sleva 0.
  channel: text("channel").notNull().default("manual"), // "manual" | "eshop" | "import"
  customerNote: text("customer_note"), // od zákazníka; `note` výše je interní
  shippingMethodCode: text("shipping_method_code"),
  shippingMethodLabel: text("shipping_method_label"), // snapshot názvu
  paymentMethodCode: text("payment_method_code"),
  paymentMethodLabel: text("payment_method_label"), // snapshot názvu
  // Sleva na zboží. Partnerský obrat = subtotal − discount (bez dopravy).
  discountKc: integer("discount_kc").notNull().default(0),
  ageConfirmedAt: timestamp("age_confirmed_at", { withTimezone: true }), // doklad potvrzení 18+
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }), // souhlas s OP
  // ESHOP 1.0, krok 6a (migrace 0016) — číslo objednávky, které vidí
  // zákazník. ZATÍM SE NEČÍSLUJE: sloupec je bez řady (NULL u všech
  // objednávek). Řada `order_number_seq` navazující na WooCommerce (MAX + 1)
  // se zapne až v den přepnutí pokladny (krok 6b). Není to číslo faktury.
  orderNumber: bigint("order_number", { mode: "number" }),
}, (table) => [
  uniqueIndex("orders_order_number_key").on(table.orderNumber),
  check("orders_channel_check", sql`${table.channel} IN ('manual', 'eshop', 'import')`),
  check("orders_discount_nonnegative", sql`${table.discountKc} >= 0`),
  check(
    "orders_total_consistent",
    sql`${table.totalKc} = ${table.subtotalKc} - ${table.discountKc} + ${table.shippingKc}`
  ),
  check(
    "orders_manual_requires_org",
    sql`${table.channel} <> 'manual' OR ${table.buyerOrganizationId} IS NOT NULL`
  ),
  check(
    "orders_guest_requires_contact",
    sql`${table.buyerOrganizationId} IS NOT NULL OR ${table.contactEmail} IS NOT NULL`
  ),
]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  name: text("name").notNull(), // snapshot, ne odkaz na živý katalog
  quantity: integer("quantity").notNull(),
  unitPriceKc: integer("unit_price_kc").notNull(),
  lineTotalKc: integer("line_total_kc").notNull(),
  // ESHOP 1.0, krok 5 (migrace 0015). Závazná vazba je UUID balení, ne text
  // SKU; prodané balení nejde smazat (RESTRICT), jen deaktivovat. Ruční
  // objednávky (createOrder) dál ukládají NULL. Historie se zobrazuje ze
  // snapshotů (name, sku_snapshot, unit_price_kc), nikdy z živého katalogu.
  productVariantId: uuid("product_variant_id").references(() => productVariants.id, {
    onDelete: "restrict",
  }),
  skuSnapshot: text("sku_snapshot"),
}, (table) => [
  index("order_items_product_variant_idx").on(table.productVariantId),
  check("order_items_quantity_positive", sql`${table.quantity} > 0`),
  check(
    "order_items_line_total_consistent",
    sql`${table.lineTotalKc} = ${table.quantity} * ${table.unitPriceKc}`
  ),
  check(
    "order_items_variant_has_sku",
    sql`${table.productVariantId} IS NULL OR ${table.skuSnapshot} IS NOT NULL`
  ),
]);

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
//
// ESHOP 1.0, krok 3 (migrace 0013) — actor_type: záznam může zapsat
// i systém (objednávka z e-shopu) nebo zákazník, ne jen interní uživatel.
// Ti nemají Neon Auth účet → author_user_id NULL; žádné falešné ID
// "system" (stejné pravidlo jako u company_nodes.owner_user_id). Interní
// záznam (actor_type "user") musí autora mít dál — hlídá CHECK.
export const orderActivity = pgTable(
  "order_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    actorType: text("actor_type").notNull().default("user"), // "user" | "system" | "customer"
    authorUserId: text("author_user_id"),
    authorName: text("author_name"), // u systému např. "E-shop"
    kind: text("kind").notNull(), // "created" | "fulfillment_status_changed" | "payment_status_changed" | "responsible_assigned" | "note_added"
    body: text("body"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("order_activity_order_id_idx").on(table.orderId, table.createdAt),
    check("order_activity_actor_type_check", sql`${table.actorType} IN ('user', 'system', 'customer')`),
    check(
      "order_activity_user_has_author",
      sql`${table.actorType} <> 'user' OR ${table.authorUserId} IS NOT NULL`
    ),
  ]
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
    // "call_logged" | "note_added" | "converted" | "company_name_set"
    kind: text("kind").notNull(),
    body: text("body"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("lead_activity_lead_id_idx").on(table.leadId, table.createdAt)]
);

// ESHOP 1.0 — Produkty 1.0 (návrh schválen vedením 26. 9. 2026, viz
// ESHOP_SCHEMA_PROPOSAL.md). Jediný zdroj pravdy katalogu pro e-shop
// i MojeBegina; první naplnění z lib/eshop/catalog.ts (migrace 0012).
// Nic se nemaže: kategorie/produkty/balení mají is_active a FK z budoucích
// objednávek budou RESTRICT. Budoucí receptury, výroba a sklad budou
// ukazovat NA tyto tabulky, ne naopak.

const SLUG_FORMAT = "^[a-z0-9]+(-[a-z0-9]+)*$";

export const productCategories = pgTable(
  "product_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    intro: text("intro").array().notNull().default(sql`'{}'::text[]`),
    // [{title, paragraphs[], bullets[]}] — společné sekce detailu produktu
    detailSections: jsonb("detail_sections"),
    imageUrl: text("image_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("product_categories_slug_format", sql`${table.slug} ~ ${sql.raw(`'${SLUG_FORMAT}'`)}`)]
);

// Kódy alergenů podle přílohy II nařízení 1169/2011. allergens = NULL
// znamená "zatím neznámé" (e-shop ukáže "Doplníme"), '{}' = bez alergenů.
export const ALLERGEN_CODES = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soy",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => productCategories.id, { onDelete: "restrict" }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    shortDescription: text("short_description"),
    description: text("description").array().notNull().default(sql`'{}'::text[]`),
    highlights: text("highlights").array().notNull().default(sql`'{}'::text[]`),
    tasteDescription: text("taste_description"),
    ingredients: text("ingredients"),
    allergens: text("allergens").array(),
    allergenNote: text("allergen_note"),
    // {energy_kj, energy_kcal, fat, saturates, carbohydrate, sugars, protein, salt}
    nutrition: jsonb("nutrition"),
    nutritionBasis: text("nutrition_basis"), // "100g" | "100ml"
    storageInstructions: text("storage_instructions"),
    shelfLifeDays: integer("shelf_life_days"),
    shelfLifeNote: text("shelf_life_note"),
    alcoholPercent: numeric("alcohol_percent", { precision: 4, scale: 1, mode: "number" }),
    isAgeRestricted: boolean("is_age_restricted").notNull().default(false),
    warnings: text("warnings").array().notNull().default(sql`'{}'::text[]`),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("products_category_idx").on(table.categoryId, table.sortOrder),
    check("products_slug_format", sql`${table.slug} ~ ${sql.raw(`'${SLUG_FORMAT}'`)}`),
    check(
      "products_allergens_known",
      sql`${table.allergens} <@ ARRAY[${sql.raw(ALLERGEN_CODES.map((code) => `'${code}'`).join(", "))}]::text[]`
    ),
    check("products_nutrition_basis_check", sql`${table.nutritionBasis} IN ('100g', '100ml')`),
    check("products_shelf_life_positive", sql`${table.shelfLifeDays} > 0`),
    check("products_alcohol_range", sql`${table.alcoholPercent} BETWEEN 0 AND 100`),
    // Nad 0,5 % obj. je nápoj alkoholický → musí být 18+.
    check(
      "products_alcohol_requires_age_restriction",
      sql`${table.alcoholPercent} IS NULL OR ${table.alcoholPercent} <= 0.5 OR ${table.isAgeRestricted}`
    ),
  ]
);

// Jedno balení = jedno SKU = to, co je v košíku a (od kroku 5) v order_items.
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    sku: text("sku").notNull().unique(),
    label: text("label"), // NULL = balení zatím neznámé
    shortNote: text("short_note"),
    packageDescription: text("package_description"),
    volumeMl: integer("volume_ml"), // doprava na begina.cz se počítá podle objemu
    servings: integer("servings"),
    priceB2cKc: integer("price_b2c_kc").notNull(), // konečná cena, Begina není plátce DPH
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("product_variants_product_idx").on(table.productId, table.sortOrder),
    check("product_variants_sku_format", sql`${table.sku} ~ ${sql.raw(`'${SLUG_FORMAT}'`)}`),
    check("product_variants_volume_positive", sql`${table.volumeMl} > 0`),
    check("product_variants_servings_positive", sql`${table.servings} > 0`),
    check("product_variants_price_nonnegative", sql`${table.priceB2cKc} >= 0`),
  ]
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    url: text("url").notNull(),
    alt: text("alt"),
    sortOrder: integer("sort_order").notNull().default(0), // 0 = hlavní fotka
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("product_images_product_idx").on(table.productId, table.sortOrder)]
);
