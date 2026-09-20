-- Security Phase 9 — user_roles přestává mít PK přímo na user_id (jeden
-- uživatel teď může mít víc řádků = víc rolí najednou), stejný vzor jako
-- organization_memberships (surrogate id + unique index, ne composite PK).
-- Nedestruktivní: žádný řádek se neztrácí, jen se ruší staré omezení "max
-- jeden řádek na uživatele" a nahrazuje se novým "max jeden řádek na
-- (uživatel, role)". "user_roles_pkey" je defaultní jméno, které Postgres
-- dá nepojmenovanému sloupcovému PRIMARY KEY z migrace 0001 — ověřeno proti
-- CREATE TABLE v drizzle/0001_phase_2_2_user_roles.sql.
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_pkey";--> statement-breakpoint
ALTER TABLE "user_roles" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_id_system_role_idx" ON "user_roles" USING btree ("user_id","system_role");