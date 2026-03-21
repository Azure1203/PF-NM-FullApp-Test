CREATE TABLE IF NOT EXISTS "product_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	CONSTRAINT "product_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "allmoxy_products" DROP CONSTRAINT IF EXISTS "allmoxy_products_pricing_proxy_id_proxy_variables_id_fk";
--> statement-breakpoint
ALTER TABLE "allmoxy_products" DROP CONSTRAINT IF EXISTS "allmoxy_products_export_proxy_id_proxy_variables_id_fk";
--> statement-breakpoint
ALTER TABLE "allmoxy_products" ADD COLUMN IF NOT EXISTS "supply_type" varchar(20) DEFAULT 'STOCK';
--> statement-breakpoint
ALTER TABLE "allmoxy_products" ADD COLUMN IF NOT EXISTS "image_data" text;
--> statement-breakpoint
ALTER TABLE "allmoxy_products" ADD COLUMN IF NOT EXISTS "category_id" integer;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "supply_type" varchar(20);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "image_data" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "allmoxy_products" ADD CONSTRAINT "allmoxy_products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "allmoxy_products" ADD CONSTRAINT "allmoxy_products_pricing_proxy_id_proxy_variables_id_fk" FOREIGN KEY ("pricing_proxy_id") REFERENCES "public"."proxy_variables"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "allmoxy_products" ADD CONSTRAINT "allmoxy_products_export_proxy_id_proxy_variables_id_fk" FOREIGN KEY ("export_proxy_id") REFERENCES "public"."proxy_variables"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
