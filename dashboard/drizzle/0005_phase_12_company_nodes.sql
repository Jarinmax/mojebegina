CREATE TABLE "company_node_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"author_name" text,
	"kind" text NOT NULL,
	"body" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"status_mode" text DEFAULT 'auto' NOT NULL,
	"status_reason" text,
	"status_driver_node_id" uuid,
	"priority" text DEFAULT 'medium' NOT NULL,
	"owner_user_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "company_node_activity" ADD CONSTRAINT "company_node_activity_node_id_company_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."company_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_nodes" ADD CONSTRAINT "company_nodes_parent_id_company_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."company_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_nodes" ADD CONSTRAINT "company_nodes_status_driver_node_id_company_nodes_id_fk" FOREIGN KEY ("status_driver_node_id") REFERENCES "public"."company_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_node_activity_node_id_idx" ON "company_node_activity" USING btree ("node_id","created_at");--> statement-breakpoint
CREATE INDEX "company_nodes_parent_id_idx" ON "company_nodes" USING btree ("parent_id","position");