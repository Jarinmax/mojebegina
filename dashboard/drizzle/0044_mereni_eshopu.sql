CREATE TABLE "eshop_funnel_daily" (
	"day" date NOT NULL,
	"step" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "eshop_funnel_daily_day_step_pk" PRIMARY KEY("day","step")
);
