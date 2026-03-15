CREATE TABLE "app_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "app_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "allmoxy_products" ADD COLUMN "export_type" varchar(20) DEFAULT 'ORD';--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "export_type" varchar(20);