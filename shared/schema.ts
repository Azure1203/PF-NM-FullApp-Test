import { pgTable, text, serial, boolean, timestamp, integer, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Export auth schema for Replit Auth
export * from "./models/auth";

// Projects table - groups multiple order files together
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // Derived from PO number or first file
  
  // Shared metadata (extracted from first file, can be edited)
  date: text("date"),
  dealer: text("dealer"),
  shippingAddress: text("shipping_address"),
  phone: text("phone"),
  taxId: text("tax_id"),
  powerTailgate: boolean("power_tailgate"),
  phoneAppointment: boolean("phone_appointment"),
  orderId: text("order_id"),
  
  status: text("status").notNull().default('pending'), // pending, synced
  asanaTaskId: text("asana_task_id"),
  
  // Asana custom fields (synced)
  pfOrderStatus: text("pf_order_status"), // PF ORDER STATUS from Asana
  pfProductionStatus: text("pf_production_status").array(), // PF PRODUCTION STATUS multi-select from Asana
  asanaSection: text("asana_section"), // PF PRODUCTION SECTION - the Asana section the task is in
  lastAsanaSyncAt: timestamp("last_asana_sync_at"), // Last time we synced from Asana
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Order files table - individual CSV files within a project
export const orderFiles = pgTable("order_files", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  originalFilename: text("original_filename").notNull(),
  poNumber: text("po_number"), // Each file can have its own PO/design name
  rawContent: text("raw_content"),
  
  // Calculated order details from CSV
  coreParts: integer("core_parts").default(0),
  dovetails: integer("dovetails").default(0),
  assembledDrawers: integer("assembled_drawers").default(0),
  fivePieceDoors: integer("five_piece_doors").default(0),
  weightLbs: integer("weight_lbs").default(0),
  maxLength: integer("max_length").default(0),
  hasGlassParts: boolean("has_glass_parts").default(false),
  glassInserts: integer("glass_inserts").default(0),
  glassShelves: integer("glass_shelves").default(0),
  hasMJDoors: boolean("has_mj_doors").default(false),
  hasRichelieuDoors: boolean("has_richelieu_doors").default(false),
  hasDoubleThick: boolean("has_double_thick").default(false),
  notes: text("notes"), // User notes for this file
  allmoxyJobNumber: text("allmoxy_job_number"), // ALLMOXY JOB # for this file
  packagingLink: text("packaging_link"), // Link to Adobe Acrobat packaging document
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ 
  id: true, 
  createdAt: true,
  status: true,
  asanaTaskId: true 
});

export const insertOrderFileSchema = createInsertSchema(orderFiles).omit({ 
  id: true, 
  createdAt: true
});

// CTS Parts table - individual cut-to-size parts extracted from each file
export const ctsParts = pgTable("cts_parts", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").references(() => orderFiles.id, { onDelete: 'cascade' }).notNull(),
  partNumber: text("part_number").notNull(), // e.g. H.801.43.340.CTS
  description: text("description"), // e.g. Round Rod Black - Cut to size
  cutLength: real("cut_length").notNull(), // Length in mm (with 1 decimal)
  quantity: integer("quantity").notNull().default(1),
  isCut: boolean("is_cut").default(false).notNull(), // Whether this part has been cut
  createdAt: timestamp("created_at").defaultNow(),
});

// CTS Part Configurations - shared image and rack location per part type
export const ctsPartConfigs = pgTable("cts_part_configs", {
  id: serial("id").primaryKey(),
  partNumber: text("part_number").notNull().unique(), // The base part number (without .CTS suffix or with it)
  imageUrl: text("image_url"), // URL or path to uploaded image
  rackLocation: text("rack_location"), // Where to find the full-length rod
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCtsPartSchema = createInsertSchema(ctsParts).omit({ 
  id: true, 
  createdAt: true
});

export const insertCtsPartConfigSchema = createInsertSchema(ctsPartConfigs).omit({ 
  id: true, 
  updatedAt: true
});

// Pallet size options
export const PALLET_SIZES = [
  '34" Wide Cut to Size',
  '96" Long',
  '105" Long',
  '110" Long',
  'Custom'
] as const;

export type PalletSize = typeof PALLET_SIZES[number];

// Pallet packaging status - tracks which metrics have been packaged
export const PALLET_PACKAGING_METRICS = [
  'orders',
  'parts', 
  'dovetails',
  'assembled',
  'fivePiece',
  'weight',
  'maxLength'
] as const;

export type PalletPackagingMetric = typeof PALLET_PACKAGING_METRICS[number];
export type PalletPackagingStatus = Record<PalletPackagingMetric, boolean>;

// Default packaging status (all false/red)
export const defaultPackagingStatus: PalletPackagingStatus = {
  orders: false,
  parts: false,
  dovetails: false,
  assembled: false,
  fivePiece: false,
  weight: false,
  maxLength: false
};

// Pallets table - packaging pallets for a project
export const pallets = pgTable("pallets", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  palletNumber: integer("pallet_number").notNull(), // 1, 2, 3, etc.
  size: text("size").notNull(), // One of PALLET_SIZES
  customSize: text("custom_size"), // Free text if size is 'Custom'
  notes: text("notes"),
  packagingStatus: jsonb("packaging_status").$type<PalletPackagingStatus>().default(defaultPackagingStatus),
  hardwarePackaged: boolean("hardware_packaged").default(false), // Whether hardware has been packaged
  createdAt: timestamp("created_at").defaultNow(),
});

// Pallet-File assignments - which files are on which pallet
export const palletFileAssignments = pgTable("pallet_file_assignments", {
  id: serial("id").primaryKey(),
  palletId: integer("pallet_id").references(() => pallets.id, { onDelete: 'cascade' }).notNull(),
  fileId: integer("file_id").references(() => orderFiles.id, { onDelete: 'cascade' }).notNull(),
  notes: text("notes"), // Optional notes for this specific assignment
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPalletSchema = createInsertSchema(pallets).omit({ 
  id: true, 
  createdAt: true
});

export const insertPalletFileAssignmentSchema = createInsertSchema(palletFileAssignments).omit({ 
  id: true, 
  createdAt: true
});

export type Pallet = typeof pallets.$inferSelect;
export type InsertPallet = z.infer<typeof insertPalletSchema>;

export type PalletFileAssignment = typeof palletFileAssignments.$inferSelect;
export type InsertPalletFileAssignment = z.infer<typeof insertPalletFileAssignmentSchema>;

export type CtsPart = typeof ctsParts.$inferSelect;
export type InsertCtsPart = z.infer<typeof insertCtsPartSchema>;

export type CtsPartConfig = typeof ctsPartConfigs.$inferSelect;
export type InsertCtsPartConfig = z.infer<typeof insertCtsPartConfigSchema>;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type OrderFile = typeof orderFiles.$inferSelect;
export type InsertOrderFile = z.infer<typeof insertOrderFileSchema>;

export type ProjectStatus = 'pending' | 'synced' | 'error';

// Keep backward compatibility - alias Order to Project for now
export const orders = projects;
export type Order = Project;
export type InsertOrder = InsertProject;
export type OrderStatus = ProjectStatus;
