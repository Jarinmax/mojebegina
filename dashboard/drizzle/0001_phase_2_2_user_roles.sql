CREATE TABLE "user_roles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"system_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
