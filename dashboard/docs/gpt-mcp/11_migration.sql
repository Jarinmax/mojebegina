-- GPT/MCP PILOT: 4 nové tabulky (= drizzle 0022_gpt_mcp_pilot), nic
-- existujícího se nemění. Návrh 13. 10. 2026; spuštění NESCHVÁLENO.
-- Postup: GPT_MCP_PILOT.md. Kontrola před: 10_before.sql, po: 12_after.sql,
-- návrat: 19_rollback.sql.
--   organization_activity  poznámky u zákazníka (i z MojeBegina, nejen z ChatGPT)
--   agent_grants           udělené souhlasy pro ChatGPT (kdo, v jaké roli, rozsah)
--   agent_tokens           otisky OAuth kódů a tokenů (nikdy tokeny samotné)
--   agent_audit_log        každé volání nástroje asistentem
-- Sám o sobě nic nezapíná: přístup asistenta zapnou až proměnné MCP_* ve Vercelu.
-- Celý blok je jedna transakce: pojistka nebo chyba → nic se nezmění.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_name IN ('agent_grants', 'agent_tokens', 'agent_audit_log', 'organization_activity')) THEN
    RAISE EXCEPTION 'Některá z tabulek GPT/MCP pilotu už existuje (skript už běžel?) — zastavuji.';
  END IF;

  CREATE TABLE "agent_audit_log" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"grant_id" uuid NOT NULL,
  	"user_id" text NOT NULL,
  	"tool" text NOT NULL,
  	"is_write" boolean NOT NULL,
  	"idempotency_key" text,
  	"args_hash" text,
  	"args" jsonb,
  	"status" text NOT NULL,
  	"result" jsonb,
  	"error" text,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"finished_at" timestamp with time zone,
  	CONSTRAINT "agent_audit_log_status_check" CHECK ("agent_audit_log"."status" IN ('pending','ok','error','denied'))
  );

  CREATE TABLE "agent_grants" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"user_id" text NOT NULL,
  	"system_role" text NOT NULL,
  	"client_id" text NOT NULL,
  	"scope" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	"last_used_at" timestamp with time zone,
  	"revoked_at" timestamp with time zone,
  	"revoked_reason" text
  );

  CREATE TABLE "agent_tokens" (
  	"token_hash" text PRIMARY KEY NOT NULL,
  	"grant_id" uuid NOT NULL,
  	"kind" text NOT NULL,
  	"expires_at" timestamp with time zone NOT NULL,
  	"used_at" timestamp with time zone,
  	"redirect_uri" text,
  	"code_challenge" text,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	CONSTRAINT "agent_tokens_kind_check" CHECK ("agent_tokens"."kind" IN ('code','access','refresh')),
  	CONSTRAINT "agent_tokens_code_fields_check" CHECK ("agent_tokens"."kind" <> 'code' OR ("agent_tokens"."redirect_uri" IS NOT NULL AND "agent_tokens"."code_challenge" IS NOT NULL))
  );

  CREATE TABLE "organization_activity" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"organization_id" uuid NOT NULL,
  	"author_user_id" text NOT NULL,
  	"author_name" text,
  	"kind" text NOT NULL,
  	"body" text,
  	"metadata" jsonb,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "agent_audit_log" ADD CONSTRAINT "agent_audit_log_grant_id_agent_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."agent_grants"("id") ON DELETE no action ON UPDATE no action;

  ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_grant_id_agent_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."agent_grants"("id") ON DELETE no action ON UPDATE no action;

  ALTER TABLE "organization_activity" ADD CONSTRAINT "organization_activity_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;

  CREATE INDEX "agent_audit_log_grant_created_idx" ON "agent_audit_log" USING btree ("grant_id","created_at");

  CREATE UNIQUE INDEX "agent_audit_log_idempotency_idx" ON "agent_audit_log" USING btree ("user_id","idempotency_key") WHERE "agent_audit_log"."idempotency_key" IS NOT NULL;

  CREATE INDEX "agent_grants_user_id_idx" ON "agent_grants" USING btree ("user_id");

  CREATE INDEX "agent_tokens_grant_id_idx" ON "agent_tokens" USING btree ("grant_id");

  CREATE INDEX "organization_activity_org_id_idx" ON "organization_activity" USING btree ("organization_id","created_at");
END $$;
