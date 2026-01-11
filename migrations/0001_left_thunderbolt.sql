ALTER TABLE "order_files" ADD COLUMN "core_parts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "dovetails" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "assembled_drawers" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "five_piece_doors" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "weight_lbs" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "max_length" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "has_glass_parts" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "has_mj_doors" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "has_richelieu_doors" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "has_double_thick" boolean DEFAULT false;