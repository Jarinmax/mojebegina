ALTER TABLE "orders" ADD COLUMN "billing_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "billing_company" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "billing_ico" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "billing_dic" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "billing_street" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "billing_city" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "billing_zip" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "billing_country" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "recipient_company" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_same_as_billing" boolean;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_billing_ico_format" CHECK ("orders"."billing_ico" IS NULL OR "orders"."billing_ico" ~ '^[0-9]{8}$');--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_billing_company_has_ico" CHECK (("orders"."billing_company" IS NULL) = ("orders"."billing_ico" IS NULL));