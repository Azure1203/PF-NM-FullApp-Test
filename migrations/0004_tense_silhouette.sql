CREATE TABLE "agentmail_sync_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"last_sync_at" timestamp,
	"last_success_at" timestamp,
	"last_error" text,
	"emails_processed" integer DEFAULT 0,
	"emails_matched" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "allmoxy_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" varchar(50),
	"pricing_proxy_id" integer,
	"export_proxy_id" integer,
	"sku_prefix" varchar(100),
	"description" text,
	"notes" text,
	CONSTRAINT "allmoxy_products_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "attribute_grid_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"grid_id" integer NOT NULL,
	"lookup_key" varchar(255) NOT NULL,
	"row_data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attribute_grids" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"columns" jsonb NOT NULL,
	"key_column" varchar(255) NOT NULL,
	CONSTRAINT "attribute_grids_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"file_id" integer NOT NULL,
	"product_id" integer,
	"sku" text,
	"description" text,
	"width" real,
	"height" real,
	"depth" real,
	"quantity" integer DEFAULT 1,
	"unit_price" real DEFAULT 0,
	"total_price" real DEFAULT 0,
	"export_text" text,
	"pricing_error" text,
	"raw_row_data" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_grid_bindings" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"grid_id" integer NOT NULL,
	"alias" varchar(100) NOT NULL,
	"lookup_column" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proxy_variables" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"formula" text NOT NULL,
	CONSTRAINT "proxy_variables_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "pallets" ALTER COLUMN "packaging_status" SET DEFAULT '{"orders":false,"parts":false,"dovetails":false,"assembled":false,"fivePiece":false,"glassInserts":false,"glassShelves":false,"mjDoors":false,"richelieuDoors":false,"doubleThick":false,"cts":false,"wallRail":false,"weight":false,"maxLength":false,"maxWidth":false,"recommendedPallet":false}'::jsonb;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "largest_part_width" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "widest_part_length" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "allmoxy_products" ADD CONSTRAINT "allmoxy_products_pricing_proxy_id_proxy_variables_id_fk" FOREIGN KEY ("pricing_proxy_id") REFERENCES "public"."proxy_variables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allmoxy_products" ADD CONSTRAINT "allmoxy_products_export_proxy_id_proxy_variables_id_fk" FOREIGN KEY ("export_proxy_id") REFERENCES "public"."proxy_variables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_grid_rows" ADD CONSTRAINT "attribute_grid_rows_grid_id_attribute_grids_id_fk" FOREIGN KEY ("grid_id") REFERENCES "public"."attribute_grids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_file_id_order_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."order_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_allmoxy_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."allmoxy_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_grid_bindings" ADD CONSTRAINT "product_grid_bindings_product_id_allmoxy_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."allmoxy_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_grid_bindings" ADD CONSTRAINT "product_grid_bindings_grid_id_attribute_grids_id_fk" FOREIGN KEY ("grid_id") REFERENCES "public"."attribute_grids"("id") ON DELETE cascade ON UPDATE no action;