CREATE TABLE "user_activations" (
	"user_id" text PRIMARY KEY NOT NULL,
	"invited_at" timestamp with time zone,
	"activated_at" timestamp with time zone
);
--> statement-breakpoint
-- Bezpečný backfill pro VŠECHNY dosavadní uživatele (Veronika, Lucie, Jiří
-- a kdokoli další, kdo už má organization_memberships řádek). Bez tohohle
-- kroku by po nasazení měli 0 řádků v user_activations, a nová stránka by
-- je ukázala jako "Nepozván" — zavádějící a nepravdivé, protože už dávno
-- mají fungující, aktivní účet.
--
-- Skutečný historický okamžik pozvání/aktivace se dnes nikde neeviduje
-- (appka to teprve od téhle migrace začíná zaznamenávat), takže ho nelze
-- zjistit přesně. Bezpečný kompatibilní stav = rovnou označit jako AKTIVNÍ
-- (activated_at vyplněné), protože všichni dosavadní uživatelé už reálně
-- mají heslo a přihlašují se — "Nepozván" by byl aktivně nesprávný stav,
-- "Pozván, čeká na aktivaci" by je nesprávně nabádalo znovu se aktivovat.
-- Jako datum invited_at/activated_at se použije nejstarší známý záznam o
-- daném uživateli v naší DB (MIN(created_at) z organization_memberships) —
-- není to skutečný historický okamžik aktivace (ten nemáme), jen bezpečná,
-- vždy-v-minulosti aproximace pro zobrazení; jediné, na čem UI stavu
-- doopravdy záleží, je že activated_at NENÍ NULL.
INSERT INTO "user_activations" ("user_id", "invited_at", "activated_at")
SELECT "user_id", MIN("created_at"), MIN("created_at")
FROM "organization_memberships"
GROUP BY "user_id"
ON CONFLICT ("user_id") DO NOTHING;
