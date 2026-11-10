-- GOOGLE KALENDÁŘ — migrace 0025: propojení Google účtu a stav synchronizace
-- Dalšího kontaktu. Stejné DDL jako drizzle/0025_phase_20_google_calendar.sql.
-- Jen dvě nové tabulky, nic existujícího se nemění — stávající kód s novým
-- schématem funguje dál. Spustit PŘED nasazením kódu.
-- Jeden blok = jedna transakce: pojistka nebo chyba → nic se nezmění.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public'
               AND table_name IN ('google_calendar_connections', 'lead_calendar_sync')) THEN
    RAISE EXCEPTION 'Tabulky Google Kalendáře už existují — migrace 0025 už proběhla, zastavuji.';
  END IF;
  CREATE TABLE "google_calendar_connections" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "google_account_email" text NOT NULL,
    "google_calendar_id" text NOT NULL,
    "refresh_token_encrypted" text NOT NULL,
    "granted_scopes" text NOT NULL,
    "connected_at" timestamp with time zone DEFAULT now() NOT NULL,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "google_calendar_connections_user_id_unique" UNIQUE("user_id")
  );
  CREATE TABLE "lead_calendar_sync" (
    "lead_id" uuid PRIMARY KEY NOT NULL,
    "google_event_id" text,
    "synced_next_follow_up_at" timestamp with time zone,
    "sync_status" text DEFAULT 'pending' NOT NULL,
    "last_error" text,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "lead_calendar_sync_status_check" CHECK ("lead_calendar_sync"."sync_status" IN ('pending','synced','failed'))
  );
  ALTER TABLE "lead_calendar_sync" ADD CONSTRAINT "lead_calendar_sync_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;
  RAISE NOTICE 'Migrace 0025: tabulky google_calendar_connections a lead_calendar_sync založeny.';
END $$;
