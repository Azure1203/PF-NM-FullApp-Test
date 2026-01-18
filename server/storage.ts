import { db } from "./db";
import {
  projects,
  orderFiles,
  ctsParts,
  ctsPartConfigs,
  pallets,
  palletFileAssignments,
  processedOutlookEmails,
  packingSlipItems,
  products,
  hardwareChecklistItems,
  type Project,
  type InsertProject,
  type OrderFile,
  type InsertOrderFile,
  type CtsPart,
  type InsertCtsPart,
  type CtsPartConfig,
  type InsertCtsPartConfig,
  type Pallet,
  type InsertPallet,
  type PalletFileAssignment,
  type InsertPalletFileAssignment,
  type BuyoutHardwareOption,
  type PackingSlipItem,
  type InsertPackingSlipItem,
  type Product,
  type InsertProduct,
  type HardwareChecklistItem,
  type InsertHardwareChecklistItem
} from "@shared/schema";
import { eq, desc, and, inArray, sql, ilike } from "drizzle-orm";

export interface IStorage {
  // Project methods
  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, updates: Partial<Project>): Promise<Project>;
  deleteProject(id: number): Promise<boolean>;
  
  // Order file methods
  getProjectFiles(projectId: number): Promise<OrderFile[]>;
  getFileWithProject(fileId: number): Promise<{ file: OrderFile; projectName: string } | undefined>;
  createOrderFile(file: InsertOrderFile): Promise<OrderFile>;
  updateOrderFile(id: number, updates: Partial<OrderFile>): Promise<OrderFile | undefined>;
  
  // CTS parts methods
  getCtsPartsForFile(fileId: number): Promise<CtsPart[]>;
  getCtsPartsCountForFile(fileId: number): Promise<number>;
  getCtsPartsCutStatus(fileId: number): Promise<{ total: number; cut: number; allCut: boolean }>;
  createCtsPart(part: InsertCtsPart): Promise<CtsPart>;
  updateCtsPartCutStatus(partId: number, isCut: boolean): Promise<CtsPart | undefined>;
  
  // CTS part config methods
  getCtsPartConfig(partNumber: string): Promise<CtsPartConfig | undefined>;
  getAllCtsPartConfigs(): Promise<CtsPartConfig[]>;
  upsertCtsPartConfig(config: InsertCtsPartConfig): Promise<CtsPartConfig>;
  
  // Pallet methods
  getPalletsForProject(projectId: number): Promise<Pallet[]>;
  getPallet(id: number): Promise<Pallet | undefined>;
  createPallet(pallet: InsertPallet): Promise<Pallet>;
  updatePallet(id: number, updates: Partial<Pallet>): Promise<Pallet | undefined>;
  deletePallet(id: number): Promise<boolean>;
  getNextPalletNumber(projectId: number): Promise<number>;
  
  // Pallet file assignment methods
  getAssignmentsForPallet(palletId: number): Promise<PalletFileAssignment[]>;
  getAssignmentsForFile(fileId: number): Promise<PalletFileAssignment[]>;
  createPalletFileAssignment(assignment: InsertPalletFileAssignment): Promise<PalletFileAssignment>;
  deletePalletFileAssignment(id: number): Promise<boolean>;
  deleteAssignmentsForPallet(palletId: number): Promise<void>;
  setAssignmentsForPallet(palletId: number, fileIds: number[]): Promise<PalletFileAssignment[]>;
  getAssignment(id: number): Promise<PalletFileAssignment | undefined>;
  updateAssignmentHardwareStatus(id: number, hardwarePackaged: boolean, hardwarePackedBy?: string | null): Promise<PalletFileAssignment | undefined>;
  
  // Outlook email tracking methods
  clearProcessedOutlookEmails(): Promise<number>;
  
  // Packing slip checklist methods
  getPackingSlipItems(fileId: number): Promise<PackingSlipItem[]>;
  togglePackingSlipItem(itemId: number, isChecked: boolean, checkedBy?: string): Promise<PackingSlipItem | undefined>;
  getPackingSlipProgress(fileId: number): Promise<{ total: number; checked: number; percentage: number }>;
  
  // Product catalog methods
  getProducts(search?: string, category?: string): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  getProductByCode(code: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, updates: Partial<Product>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;
  getProductsByCode(codes: string[]): Promise<Product[]>;
  getProductsByImportRowNumbers(rowNumbers: number[]): Promise<Product[]>;
  
  // Hardware checklist methods
  getHardwareChecklistItems(fileId: number): Promise<HardwareChecklistItem[]>;
  createHardwareChecklistItem(item: InsertHardwareChecklistItem): Promise<HardwareChecklistItem>;
  toggleHardwareItemPacked(itemId: number, isPacked: boolean, packedBy?: string): Promise<HardwareChecklistItem | undefined>;
  toggleHardwareItemBuyoutArrived(itemId: number, buyoutArrived: boolean): Promise<HardwareChecklistItem | undefined>;
  deleteHardwareChecklistItems(fileId: number): Promise<void>;
  getHardwareChecklistProgress(fileId: number): Promise<{ total: number; packed: number; buyoutItems: number; buyoutArrived: number }>;
  replaceHardwareChecklist(fileId: number, items: InsertHardwareChecklistItem[]): Promise<HardwareChecklistItem[]>;
}

