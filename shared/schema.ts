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
  cienappsJobNumber: text("cienapps_job_number"), // CIENAPPS JOB NUMBER from Asana
  lastAsanaSyncAt: timestamp("last_asana_sync_at"), // Last time we synced from Asana
  notes: text("notes"), // Project-level notes
  buyoutHardware: boolean("buyout_hardware").default(false), // Manual toggle for buyout hardware
  
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
  hasShakerDoors: boolean("has_shaker_doors").default(false),
  mjDoorsCount: integer("mj_doors_count").default(0),
  richelieuDoorsCount: integer("richelieu_doors_count").default(0),
  doubleThickCount: integer("double_thick_count").default(0),
  wallRailPieces: integer("wall_rail_pieces").default(0),
  notes: text("notes"), // User notes for this file
  allmoxyJobNumber: text("allmoxy_job_number"), // ALLMOXY JOB # for this file
  packagingLink: text("packaging_link"), // Link to Adobe Acrobat packaging document
  packingSlipPdfPath: text("packing_slip_pdf_path"), // Path to Netley packing slip PDF in object storage
  cutToFilePdfPath: text("cut_to_file_pdf_path"), // Path to Cut To File PDF in object storage
  eliasDovetailPdfPath: text("elias_dovetail_pdf_path"), // Path to Elias PF Dovetail Drawers PDF in object storage
  netley5PiecePdfPath: text("netley_5_piece_pdf_path"), // Path to Netley 5 Piece Shaker Door PDF in object storage
  hardwareCsvPath: text("hardware_csv_path"), // Path to hardware CSV in object storage
  hardwareBoStatus: text("hardware_bo_status"), // Calculated BO status: 'NO BO HARDWARE', 'WAITING FOR BO HARDWARE', 'BO HARDWARE ARRIVED'
  
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
  'Courier Package',
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
  'glassInserts',
  'glassShelves',
  'mjDoors',
  'richelieuDoors',
  'doubleThick',
  'cts',
  'wallRail',
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
  glassInserts: false,
  glassShelves: false,
  mjDoors: false,
  richelieuDoors: false,
  doubleThick: false,
  cts: false,
  wallRail: false,
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
  finalSize: text("final_size"), // User-entered final pallet size for Asana sync
  createdAt: timestamp("created_at").defaultNow(),
});

// Buyout hardware status options for multi-select
export const BUYOUT_HARDWARE_OPTIONS = [
  'WAITING FOR BO HARDWARE',
  'BO HARDWARE ARRIVED',
  'NO BUYOUT HARDWARE',
] as const;

export type BuyoutHardwareOption = typeof BUYOUT_HARDWARE_OPTIONS[number];

