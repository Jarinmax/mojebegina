ALTER TABLE "orders" ADD COLUMN "source_lead_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_source_lead_id_leads_id_fk" FOREIGN KEY ("source_lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_source_lead_idx" ON "orders" USING btree ("source_lead_id");