export class DatabaseStorage implements IStorage {
  // Project methods
  async getProjects(): Promise<Project[]> {
    return await db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(insertProject).returning();
    return project;
  }

  async updateProject(id: number, updates: Partial<Project>): Promise<Project> {
    const [updated] = await db.update(projects)
      .set(updates)
      .where(eq(projects.id, id))
      .returning();
    return updated;
  }

  async deleteProject(id: number): Promise<boolean> {
    // Delete associated files first
    await db.delete(orderFiles).where(eq(orderFiles.projectId, id));
    const [deleted] = await db.delete(projects).where(eq(projects.id, id)).returning();
    return !!deleted;
  }

  // Order file methods
  async getProjectFiles(projectId: number): Promise<OrderFile[]> {
    return await db.select().from(orderFiles).where(eq(orderFiles.projectId, projectId)).orderBy(orderFiles.id);
  }

  async getFileWithProject(fileId: number): Promise<{ file: OrderFile; projectName: string } | undefined> {
    const [file] = await db.select().from(orderFiles).where(eq(orderFiles.id, fileId));
    if (!file) return undefined;
    
    const [project] = await db.select().from(projects).where(eq(projects.id, file.projectId));
    return {
      file,
      projectName: project?.name ?? 'Unknown Project'
    };
  }

  async createOrderFile(file: InsertOrderFile): Promise<OrderFile> {
    const [created] = await db.insert(orderFiles).values(file).returning();
    return created;
  }

  async updateOrderFile(id: number, updates: Partial<OrderFile>): Promise<OrderFile | undefined> {
    const [updated] = await db.update(orderFiles)
      .set(updates)
      .where(eq(orderFiles.id, id))
      .returning();
    return updated;
  }

  // CTS parts methods
  async getCtsPartsForFile(fileId: number): Promise<CtsPart[]> {
    return await db.select().from(ctsParts).where(eq(ctsParts.fileId, fileId)).orderBy(ctsParts.id);
  }

  async getCtsPartsCountForFile(fileId: number): Promise<number> {
    const parts = await db.select().from(ctsParts).where(eq(ctsParts.fileId, fileId));
    return parts.reduce((sum, part) => sum + part.quantity, 0);
  }

  async getCtsPartsCutStatus(fileId: number): Promise<{ total: number; cut: number; allCut: boolean }> {
    const parts = await db.select().from(ctsParts).where(eq(ctsParts.fileId, fileId));
    const total = parts.reduce((sum, part) => sum + part.quantity, 0);
    const cut = parts.filter(p => p.isCut).reduce((sum, part) => sum + part.quantity, 0);
    return { total, cut, allCut: total > 0 && cut === total };
  }