// Pallet-File assignments - which files are on which pallet
export const palletFileAssignments = pgTable("pallet_file_assignments", {
  id: serial("id").primaryKey(),
  palletId: integer("pallet_id").references(() => pallets.id, { onDelete: 'cascade' }).notNull(),
  fileId: integer("file_id").references(() => orderFiles.id, { onDelete: 'cascade' }).notNull(),
  notes: text("notes"), // Optional notes for this specific assignment
  hardwarePackaged: boolean("hardware_packaged").default(false), // Per-order hardware packaged status
  hardwarePackedBy: text("hardware_packed_by"), // Who packed the hardware
  buyoutHardwareStatuses: text("buyout_hardware_statuses").array().$type<BuyoutHardwareOption[]>().default([]), // Multi-select buyout hardware status
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

// Processed Outlook emails - track which emails have been processed to avoid duplicates
export const processedOutlookEmails = pgTable("processed_outlook_emails", {
  id: serial("id").primaryKey(),
  messageId: text("message_id").notNull().unique(), // Outlook message ID
  subject: text("subject"),
  processedAt: timestamp("processed_at").defaultNow(),
  matchedFileId: integer("matched_file_id").references(() => orderFiles.id, { onDelete: 'set null' }),
  status: text("status").notNull().default('processed'), // processed, failed, skipped
});

export type ProcessedOutlookEmail = typeof processedOutlookEmails.$inferSelect;

// Outlook sync status - tracks the last sync time and status
export const outlookSyncStatus = pgTable("outlook_sync_status", {
  id: serial("id").primaryKey(),
  lastSyncAt: timestamp("last_sync_at"),
  lastSuccessAt: timestamp("last_success_at"),
  lastError: text("last_error"),
  emailsProcessed: integer("emails_processed").default(0),
  emailsMatched: integer("emails_matched").default(0),
});

export type OutlookSyncStatus = typeof outlookSyncStatus.$inferSelect;

// Packing slip checklist items - parsed from Netley Packing Slip PDFs
export const packingSlipItems = pgTable("packing_slip_items", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").references(() => orderFiles.id, { onDelete: 'cascade' }).notNull(),
  partCode: text("part_code").notNull(), // e.g. DBX24_14_167, SDBX24_12_6
  color: text("color"), // e.g. TFL1W, HGFU, TFL2F
  quantity: integer("quantity").notNull().default(1),
  height: real("height"), // Dimension in mm
  width: real("width"), // Dimension in mm
  length: real("length"), // Dimension in mm (optional)
  thickness: real("thickness"), // Dimension in mm (optional)
  description: text("description"), // e.g. "Dovetail Drawer Box", "TFL 5-Piece Shaker"
  imagePath: text("image_path"), // Path to extracted image in object storage
  isChecked: boolean("is_checked").default(false).notNull(),
  checkedAt: timestamp("checked_at"),
  checkedBy: text("checked_by"),
  sortOrder: integer("sort_order").default(0), // Order in the original PDF
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPackingSlipItemSchema = createInsertSchema(packingSlipItems).omit({ 
  id: true, 
  createdAt: true,
  checkedAt: true
});

export type PackingSlipItem = typeof packingSlipItems.$inferSelect;
export type InsertPackingSlipItem = z.infer<typeof insertPackingSlipItemSchema>;

// Stock status options for products
export const STOCK_STATUS_OPTIONS = ['IN_STOCK', 'BUYOUT'] as const;
export type StockStatus = typeof STOCK_STATUS_OPTIONS[number];

// Product catalog table - internal product database for packaging checklists
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // e.g. H.111.95.310, DBX24_14_167
  name: text("name"), // Product name/description
  supplier: text("supplier"), // Supplier name (Marathon, Hafele, Richelieu)
  category: text("category").notNull().default('HARDWARE'), // HARDWARE or COMPONENT
  stockStatus: text("stock_status").$type<StockStatus>().default('IN_STOCK'), // IN_STOCK or BUYOUT
  weight: real("weight"), // Weight in grams (optional)
  imagePath: text("image_path"), // Object storage path to product image
  notes: text("notes"), // Additional notes
  importRowNumber: integer("import_row_number"), // Row number from CSV import for image linking
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProductSchema = createInsertSchema(products).omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

// Hardware checklist items - items from hardware CSV attached to order files
export const hardwareChecklistItems = pgTable("hardware_checklist_items", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").references(() => orderFiles.id, { onDelete: 'cascade' }).notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: 'set null' }), // Link to product database
  productCode: text("product_code").notNull(), // The code from the CSV
  productName: text("product_name"), // Description from CSV (fallback if no product match)
  quantity: integer("quantity").notNull().default(1),
  isBuyout: boolean("is_buyout").default(false).notNull(), // Derived from product stockStatus
  buyoutArrived: boolean("buyout_arrived").default(false).notNull(), // Has the buyout item arrived?
  isPacked: boolean("is_packed").default(false).notNull(), // Has this item been packed?
  packedAt: timestamp("packed_at"),
  packedBy: text("packed_by"),
  sortOrder: integer("sort_order").default(0), // Order in the original CSV
  notInDatabase: boolean("not_in_database").default(false).notNull(), // Item has hardware prefix but isn't in products DB
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertHardwareChecklistItemSchema = createInsertSchema(hardwareChecklistItems).omit({ 
  id: true, 
  createdAt: true,
  packedAt: true
});

export type HardwareChecklistItem = typeof hardwareChecklistItems.$inferSelect;
export type InsertHardwareChecklistItem = z.infer<typeof insertHardwareChecklistItemSchema>;

// Hardware checklist status for an order file
export const HARDWARE_BO_STATUS_OPTIONS = [
  'NO BO HARDWARE',
  'WAITING FOR BO HARDWARE',
  'BO HARDWARE ARRIVED',
] as const;
export type HardwareBoStatus = typeof HARDWARE_BO_STATUS_OPTIONS[number];

// Keep backward compatibility - alias Order to Project for now
export const orders = projects;
export type Order = Project;
export type InsertOrder = InsertProject;
export type OrderStatus = ProjectStatus;
