import { db } from "./db";
import {
  projects,
  orderFiles,
  ctsParts,
  ctsPartConfigs,
  pallets,
  palletFileAssignments,
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
  type BuyoutHardwareStatusNullable
} from "@shared/schema";
import { eq, desc, and, inArray } from "drizzle-orm";

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
    
    const assignments = fileIds.map(fileId => ({
      palletId,
      fileId
    }));
    
    return await db.insert(palletFileAssignments).values(assignments).returning();
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

  async updateAssignmentBuyoutStatus(id: number, buyoutHardwareStatus: BuyoutHardwareStatusNullable): Promise<PalletFileAssignment | undefined> {
    const [updated] = await db.update(palletFileAssignments)
      .set({ buyoutHardwareStatus })
      .where(eq(palletFileAssignments.id, id))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