  async createCtsPart(part: InsertCtsPart): Promise<CtsPart> {
    const [created] = await db.insert(ctsParts).values(part).returning();
    return created;
  }

  async updateCtsPartCutStatus(partId: number, isCut: boolean): Promise<CtsPart | undefined> {
    const [updated] = await db.update(ctsParts)
      .set({ isCut })
      .where(eq(ctsParts.id, partId))
      .returning();
    return updated;
  }

  // CTS part config methods
  async getCtsPartConfig(partNumber: string): Promise<CtsPartConfig | undefined> {
    const [config] = await db.select().from(ctsPartConfigs).where(eq(ctsPartConfigs.partNumber, partNumber));
    return config;
  }

  async getAllCtsPartConfigs(): Promise<CtsPartConfig[]> {
    return await db.select().from(ctsPartConfigs);
  }

  async upsertCtsPartConfig(config: InsertCtsPartConfig): Promise<CtsPartConfig> {
    const existing = await this.getCtsPartConfig(config.partNumber);
    if (existing) {
      const [updated] = await db.update(ctsPartConfigs)
        .set({ ...config, updatedAt: new Date() })
        .where(eq(ctsPartConfigs.partNumber, config.partNumber))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(ctsPartConfigs).values(config).returning();
      return created;
    }
  }

  // Pallet methods
  async getPalletsForProject(projectId: number): Promise<Pallet[]> {
    return await db.select().from(pallets).where(eq(pallets.projectId, projectId)).orderBy(pallets.palletNumber);
  }

  async getPallet(id: number): Promise<Pallet | undefined> {
    const [pallet] = await db.select().from(pallets).where(eq(pallets.id, id));
    return pallet;
  }

  async createPallet(pallet: InsertPallet): Promise<Pallet> {
    const [created] = await db.insert(pallets).values(pallet).returning();
    return created;
  }

  async updatePallet(id: number, updates: Partial<Pallet>): Promise<Pallet | undefined> {
    const [updated] = await db.update(pallets)
      .set(updates)
      .where(eq(pallets.id, id))
      .returning();
    return updated;
  }

  async deletePallet(id: number): Promise<boolean> {
    const [deleted] = await db.delete(pallets).where(eq(pallets.id, id)).returning();
    return !!deleted;
  }

  async getNextPalletNumber(projectId: number): Promise<number> {
    const existingPallets = await this.getPalletsForProject(projectId);
    if (existingPallets.length === 0) return 1;
    return Math.max(...existingPallets.map(p => p.palletNumber)) + 1;
  }

  // Pallet file assignment methods
  async getAssignmentsForPallet(palletId: number): Promise<PalletFileAssignment[]> {
    return await db.select().from(palletFileAssignments).where(eq(palletFileAssignments.palletId, palletId));
  }

  async getAssignmentsForFile(fileId: number): Promise<PalletFileAssignment[]> {
    return await db.select().from(palletFileAssignments).where(eq(palletFileAssignments.fileId, fileId));
  }

  async createPalletFileAssignment(assignment: InsertPalletFileAssignment): Promise<PalletFileAssignment> {
    const [created] = await db.insert(palletFileAssignments).values(assignment).returning();
    return created;
  }

  async deletePalletFileAssignment(id: number): Promise<boolean> {
    const [deleted] = await db.delete(palletFileAssignments).where(eq(palletFileAssignments.id, id)).returning();
    return !!deleted;
  }

  async deleteAssignmentsForPallet(palletId: number): Promise<void> {
    await db.delete(palletFileAssignments).where(eq(palletFileAssignments.palletId, palletId));
  }

