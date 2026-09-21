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
