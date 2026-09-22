CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