  async setAssignmentsForPallet(palletId: number, fileIds: number[]): Promise<PalletFileAssignment[]> {
    // Delete existing assignments for this pallet
    await this.deleteAssignmentsForPallet(palletId);
    
    // Create new assignments
    if (fileIds.length === 0) return [];
    
    const results: PalletFileAssignment[] = [];
    for (const fileId of fileIds) {
      const [created] = await db.insert(palletFileAssignments).values({
        palletId,
        fileId,
        buyoutHardwareStatuses: [] as BuyoutHardwareOption[]
      }).returning();
      results.push(created);
    }
    
    return results;
  }

  async getAssignment(id: number): Promise<PalletFileAssignment | undefined> {
    const [assignment] = await db.select().from(palletFileAssignments).where(eq(palletFileAssignments.id, id));
    return assignment;
  }

  async updateAssignmentHardwareStatus(id: number, hardwarePackaged: boolean, hardwarePackedBy?: string | null): Promise<PalletFileAssignment | undefined> {
    const updateData: { hardwarePackaged: boolean; hardwarePackedBy?: string | null } = { hardwarePackaged };
    
    // If marking as packed, store who packed it. If unpacking, clear the name.
    if (hardwarePackaged && hardwarePackedBy) {
      updateData.hardwarePackedBy = hardwarePackedBy;
    } else if (!hardwarePackaged) {
      updateData.hardwarePackedBy = null;
    }
    
    const [updated] = await db.update(palletFileAssignments)
      .set(updateData)
      .where(eq(palletFileAssignments.id, id))
      .returning();
    return updated;
  }

  async updateAssignmentBuyoutStatuses(id: number, buyoutHardwareStatuses: BuyoutHardwareOption[]): Promise<PalletFileAssignment | undefined> {
    const [updated] = await db.update(palletFileAssignments)
      .set({ buyoutHardwareStatuses })
      .where(eq(palletFileAssignments.id, id))
      .returning();
    return updated;
  }

  // Outlook email tracking methods
  async clearProcessedOutlookEmails(): Promise<number> {
    const result = await db.delete(processedOutlookEmails).returning();
    return result.length;
  }

  // Packing slip checklist methods
  async getPackingSlipItems(fileId: number): Promise<PackingSlipItem[]> {
    return await db.select()
      .from(packingSlipItems)
      .where(eq(packingSlipItems.fileId, fileId))
      .orderBy(packingSlipItems.sortOrder);
  }

  async togglePackingSlipItem(itemId: number, isChecked: boolean, checkedBy?: string): Promise<PackingSlipItem | undefined> {
    const updateData: { isChecked: boolean; checkedAt: Date | null; checkedBy: string | null } = {
      isChecked,
      checkedAt: isChecked ? new Date() : null,
      checkedBy: isChecked && checkedBy ? checkedBy : null
    };
    
    const [updated] = await db.update(packingSlipItems)
      .set(updateData)
      .where(eq(packingSlipItems.id, itemId))
      .returning();
    return updated;
  }

  async getPackingSlipProgress(fileId: number): Promise<{ total: number; checked: number; percentage: number }> {
    const items = await db.select()
      .from(packingSlipItems)
      .where(eq(packingSlipItems.fileId, fileId));
    
    const total = items.length;
    const checked = items.filter(item => item.isChecked).length;
    const percentage = total > 0 ? Math.round((checked / total) * 100) : 0;
    
    return { total, checked, percentage };
  }

