import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  originalFilename: text("original_filename").notNull(),
  
  // Extracted Fields
  date: text("date"),
  dealer: text("dealer"),
  shippingAddress: text("shipping_address"),
  phone: text("phone"),
  taxId: text("tax_id"),
  powerTailgate: boolean("power_tailgate"),
  phoneAppointment: boolean("phone_appointment"),
  orderId: text("order_id"),
  poNumber: text("po_number"),
  
  // Full raw content for Allmoxy import/reference
  rawContent: text("raw_content"),
  
  status: text("status").notNull().default('pending'), // pending, synced
  asanaTaskId: text("asana_task_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOrderSchema = createInsertSchema(orders).omit({ 
  id: true, 
  createdAt: true,
  status: true,
  asanaTaskId: true 
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

export type OrderStatus = 'pending' | 'synced' | 'error';
