CREATE TABLE "allowed_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text,
	"email" text,
	"display_name" text,
	"added_by" text,
	"is_admin" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "allowed_users_username_unique" UNIQUE("username"),
	CONSTRAINT "allowed_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "asana_import_sync_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"last_sync_at" timestamp,
	"last_success_at" timestamp,
	"last_error" text,
	"tasks_processed" integer DEFAULT 0,
	"tasks_imported" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "color_grid" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "color_grid_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "cts_part_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"part_number" text NOT NULL,
	"image_url" text,
	"rack_location" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "cts_part_configs_part_number_unique" UNIQUE("part_number")
);
--> statement-breakpoint
CREATE TABLE "cts_parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_id" integer NOT NULL,
	"part_number" text NOT NULL,
	"description" text,
	"cut_length" real NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"is_cut" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hardware_checklist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_id" integer NOT NULL,
	"product_id" integer,
	"product_code" text NOT NULL,
	"product_name" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"cut_length" real,
	"is_buyout" boolean DEFAULT false NOT NULL,
	"buyout_arrived" boolean DEFAULT false NOT NULL,
	"is_packed" boolean DEFAULT false NOT NULL,
	"packed_at" timestamp,
	"packed_by" text,
	"sort_order" integer DEFAULT 0,
	"not_in_database" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "outlook_sync_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"last_sync_at" timestamp,
	"last_success_at" timestamp,
	"last_error" text,
	"emails_processed" integer DEFAULT 0,
	"emails_matched" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "packing_slip_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_id" integer NOT NULL,
	"part_code" text NOT NULL,
	"color" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"height" real,
	"width" real,
	"length" real,
	"thickness" real,
	"description" text,
	"image_path" text,
	"is_checked" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp,
	"checked_by" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pallet_file_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"pallet_id" integer NOT NULL,
	"file_id" integer NOT NULL,
	"notes" text,
	"hardware_packaged" boolean DEFAULT false,
	"hardware_packed_by" text,
	"buyout_hardware_statuses" text[] DEFAULT '{}',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"pallet_number" integer NOT NULL,
	"size" text NOT NULL,
	"custom_size" text,
	"notes" text,
	"packaging_status" jsonb DEFAULT '{"orders":false,"parts":false,"dovetails":false,"assembled":false,"fivePiece":false,"glassInserts":false,"glassShelves":false,"mjDoors":false,"richelieuDoors":false,"doubleThick":false,"cts":false,"wallRail":false,"weight":false,"maxLength":false,"maxWidth":false}'::jsonb,
	"hardware_packaged" boolean DEFAULT false,
	"final_size" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "processed_asana_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_gid" text NOT NULL,
	"task_name" text,
	"project_id" integer,
	"processed_at" timestamp DEFAULT now(),
	"status" text DEFAULT 'processed' NOT NULL,
	"error" text,
	CONSTRAINT "processed_asana_tasks_task_gid_unique" UNIQUE("task_gid")
);
--> statement-breakpoint
CREATE TABLE "processed_outlook_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"subject" text,
	"processed_at" timestamp DEFAULT now(),
	"matched_file_id" integer,
	"status" text DEFAULT 'processed' NOT NULL,
	CONSTRAINT "processed_outlook_emails_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text,
	"supplier" text,
	"category" text DEFAULT 'HARDWARE' NOT NULL,
	"stock_status" text DEFAULT 'IN_STOCK',
	"weight" real,
	"image_path" text,
	"notes" text,
	"import_row_number" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "products_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "max_width" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "glass_inserts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "glass_shelves" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "has_shaker_doors" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "mj_doors_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "richelieu_doors_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "double_thick_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "wall_rail_pieces" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "allmoxy_job_number" text;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "packaging_link" text;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "cut_to_file_pdf_path" text;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "elias_dovetail_pdf_path" text;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "netley_5_piece_pdf_path" text;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "netley_packing_slip_pdf_path" text;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "hardware_csv_path" text;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "hardware_bo_status" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "pf_order_status" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "pf_production_status" text[];--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "asana_section" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "cienapps_job_number" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_asana_sync_at" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "buyout_hardware" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "cts_parts" ADD CONSTRAINT "cts_parts_file_id_order_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."order_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_checklist_items" ADD CONSTRAINT "hardware_checklist_items_file_id_order_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."order_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_checklist_items" ADD CONSTRAINT "hardware_checklist_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packing_slip_items" ADD CONSTRAINT "packing_slip_items_file_id_order_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."order_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallet_file_assignments" ADD CONSTRAINT "pallet_file_assignments_pallet_id_pallets_id_fk" FOREIGN KEY ("pallet_id") REFERENCES "public"."pallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallet_file_assignments" ADD CONSTRAINT "pallet_file_assignments_file_id_order_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."order_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pallets" ADD CONSTRAINT "pallets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_asana_tasks" ADD CONSTRAINT "processed_asana_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_outlook_emails" ADD CONSTRAINT "processed_outlook_emails_matched_file_id_order_files_id_fk" FOREIGN KEY ("matched_file_id") REFERENCES "public"."order_files"("id") ON DELETE set null ON UPDATE no action;