  // Product catalog methods
  async getProducts(search?: string, category?: string): Promise<Product[]> {
    let query = db.select().from(products);
    
    const conditions = [];
    if (search) {
      conditions.push(ilike(products.code, `%${search}%`));
    }
    if (category) {
      conditions.push(eq(products.category, category));
    }
    
    if (conditions.length > 0) {
      return await db.select().from(products).where(and(...conditions)).orderBy(products.code);
    }
    return await db.select().from(products).orderBy(products.code);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async getProductByCode(code: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.code, code));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [created] = await db.insert(products).values(product).returning();
    return created;
  }

  async updateProduct(id: number, updates: Partial<Product>): Promise<Product | undefined> {
    const [updated] = await db.update(products)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return updated;
  }

  async deleteProduct(id: number): Promise<boolean> {
    const [deleted] = await db.delete(products).where(eq(products.id, id)).returning();
    return !!deleted;
  }

  async getProductsByCode(codes: string[]): Promise<Product[]> {
    if (codes.length === 0) return [];
    // Normalize codes for comparison (trim and uppercase)
    const normalizedCodes = codes.map(c => c.trim().toUpperCase());
    // Use SQL UPPER for case-insensitive matching
    return await db.select().from(products)
      .where(sql`UPPER(TRIM(${products.code})) IN (${sql.join(normalizedCodes.map(c => sql`${c}`), sql`, `)})`);
  }

  async getProductsByImportRowNumbers(rowNumbers: number[]): Promise<Product[]> {
    if (rowNumbers.length === 0) return [];
    return await db.select().from(products)
      .where(inArray(products.importRowNumber, rowNumbers));
  }

  // Hardware checklist methods
  async getHardwareChecklistItems(fileId: number): Promise<HardwareChecklistItem[]> {
    return await db.select()
      .from(hardwareChecklistItems)
      .where(eq(hardwareChecklistItems.fileId, fileId))
      .orderBy(hardwareChecklistItems.sortOrder);
  }

  async createHardwareChecklistItem(item: InsertHardwareChecklistItem): Promise<HardwareChecklistItem> {
    const [created] = await db.insert(hardwareChecklistItems).values(item).returning();
    return created;
  }

  async toggleHardwareItemPacked(itemId: number, isPacked: boolean, packedBy?: string): Promise<HardwareChecklistItem | undefined> {
    const updateData: { isPacked: boolean; packedAt: Date | null; packedBy: string | null } = {
      isPacked,
      packedAt: isPacked ? new Date() : null,
      packedBy: isPacked && packedBy ? packedBy : null
    };
    
    const [updated] = await db.update(hardwareChecklistItems)
      .set(updateData)
      .where(eq(hardwareChecklistItems.id, itemId))
      .returning();
    return updated;
  }

  async toggleHardwareItemBuyoutArrived(itemId: number, buyoutArrived: boolean): Promise<HardwareChecklistItem | undefined> {
    const [updated] = await db.update(hardwareChecklistItems)
      .set({ buyoutArrived })
      .where(eq(hardwareChecklistItems.id, itemId))
      .returning();
    return updated;
  }

  async deleteHardwareChecklistItems(fileId: number): Promise<void> {
    await db.delete(hardwareChecklistItems).where(eq(hardwareChecklistItems.fileId, fileId));
  }

  async getHardwareChecklistProgress(fileId: number): Promise<{ total: number; packed: number; buyoutItems: number; buyoutArrived: number }> {
    const items = await db.select()
      .from(hardwareChecklistItems)
      .where(eq(hardwareChecklistItems.fileId, fileId));
    
    const total = items.length;
    const packed = items.filter(item => item.isPacked).length;
    const buyoutItems = items.filter(item => item.isBuyout).length;
    const buyoutArrived = items.filter(item => item.isBuyout && item.buyoutArrived).length;
    
    return { total, packed, buyoutItems, buyoutArrived };
  }

  async replaceHardwareChecklist(fileId: number, items: InsertHardwareChecklistItem[]): Promise<HardwareChecklistItem[]> {
    // Use transaction to atomically delete + insert all items
    return await db.transaction(async (tx) => {
      // Delete existing items
      await tx.delete(hardwareChecklistItems).where(eq(hardwareChecklistItems.fileId, fileId));
      
      // Insert all new items
      if (items.length === 0) {
        return [];
      }
      
      const created = await tx.insert(hardwareChecklistItems).values(items).returning();
      return created;
    });
  }
}

export const storage = new DatabaseStorage();
